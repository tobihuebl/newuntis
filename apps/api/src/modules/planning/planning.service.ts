import { randomInt } from 'node:crypto';
import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type { Prisma, Tx } from '@sp/db';
import {
  checkConstraints,
  describeConstraint,
  requirementCoverage,
  solveTimetable,
  tenantSettingsSchema,
  unplacedMessage,
  validateTimetable,
  type LessonRule,
  type PlanningConstraint,
  type PlanningRunItem,
  type PlanningRunStats,
  type PlanningScope,
  type TranslateDirectory,
  type UnplacedReason,
} from '@sp/shared';
import { ENV, type Env } from '../../config/env';
import { AuditService } from '../audit/audit.service';
import { QueueService } from '../jobs/queue.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  asDate,
  iso,
  lessonInclude,
  loadValidationContext,
  toRule,
  todayIn,
} from '../timetable/data';

export const QUEUE_PLANNING = 'planning-run';

type ConstraintRow = Prisma.PlanningConstraintGetPayload<object>;
type RunRow = Prisma.PlanningRunGetPayload<object>;

/** Name einer Lehrkraft für Anzeigen ("Anna Huber"). */
const personName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

/**
 * Stundenplan-Assistent (M7, ADR 0012): Wünsche, Läufe des Solvers und das Schreiben des Vorschlags als neuer
 * Entwurf. Läufe gehen über die Job-Queue; ohne laufende Queue (Tests, JOBS_ENABLED=false) direkt in der Anfrage.
 */
