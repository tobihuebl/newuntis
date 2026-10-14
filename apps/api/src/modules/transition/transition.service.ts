import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Tx } from '@sp/db';
import {
  addDays,
  can,
  levelOf,
  nextClassName,
  type PolicyUser,
  type PromotionDecision,
  type PromotionSummary,
  type PromotionsView,
  type TransitionPlan,
} from '@sp/shared';
import type { z } from 'zod';
import type {
  examResultInput,
  promotionsInput,
  transitionClassesInput,
  transitionStudentsInput,
} from '@sp/shared';
import type { Principal } from '../../common/request';
import { AuditService } from '../audit/audit.service';
import { GradesService } from '../grades/grades.service';
import { currentEnrollments } from '../messages/recipients';
import { asDate, iso, todayIn } from '../timetable/data';

const emptyCounts = (): Record<PromotionDecision, number> => ({
  PROMOTE: 0,
  REPEAT: 0,
  EXAM: 0,
  LEAVE: 0,
});
const name = (p: { firstName: string; lastName: string }) => `${p.lastName} ${p.firstName}`.trim();
const minIso = (a: string, b: string) => (a < b ? a : b);

/**
 * Schuljahreswechsel (SD-05, ADR 0019). Klassenvorstand, Direktion und Administration tragen die Entscheidung
 * am Schuljahresende ein (`promotion.decide`); die Administration legt die Folgeklassen an und übernimmt die
 * Schüler:innen (`masterdata.write`). Ohne Eintrag gilt "steigt auf".
 */
@Injectable()
export class TransitionService {
  constructor(
    private readonly audit: AuditService,
    private readonly grades: GradesService,
  ) {}

  private async tz(tx: Tx, tenantId: string) {
    return (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })).timezone;
  }

  /** Aktuelles Schuljahr, das folgende (Beginn nach dessen Ende) und das vorige. */
  async years(tx: Tx) {
    const current = await tx.schoolYear.findFirst({ where: { isCurrent: true } });
    if (!current) return { current: null, next: null, previous: null };
    const [next, previous] = await Promise.all([
      tx.schoolYear.findFirst({
        where: { startsOn: { gte: current.endsOn } },
        orderBy: { startsOn: 'asc' },
      }),
      tx.schoolYear.findFirst({
        where: { endsOn: { lte: current.startsOn } },
        orderBy: { endsOn: 'desc' },
      }),
    ]);
    return { current, next, previous };
  }

  /** Schüler:innen einer Klasse am Stichtag (heute, höchstens Schuljahresende). */
  private async students(tx: Tx, classId: string, day: string) {
    const ids = (await currentEnrollments(tx, { classId: { in: [classId] } }, day)).map(
      (e) => e.studentId,
    );
    return tx.person.findMany({
      where: { id: { in: ids }, anonymizedAt: null },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    });
  }

  private async maxLevel(tx: Tx, schoolYearId: string) {
    const classes = await tx.schoolClass.findMany({
      where: { schoolYearId },
      select: { name: true },
    });
    const levels = classes.map((c) => levelOf(c.name)).filter((l): l is number => l !== null);
    return levels.length ? Math.max(...levels) : null;
  }

  // ───────────── Entscheidungen je Klasse ─────────────

  async view(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    classId: string,
  ): Promise<PromotionsView> {
    if (!can(user, 'promotion.decide', { classId }))
      throw new ForbiddenException({ title: 'Keine Berechtigung für diese Klasse' });
    const { current, next } = await this.years(tx);
    const cls = await tx.schoolClass.findUnique({ where: { id: classId } });
    if (!cls || !current || cls.schoolYearId !== current.id)
      throw new NotFoundException({ title: 'Klasse im aktuellen Schuljahr nicht gefunden' });
    const day = minIso(todayIn(await this.tz(tx, tenantId)), iso(current.endsOn));
    const [students, decisions, max] = await Promise.all([
      this.students(tx, classId, day),
      tx.promotionDecision.findMany({ where: { schoolYearId: current.id } }),
      this.maxLevel(tx, current.id),
    ]);
    // Hinweis aus den Noten: Fächer mit gewichtetem Durchschnitt bei "Nicht genügend"
    const overview = await this.grades.classOverview(tx, tenantId, me, user, classId);
    const failing = (studentId: string) => {
      const s = overview.students.find((x) => x.id === studentId);
      return overview.subjects
        .filter((sub) => (s?.averages[sub.id] ?? 0) > 4.5)
        .map((sub) => sub.code);
    };
    const byStudent = new Map(decisions.map((d) => [d.studentId, d]));
    return {
      classId,
      className: cls.name,
      finalLevel: max !== null && levelOf(cls.name) === max,
      nextYear: next ? { id: next.id, name: next.name } : null,
      canDecide: true,
      rows: students.map((s) => {
        const d = byStudent.get(s.id);
        return {
          studentId: s.id,
          name: name(s),
          decision: d?.decision ?? 'PROMOTE',
          isDefault: !d,
          note: d?.note ?? null,
          failing: failing(s.id),
        };
      }),
    };
  }

  async decide(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    input: z.infer<typeof promotionsInput>,
  ) {
    if (!can(user, 'promotion.decide', { classId: input.classId }))
      throw new ForbiddenException({ title: 'Keine Berechtigung für diese Klasse' });
    const { current } = await this.years(tx);
    if (!current) throw new UnprocessableEntityException({ title: 'Kein aktuelles Schuljahr' });
    const day = minIso(todayIn(await this.tz(tx, tenantId)), iso(current.endsOn));
    const allowed = new Set((await this.students(tx, input.classId, day)).map((s) => s.id));
    if (input.items.some((i) => !allowed.has(i.studentId)))
      throw new UnprocessableEntityException({ title: 'Die Person gehört nicht zu dieser Klasse' });
    for (const i of input.items)
      await tx.promotionDecision.upsert({
        where: { schoolYearId_studentId: { schoolYearId: current.id, studentId: i.studentId } },
        create: {
          tenantId,
          schoolYearId: current.id,
          studentId: i.studentId,
          decision: i.decision,
          note: i.note,
          decidedById: me.personId,
        },
        update: { decision: i.decision, note: i.note, decidedById: me.personId, examPassed: null },
      });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'promotion.decide',
      entity: 'class',
      entityId: input.classId,
      meta: { count: input.items.length },
    });
    return { saved: input.items.length };
  }

  /**
   * Für die Klassenseite: Stand der Entscheidungen (wenn das nächste Schuljahr angelegt ist) und im neuen
   * Schuljahr die offenen Wiederholungsprüfungen der Klasse.
   */
  async summary(
    tx: Tx,
    tenantId: string,
    user: PolicyUser,
    classId: string,
  ): Promise<PromotionSummary> {
    if (!can(user, 'promotion.decide', { classId }))
      throw new ForbiddenException({ title: 'Keine Berechtigung für diese Klasse' });
    const { current, next, previous } = await this.years(tx);
    const counts = emptyCounts();
    const out: PromotionSummary = { nextYear: null, counts, decided: 0, pendingExams: [] };
    if (!current) return out;
    const day = todayIn(await this.tz(tx, tenantId));
    const students = await this.students(tx, classId, minIso(day, iso(current.endsOn)));
    if (next) {
      out.nextYear = { id: next.id, name: next.name };
      const decisions = await tx.promotionDecision.findMany({
        where: { schoolYearId: current.id, studentId: { in: students.map((s) => s.id) } },
      });
      for (const s of students)
        counts[decisions.find((d) => d.studentId === s.id)?.decision ?? 'PROMOTE']++;
      out.decided = decisions.length;
    }
    if (previous) {
      const exams = await tx.promotionDecision.findMany({
        where: {
          schoolYearId: previous.id,
          decision: 'EXAM',
          examPassed: null,
          studentId: { in: students.map((s) => s.id) },
        },
        select: { studentId: true },
      });
      const fromClass = await this.previousClasses(
        tx,
        previous.id,
        exams.map((e) => e.studentId),
      );
      out.pendingExams = exams.map((e) => {
        const s = students.find((x) => x.id === e.studentId)!;
        return {
          studentId: e.studentId,
          name: name(s),
          fromClass: fromClass.get(e.studentId)?.name ?? '',
        };
      });
    }
    return out;
  }

  /** Klasse je Schüler:in im angegebenen Schuljahr (letzte Einschreibung). */
  private async previousClasses(tx: Tx, schoolYearId: string, studentIds: string[]) {
    const rows = await tx.enrollment.findMany({
      where: { studentId: { in: studentIds }, class: { schoolYearId } },
      orderBy: { fromDate: 'desc' },
      select: { studentId: true, class: { select: { id: true, name: true } } },
    });
    const out = new Map<string, { id: string; name: string }>();
    for (const r of rows) if (!out.has(r.studentId)) out.set(r.studentId, r.class);
    return out;
  }

  /**
   * Ergebnis der Wiederholungsprüfung im neuen Schuljahr. Nicht bestanden: Wechsel in eine Klasse der alten
   * Stufe (gleicher Name wie im Vorjahr, sonst gleiche Stufe, oder ausdrücklich gewählt).
   */
  async examResult(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    input: z.infer<typeof examResultInput>,
  ) {
    const { current, previous } = await this.years(tx);
    if (!current || !previous)
      throw new UnprocessableEntityException({ title: 'Kein vorheriges Schuljahr' });
    const day = todayIn(await this.tz(tx, tenantId));
    const now = await tx.enrollment.findFirst({
      where: {
        studentId: input.studentId,
        class: { schoolYearId: current.id },
        OR: [{ toDate: null }, { toDate: { gte: asDate(day) } }],
      },
      include: { class: true },
    });
    if (!now) throw new NotFoundException({ title: 'Keine Klasse im aktuellen Schuljahr' });
    if (!can(user, 'promotion.decide', { classId: now.classId }))
      throw new ForbiddenException({ title: 'Keine Berechtigung für diese Klasse' });
    const d = await tx.promotionDecision.findUnique({
      where: { schoolYearId_studentId: { schoolYearId: previous.id, studentId: input.studentId } },
    });
    if (!d || d.decision !== 'EXAM')
      throw new UnprocessableEntityException({ title: 'Keine offene Wiederholungsprüfung' });
    let movedTo: { id: string; name: string } | null = null;
    if (!input.passed) {
      const old = (await this.previousClasses(tx, previous.id, [input.studentId])).get(
        input.studentId,
      );
      const candidates = await tx.schoolClass.findMany({
        where: { schoolYearId: current.id },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      });
      const target = input.targetClassId
        ? candidates.find((c) => c.id === input.targetClassId)
        : (candidates.find((c) => c.name === old?.name) ??
          candidates.find((c) => old && levelOf(c.name) === levelOf(old.name)));
      if (!target)
        throw new UnprocessableEntityException({
          title: 'Keine Klasse der bisherigen Stufe gefunden. Bitte eine Klasse wählen.',
        });
      await tx.enrollment.update({
        where: { id: now.id },
        data: { toDate: asDate(addDays(day, -1)) },
      });
      await tx.enrollment.create({
        data: { tenantId, studentId: input.studentId, classId: target.id, fromDate: asDate(day) },
      });
      movedTo = target;
    }
    await tx.promotionDecision.update({
      where: { id: d.id },
      data: { examPassed: input.passed, decidedById: me.personId },
    });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'promotion.exam',
      entity: 'person',
      entityId: input.studentId,
      meta: { passed: input.passed },
    });
    return { passed: input.passed, movedTo };
  }

  // ───────────── Assistent der Administration ─────────────

  async plan(tx: Tx, tenantId: string, toYearId: string): Promise<TransitionPlan> {
    const { current } = await this.years(tx);
    const to = await tx.schoolYear.findUnique({ where: { id: toYearId } });
    if (!current || !to) throw new NotFoundException({ title: 'Schuljahr nicht gefunden' });
    if (to.startsOn < current.endsOn)
      throw new UnprocessableEntityException({
        title: 'Das Zieljahr muss nach dem aktuellen Schuljahr beginnen',
      });
    const day = minIso(todayIn(await this.tz(tx, tenantId)), iso(current.endsOn));
    const [classes, targets, decisions, max] = await Promise.all([
      tx.schoolClass.findMany({
        where: { schoolYearId: current.id },
        orderBy: { name: 'asc' },
        include: { homeroomTeacher: { select: { firstName: true, lastName: true } } },
      }),
      tx.schoolClass.findMany({
        where: { schoolYearId: to.id },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, previousClassId: true },
      }),
      tx.promotionDecision.findMany({ where: { schoolYearId: current.id } }),
      this.maxLevel(tx, current.id),
    ]);
    const enrolled = await currentEnrollments(
      tx,
      { classId: { in: classes.map((c) => c.id) } },
      day,
    );
    const people = await tx.person.findMany({
      where: { id: { in: enrolled.map((e) => e.studentId) }, anonymizedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    // Erledigt: im Zieljahr eingeschrieben, oder (Abschluss/Abgang) die alte Einschreibung endet mit dem Schuljahr
    const [inTarget, ended] = await Promise.all([
      tx.enrollment.findMany({
        where: { studentId: { in: people.map((p) => p.id) }, class: { schoolYearId: to.id } },
        select: { studentId: true },
      }),
      tx.enrollment.findMany({
        where: {
          studentId: { in: people.map((p) => p.id) },
          class: { schoolYearId: current.id },
          toDate: { lte: current.endsOn },
        },
        select: { studentId: true },
      }),
    ]);
    const done = new Set(inTarget.map((e) => e.studentId));
    const endedAtYearEnd = new Set(ended.map((e) => e.studentId));
    const decisionOf = (id: string): PromotionDecision =>
      decisions.find((d) => d.studentId === id)?.decision ?? 'PROMOTE';
    const students = people
      .map((p) => {
        const e = enrolled.find((x) => x.studentId === p.id)!;
        const from = classes.find((c) => c.id === e.classId)!;
        const decision = decisionOf(p.id);
        return {
          studentId: p.id,
          name: name(p),
          fromClass: from.name,
          decision,
          target: this.target(from, decision, targets, max),
          done:
            done.has(p.id) ||
            (endedAtYearEnd.has(p.id) && this.target(from, decision, targets, max) === null),
        };
      })
      .sort(
        (a, b) =>
          a.fromClass.localeCompare(b.fromClass, 'de') || a.name.localeCompare(b.name, 'de'),
      );
    return {
      fromYear: { id: current.id, name: current.name, endsOn: iso(current.endsOn) },
      toYear: { id: to.id, name: to.name, startsOn: iso(to.startsOn) },
      maxLevel: max,
      classes: classes.map((c) => {
        const counts = emptyCounts();
        for (const e of enrolled.filter((x) => x.classId === c.id))
          counts[decisionOf(e.studentId)]++;
        const level = levelOf(c.name);
        const successor = targets.find((t) => t.previousClassId === c.id);
        return {
          id: c.id,
          name: c.name,
          level,
          students: enrolled.filter((x) => x.classId === c.id).length,
          homeroom: c.homeroomTeacher
            ? `${c.homeroomTeacher.firstName} ${c.homeroomTeacher.lastName}`
            : null,
          successor: successor ? { id: successor.id, name: successor.name } : null,
          suggestion: max !== null && level === max ? null : nextClassName(c.name),
          counts,
        };
      }),
      targetClasses: targets,
      students,
    };
  }

  /**
   * Zielklasse: aufsteigen und Wiederholungsprüfung → Folgeklasse (letzte Stufe: abschließen = keine Klasse);
   * wiederholen → Klasse gleichen Namens im neuen Jahr, sonst gleiche Stufe; verlassen → keine.
   */
  private target(
    from: { id: string; name: string },
    decision: PromotionDecision,
    targets: { id: string; name: string; previousClassId: string | null }[],
    max: number | null,
  ): { id: string; name: string } | null {
    const pick = (t?: { id: string; name: string }) => (t ? { id: t.id, name: t.name } : null);
    if (decision === 'LEAVE') return null;
    if (decision === 'REPEAT')
      return pick(
        targets.find((t) => t.name === from.name) ??
          targets.find((t) => levelOf(t.name) !== null && levelOf(t.name) === levelOf(from.name)),
      );
    const successor = targets.find((t) => t.previousClassId === from.id);
    if (!successor && decision === 'PROMOTE' && max !== null && levelOf(from.name) === max)
      return null;
    return pick(successor);
  }

  async createClasses(
    tx: Tx,
    tenantId: string,
    me: Principal,
    input: z.infer<typeof transitionClassesInput>,
  ) {
    const plan = await this.plan(tx, tenantId, input.toYearId);
    let created = 0;
    const existing = new Map(plan.targetClasses.map((t) => [t.name, t]));
    for (const item of input.items) {
      const from = plan.classes.find((c) => c.id === item.fromClassId);
      if (!from || !item.name || from.successor) continue;
      const old = await tx.schoolClass.findUniqueOrThrow({ where: { id: from.id } });
      const homeroom = item.takeHomeroom ? old.homeroomTeacherId : null;
      const same = existing.get(item.name);
      const cls = same
        ? await tx.schoolClass.update({
            where: { id: same.id },
            data: { previousClassId: from.id },
          })
        : await tx.schoolClass.create({
            data: {
              tenantId,
              schoolYearId: input.toYearId,
              name: item.name,
              previousClassId: from.id,
              homeroomTeacherId: homeroom,
            },
          });
      if (!same) {
        created++;
        existing.set(cls.name, { id: cls.id, name: cls.name, previousClassId: from.id });
        if (homeroom)
          await tx.roleAssignment.create({
            data: { tenantId, personId: homeroom, role: 'HOMEROOM', classId: cls.id },
          });
      }
    }
    for (const n of input.newClasses)
      if (!existing.has(n)) {
        const cls = await tx.schoolClass.create({
          data: { tenantId, schoolYearId: input.toYearId, name: n },
        });
        existing.set(n, { id: cls.id, name: n, previousClassId: null });
        created++;
      }
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'transition.classes',
      entity: 'schoolYear',
      entityId: input.toYearId,
      meta: { created },
    });
    return { created };
  }

  /**
   * Schüler:innen übernehmen: neue Einschreibung ab Beginn des Zieljahres, alte endet mit dem Schuljahresende.
   * Wer schon im Zieljahr eingeschrieben ist, bleibt unverändert (wiederholbar).
   */
  async applyStudents(
    tx: Tx,
    tenantId: string,
    me: Principal,
    input: z.infer<typeof transitionStudentsInput>,
  ) {
    const plan = await this.plan(tx, tenantId, input.toYearId);
    const targetIds = new Set(plan.targetClasses.map((t) => t.id));
    const todo = plan.students.filter((s) => !s.done);
    const resolved = todo.map((s) => {
      const override = input.targets[s.studentId];
      const target =
        override && targetIds.has(override)
          ? plan.targetClasses.find((t) => t.id === override)!
          : s.target;
      const leaves =
        s.decision === 'LEAVE' ||
        (s.decision === 'PROMOTE' &&
          !target &&
          plan.maxLevel !== null &&
          levelOf(s.fromClass) === plan.maxLevel);
      return { ...s, target, leaves };
    });
    const missing = resolved.filter((s) => !s.target && !s.leaves);
    if (missing.length)
      throw new UnprocessableEntityException({
        title: 'Für einige Schüler:innen fehlt die Klasse im neuen Schuljahr',
        missing: missing.map((s) => ({
          studentId: s.studentId,
          name: s.name,
          fromClass: s.fromClass,
        })),
      });
    const endsOn = asDate(plan.fromYear.endsOn);
    const startsOn = asDate(plan.toYear.startsOn);
    const counts = { ...emptyCounts(), moved: 0 } as Record<PromotionDecision | 'moved', number>;
    for (const s of resolved) {
      await tx.enrollment.updateMany({
        where: {
          studentId: s.studentId,
          class: { schoolYearId: plan.fromYear.id },
          OR: [{ toDate: null }, { toDate: { gt: endsOn } }],
        },
        data: { toDate: endsOn },
      });
      if (s.target) {
        await tx.enrollment.create({
          data: { tenantId, studentId: s.studentId, classId: s.target.id, fromDate: startsOn },
        });
        counts.moved++;
      }
      counts[s.decision]++;
    }
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'transition.students',
      entity: 'schoolYear',
      entityId: input.toYearId,
      meta: counts,
    });
    return { ...counts, total: resolved.length };
  }
}