@Injectable()
export class PlanningService implements OnModuleInit {
  private readonly logger = new Logger(PlanningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit() {
    this.queue.register<{ tenantId: string; runId: string }>(QUEUE_PLANNING, async (d) => {
      try {
        await this.prisma.runAsTenant(d.tenantId, (tx) => this.execute(tx, d.tenantId, d.runId), {
          timeoutMs: 300_000,
        });
      } catch (err) {
        this.logger.error(
          `Planungslauf fehlgeschlagen: ${err instanceof Error ? err.message : 'unbekannt'}`,
        );
        await this.prisma.runAsTenant(d.tenantId, (tx) =>
          tx.planningRun.update({
            where: { id: d.runId },
            data: {
              status: 'FAILED',
              error: 'Der Lauf ist fehlgeschlagen.',
              finishedAt: new Date(),
            },
          }),
        );
      }
    });
  }

  get aiConfigured(): boolean {
    return !!this.env.AI_GATEWAY_API_KEY;
  }

  /** Zugang zum Vercel AI Gateway (nur aus der Umgebung), sonst null. */
  get ai(): { apiKey: string; model: string } | null {
    return this.env.AI_GATEWAY_API_KEY
      ? { apiKey: this.env.AI_GATEWAY_API_KEY, model: this.env.AI_GATEWAY_MODEL }
      : null;
  }

  async settings(tx: Tx, tenantId: string) {
    const t = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { settings: true, timezone: true },
    });
    return { s: tenantSettingsSchema.parse(t.settings), tz: t.timezone };
  }

  /** Paket "Komplett" (ADR 0012): sonst 403 mit verständlichem Grund. */
  async assertEnabled(tx: Tx, tenantId: string) {
    const { s } = await this.settings(tx, tenantId);
    if (!s.features.autoPlanning)
      throw new ForbiddenException({
        title: 'Der Stundenplan-Assistent ist für diese Schule nicht freigeschaltet.',
      });
  }

  /** Stammdaten des Schuljahres für Übersetzer, Zusammenfassungen und Meldungen. */
  async directory(
    tx: Tx,
    schoolYearId: string,
  ): Promise<TranslateDirectory & { groups: { id: string; name: string }[] }> {
    const [teachers, subjects, classes, groups, rooms, periods] = await Promise.all([
      tx.person.findMany({
        where: { kind: 'TEACHER', anonymizedAt: null },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true },
      }),
      tx.subject.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true },
      }),
      tx.schoolClass.findMany({
        where: { schoolYearId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      tx.group.findMany({
        where: { schoolYearId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      tx.room.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      tx.period.findMany({ select: { number: true } }),
    ]);
    return {
      teachers,
      subjects,
      classes,
      groups,
      rooms,
      maxPeriod: Math.max(0, ...periods.map((p) => p.number)),
    };
  }

  namesOf(dir: Awaited<ReturnType<PlanningService['directory']>>) {
    const pick = <T extends { id: string }>(list: T[], label: (t: T) => string) => {
      const m = new Map(list.map((x) => [x.id, label(x)]));
      return (id: string) => m.get(id) ?? '–';
    };
    return {
      teacher: pick(dir.teachers, personName),
      subject: pick(dir.subjects, (s) => s.name),
      cls: pick(dir.classes, (c) => c.name),
      group: pick(dir.groups, (g) => g.name),
      room: pick(dir.rooms, (r) => r.name),
    };
  }

  toConstraint(r: ConstraintRow): PlanningConstraint {
    return {
      id: r.id,
      kind: r.kind,
      hard: r.hard,
      active: r.active,
      teacherId: r.teacherId,
      classId: r.classId,
      subjectId: r.subjectId,
      roomIds: r.roomIds,
      weekday: r.weekday,
      periods: r.periods,
      max: r.max,
      source: r.source,
      text: r.text,
    };
  }

  async constraints(tx: Tx, schoolYearId: string): Promise<PlanningConstraint[]> {
    const rows = await tx.planningConstraint.findMany({
      where: { schoolYearId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => this.toConstraint(r));
  }

  async constraintItems(tx: Tx, schoolYearId: string) {
    const [list, dir] = await Promise.all([
      this.constraints(tx, schoolYearId),
      this.directory(tx, schoolYearId),
    ]);
    const names = this.namesOf(dir);
    return list.map((c) => ({ ...c, summary: describeConstraint(c, names) }));
  }

  /** Personennamen außer Lehrkräften: gehen nie an die KI (werden zu "[Person]"). */
  async otherNames(tx: Tx): Promise<string[]> {
    const people = await tx.person.findMany({
      where: { kind: { not: 'TEACHER' }, anonymizedAt: null },
      select: { firstName: true, lastName: true },
    });
    return [...new Set(people.flatMap((p) => [p.firstName, p.lastName]))];
  }

  toRunItem(r: RunRow): PlanningRunItem {
    return {
      id: r.id,
      status: r.status,
      scope: r.scope as PlanningScope,
      seed: r.seed,
      sourceVersionId: r.sourceVersionId,
      resultVersionId: r.resultVersionId,
      stats: (r.stats as PlanningRunStats | null) ?? null,
      unplaced: (r.unplaced as PlanningRunItem['unplaced'] | null) ?? [],
      error: r.error,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    };
  }

  /** Lauf anlegen und einstellen; ohne Queue sofort ausführen. */
  async start(
    tx: Tx,
    tenantId: string,
    actorId: string,
    input: { sourceVersionId: string; scope: PlanningScope; seed?: number },
  ): Promise<PlanningRunItem> {
    const source = await tx.timetableVersion.findUnique({
      where: { id: input.sourceVersionId },
      select: { id: true, schoolYearId: true, _count: { select: { requirements: true } } },
    });
    if (!source) throw new NotFoundException({ title: 'Version nicht gefunden' });
    const run = await tx.planningRun.create({
      data: {
        tenantId,
        schoolYearId: source.schoolYearId,
        sourceVersionId: source.id,
        scope: input.scope,
        seed: input.seed ?? randomInt(1, 2_147_483_647),
        createdById: actorId,
      },
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'planning.run',
      entity: 'planningRun',
      entityId: run.id,
    });
    const job = await this.queue.send(QUEUE_PLANNING, { tenantId, runId: run.id }, {}, tx);
    if (job === null) await this.execute(tx, tenantId, run.id);
    return this.toRunItem(await tx.planningRun.findUniqueOrThrow({ where: { id: run.id } }));
  }

  /**
   * Führt einen Lauf aus: Soll-Stunden und feste Stunden laden, Solver mit Startwert, Ergebnis als neuer Entwurf
   * (Soll-Stunden kopiert, feste Stunden mit Markierung übernommen), Kennzahlen und Begründungen speichern.
   */
  async execute(tx: Tx, tenantId: string, runId: string): Promise<void> {
    const run = await tx.planningRun.findUnique({ where: { id: runId } });
    if (!run || run.status !== 'QUEUED' || !run.sourceVersionId) return;
    await tx.planningRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    const t0 = Date.now();

    const source = await tx.timetableVersion.findUniqueOrThrow({
      where: { id: run.sourceVersionId },
      include: {
        schoolYear: true,
        requirements: true,
        lessons: { include: lessonInclude, orderBy: [{ weekday: 'asc' }, { periodStart: 'asc' }] },
      },
    });
    const { s, tz } = await this.settings(tx, tenantId);
    const today = todayIn(tz);
    const [ctx, constraints, dir] = await Promise.all([
      loadValidationContext(tx, source.schoolYearId, today),
      this.constraints(tx, source.schoolYearId),
      this.directory(tx, source.schoolYearId),
    ]);
    const scope = run.scope as PlanningScope;
    const inScope = (l: LessonRule & { pinned: boolean }) =>
      !l.pinned &&
      (scope.kind === 'all' ||
        (scope.kind === 'classes' && !!l.classId && scope.ids.includes(l.classId)) ||
        (scope.kind === 'teachers' && l.teacherIds.some((id) => scope.ids.includes(id))));
    const rules = source.lessons.map(toRule);
    const fixed = rules.filter((l) => !inScope(l));
    const requirements = source.requirements
      .filter(
        (r) =>
          scope.kind === 'all' ||
          (scope.kind === 'classes' && !!r.classId && scope.ids.includes(r.classId)) ||
          (scope.kind === 'teachers' && scope.ids.includes(r.teacherId)),
      )
      .map((r) => ({
        id: r.id,
        subjectId: r.subjectId,
        classId: r.classId,
        groupId: r.groupId,
        teacherId: r.teacherId,
        hoursPerWeek: r.hoursPerWeek,
        preferDouble: r.preferDouble,
      }));

    const result = solveTimetable({
      periods: ctx.periods,
      requirements,
      fixed,
      rooms: Object.entries(ctx.roomCapacity).map(([id, capacity]) => ({ id, capacity })),
      classStudents: ctx.classStudents,
      groupMembers: ctx.groupMembers,
      constraints,
      dayLoadMax: s.timetable.dayLoadMax,
      seed: run.seed,
    });

    // Neuer Entwurf mit festen und geplanten Stunden
    const validFrom =
      iso(source.schoolYear.startsOn) > today ? iso(source.schoolYear.startsOn) : today;
    const version = await tx.timetableVersion.create({
      data: {
        tenantId,
        schoolYearId: source.schoolYearId,
        name: `Vorschlag ${new Intl.DateTimeFormat('de-AT', { dateStyle: 'short', timeStyle: 'short', timeZone: tz }).format(new Date())}`,
        validFrom: asDate(validFrom),
      },
    });
    if (source.requirements.length)
      await tx.lessonRequirement.createMany({
        data: source.requirements.map((r) => ({
          tenantId,
          versionId: version.id,
          subjectId: r.subjectId,
          classId: r.classId,
          groupId: r.groupId,
          teacherId: r.teacherId,
          hoursPerWeek: r.hoursPerWeek,
          preferDouble: r.preferDouble,
        })),
      });
    const all = [
      ...fixed.map((l) => ({ ...l, pinned: l.pinned })),
      ...result.lessons.map((l) => ({ ...l, pinned: false })),
    ];
    const created = await tx.lesson.createManyAndReturn({
      data: all.map((l) => ({
        tenantId,
        versionId: version.id,
        subjectId: l.subjectId,
        classId: l.classId,
        groupId: l.groupId,
        roomId: l.roomId,
        weekday: l.weekday,
        periodStart: l.periodStart,
        periodCount: l.periodCount,
        weekPattern: l.weekPattern,
        pinned: l.pinned,
      })),
      select: { id: true },
    });
    const teacherRows = created.flatMap((row, i) =>
      [...new Set(all[i]!.teacherIds)].map((teacherId) => ({
        tenantId,
        lessonId: row.id,
        teacherId,
      })),
    );
    if (teacherRows.length) await tx.lessonTeacher.createMany({ data: teacherRows });

    // Kennzahlen aus den maßgeblichen Prüfungen (nicht aus dem Solver selbst)
    const finalRules: LessonRule[] = all.map((l, i) => ({ ...l, id: created[i]!.id }));
    const conflicts = [
      ...validateTimetable(finalRules, { ...ctx, soft: { dayLoadMax: s.timetable.dayLoadMax } }),
      ...checkConstraints(finalRules, constraints),
    ];
    const soft: Record<string, number> = {};
    for (const c of conflicts) if (c.severity === 'soft') soft[c.code] = (soft[c.code] ?? 0) + 1;
    const coverage = requirementCoverage(
      source.requirements.map((r) => ({ ...r })),
      finalRules,
    );
    const stats: PlanningRunStats = {
      units: result.stats.units,
      placed: result.stats.placed,
      repaired: result.stats.repaired,
      ms: Date.now() - t0,
      hard: conflicts.filter((c) => c.severity === 'hard').length,
      soft,
      required: coverage.reduce((a, c) => a + c.required, 0),
      planned: coverage.reduce((a, c) => a + Math.min(c.planned, c.required), 0),
    };
    const names = this.namesOf(dir);
    const reqById = new Map(source.requirements.map((r) => [r.id, r]));
    const unplaced = result.unplaced.map((u) => {
      const r = reqById.get(u.requirementId)!;
      const who = r.classId ? names.cls(r.classId) : r.groupId ? names.group(r.groupId) : '';
      return {
        ...u,
        reason: u.reason as UnplacedReason,
        message: unplacedMessage(u.reason, names.subject(r.subjectId), who),
      };
    });

    await tx.planningRun.update({
      where: { id: runId },
      data: {
        status: 'DONE',
        resultVersionId: version.id,
        stats: stats as unknown as Prisma.InputJsonValue,
        unplaced: unplaced as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
  }
}
