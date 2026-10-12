import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  type OnModuleInit,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma, Tx } from '@sp/db';
import {
  addDays,
  can,
  type AttendanceItemInput,
  type AttendanceState,
  type ClassbookEntryState,
  type ClassbookInput,
  type ClassbookProgress,
  type OccurrenceDetail,
  type OpenEntry,
  type PolicyUser,
} from '@sp/shared';
import type { Principal } from '../../common/request';
import { AbsencesService } from '../absences/absences.service';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';
import { QueueService } from '../jobs/queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { asDate, iso, todayIn } from '../timetable/data';
import { PlansService, rawFromOccurrence } from '../timetable/plans.service';

/** Wie weit zurück offene Einträge gesucht und offline vorgehalten werden. */
export const OPEN_LOOKBACK_DAYS = 60;
/** Termine der nächsten Tage für den Offline-Zwischenspeicher (Spec Abschnitt 12). */
export const PREFETCH_DAYS = 7;
const PREFETCH_MAX = 120;

const occurrenceInclude = {
  teachers: { select: { teacherId: true } },
  classbook: true,
  attendances: {
    select: { studentId: true, status: true, lateMinutes: true, clientUpdatedAt: true },
  },
  substitution: { select: { kind: true, status: true } },
} satisfies Prisma.OccurrenceInclude;
type OccurrenceRow = Prisma.OccurrenceGetPayload<{ include: typeof occurrenceInclude }>;

export const entryState = (
  e: {
    topic: string | null;
    homework: string | null;
    homeworkDueOn: Date | null;
    closedAt: Date | null;
    version: number;
  } | null,
): ClassbookEntryState | null =>
  e && {
    topic: e.topic,
    homework: e.homework,
    homeworkDueOn: e.homeworkDueOn ? iso(e.homeworkDueOn) : null,
    closedAt: e.closedAt?.toISOString() ?? null,
    version: e.version,
  };

export function progressOf(o: {
  classbook: { closedAt: Date | null } | null;
  _count?: { attendances: number };
  attendances?: unknown[];
}): ClassbookProgress {
  if (o.classbook?.closedAt) return 'closed';
  const attendances = o._count?.attendances ?? o.attendances?.length ?? 0;
  return o.classbook || attendances > 0 ? 'started' : 'none';
}

/**
 * Klassenbuch (KB-01 bis KB-06): Anwesenheit, Stoff, Hausübung und Abschluss hängen immer am Termin.
 * Schreibrechte: Lehrkräfte des Termins (wirksame Lehrer nach Supplierung) und die Direktion (Korrektur).
 */
@Injectable()
export class ClassbookService implements OnModuleInit {
  private readonly logger = new Logger(ClassbookService.name);

  constructor(
    private readonly plans: PlansService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
    private readonly absences: AbsencesService,
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly notifications: NotificationsService,
  ) {}

  /** KB-04: werktags am Nachmittag Hinweis an Lehrkräfte mit offenen Einträgen (In-App, Push optional). */
  onModuleInit(): void {
    this.queue.register('classbook-open-daily', () => this.remindAllTenants(), {
      cron: '0 15 * * 1-5',
    });
  }

  async remindAllTenants(): Promise<void> {
    const tenants = await this.prisma.client.tenant.findMany({ select: { id: true, slug: true } });
    for (const t of tenants) {
      try {
        await this.prisma.runAsTenant(t.id, (tx) => this.remindOpen(tx, t.id));
      } catch (err) {
        this.logger.error(
          `Klassenbuch-Hinweis ${t.slug}: ${err instanceof Error ? err.message : ''}`,
        );
      }
    }
  }

  async remindOpen(tx: Tx, tenantId: string): Promise<number> {
    const today = todayIn(await this.timezone(tx, tenantId));
    const rows = await tx.occurrenceTeacher.findMany({
      where: {
        occurrence: {
          status: { not: 'CANCELLED' },
          endsAt: { lte: new Date() },
          date: { gte: asDate(addDays(today, -OPEN_LOOKBACK_DAYS)) },
          OR: [{ classbook: { is: null } }, { classbook: { is: { closedAt: null } } }],
        },
      },
      select: { teacherId: true },
      distinct: ['teacherId'],
    });
    await this.notifications.emit(
      tx,
      tenantId,
      'classbook.open',
      rows.map((r) => r.teacherId),
      { url: '/klassenbuch' },
    );
    return rows.length;
  }

  async timezone(tx: Tx, tenantId: string): Promise<string> {
    return (
      await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })
    ).timezone;
  }

  private async load(tx: Tx, id: string): Promise<OccurrenceRow> {
    const o = await tx.occurrence.findUnique({ where: { id }, include: occurrenceInclude });
    if (!o) throw new NotFoundException({ title: 'Termin nicht gefunden' });
    return o;
  }

  private teacherIds(o: OccurrenceRow): string[] {
    return o.teachers.map((t) => t.teacherId);
  }

  /** Schreibrecht für genau diesen Termin; sonst 403. */
  private assertWrite(user: PolicyUser, o: OccurrenceRow): void {
    if (
      !can(user, 'classbook.write', {
        teacherIds: this.teacherIds(o),
        classId: o.classId ?? undefined,
      })
    )
      throw new ForbiddenException({ title: 'Keine Berechtigung für diese Stunde' });
    if (o.status === 'CANCELLED')
      throw new UnprocessableEntityException({
        title: 'Die Stunde entfällt, kein Klassenbuch nötig',
      });
  }

  /** Schülerliste je Termin: Klasse (Einschreibung am Tag) oder Gruppe; anonymisierte Personen nicht. */
  private async students(tx: Tx, rows: OccurrenceRow[]) {
    const classIds = [...new Set(rows.flatMap((o) => (o.classId ? [o.classId] : [])))];
    const groupIds = [...new Set(rows.flatMap((o) => (o.groupId ? [o.groupId] : [])))];
    const dates = rows.map((o) => o.date.getTime());
    const [enrollments, members] = await Promise.all([
      classIds.length
        ? tx.enrollment.findMany({
            where: {
              classId: { in: classIds },
              fromDate: { lte: new Date(Math.max(...dates)) },
              OR: [{ toDate: null }, { toDate: { gte: new Date(Math.min(...dates)) } }],
              student: { anonymizedAt: null },
            },
            select: {
              classId: true,
              fromDate: true,
              toDate: true,
              student: { select: { id: true, firstName: true, lastName: true } },
            },
          })
        : Promise.resolve([]),
      groupIds.length
        ? tx.groupMember.findMany({
            where: { groupId: { in: groupIds }, student: { anonymizedAt: null } },
            select: {
              groupId: true,
              student: { select: { id: true, firstName: true, lastName: true } },
            },
          })
        : Promise.resolve([]),
    ]);
    const sort = (xs: { id: string; firstName: string; lastName: string }[]) =>
      [...new Map(xs.map((x) => [x.id, x])).values()].sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName, 'de') ||
          a.firstName.localeCompare(b.firstName, 'de'),
      );
    return (o: OccurrenceRow) =>
      o.classId
        ? sort(
            enrollments
              .filter(
                (e) =>
                  e.classId === o.classId &&
                  e.fromDate <= o.date &&
                  (e.toDate === null || e.toDate >= o.date),
              )
              .map((e) => e.student),
          )
        : sort(members.filter((m) => m.groupId === o.groupId).map((m) => m.student));
  }

  private async details(
    tx: Tx,
    rows: OccurrenceRow[],
    user: PolicyUser,
    today: string,
  ): Promise<OccurrenceDetail[]> {
    if (rows.length === 0) return [];
    const [entries, studentsOf] = await Promise.all([
      this.plans.toEntries(tx, rows.map(rawFromOccurrence)),
      this.students(tx, rows),
    ]);
    const byId = new Map(entries.map((e) => [e.id, e]));
    return rows.map((o) => {
      const e = byId.get(o.id)!;
      const canWrite =
        o.status !== 'CANCELLED' &&
        can(user, 'classbook.write', {
          teacherIds: this.teacherIds(o),
          classId: o.classId ?? undefined,
        });
      const attendance: Record<string, AttendanceState> = {};
      for (const a of o.attendances)
        attendance[a.studentId] = {
          status: a.status,
          lateMinutes: a.lateMinutes,
          clientUpdatedAt: a.clientUpdatedAt?.toISOString() ?? null,
        };
      return {
        id: o.id,
        date: e.date,
        periodStart: e.periodStart,
        periodCount: e.periodCount,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        status: e.status,
        subject: e.subject,
        class: e.class,
        group: e.group,
        room: e.room,
        teachers: e.teachers,
        substitution:
          o.substitution && o.substitution.status === 'PUBLISHED'
            ? { kind: o.substitution.kind }
            : null,
        students: studentsOf(o),
        attendance,
        entry: entryState(o.classbook),
        canWrite,
        canClose: canWrite && e.date <= today,
      };
    });
  }

  /** Ein Termin für den Klassenbuch-Screen; Lesen fremder Stunden wird protokolliert. */
  async detail(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    id: string,
  ): Promise<OccurrenceDetail> {
    const o = await this.load(tx, id);
    const own = this.teacherIds(o).includes(me.personId);
    const readable =
      own ||
      can(user, 'classbook.write', { teacherIds: this.teacherIds(o) }) ||
      (o.classId !== null && can(user, 'attendance.read', { classId: o.classId }));
    if (!readable) throw new ForbiddenException({ title: 'Keine Berechtigung für diese Stunde' });
    if (!own)
      await this.audit.record({
        tenantId,
        actorId: me.personId,
        action: 'classbook.read',
        entity: 'occurrence',
        entityId: o.id,
      });
    const today = todayIn(await this.timezone(tx, tenantId));
    return (await this.details(tx, [o], user, today))[0]!;
  }

  private ownOpenWhere(personId: string, today: string, now: Date): Prisma.OccurrenceWhereInput {
    return {
      teachers: { some: { teacherId: personId } },
      status: { not: 'CANCELLED' },
      endsAt: { lte: now },
      date: { gte: asDate(addDays(today, -OPEN_LOOKBACK_DAYS)) },
      OR: [{ classbook: { is: null } }, { classbook: { is: { closedAt: null } } }],
    };
  }

  async openCount(tx: Tx, personId: string, today: string): Promise<number> {
    return tx.occurrence.count({ where: this.ownOpenWhere(personId, today, new Date()) });
  }

  /** KB-04: vergangene eigene Stunden ohne Abschluss, älteste zuerst. */
  async open(tx: Tx, tenantId: string, personId: string): Promise<OpenEntry[]> {
    const today = todayIn(await this.timezone(tx, tenantId));
    const rows = await tx.occurrence.findMany({
      where: this.ownOpenWhere(personId, today, new Date()),
      include: {
        teachers: { select: { teacherId: true } },
        classbook: { select: { closedAt: true } },
        _count: { select: { attendances: true } },
      },
      orderBy: [{ startsAt: 'asc' }],
      take: 200,
    });
    const progress = new Map(rows.map((o) => [o.id, progressOf(o)]));
    return (await this.plans.toEntries(tx, rows.map(rawFromOccurrence))).map((e) => ({
      ...e,
      classbook: progress.get(e.id) ?? 'none',
    }));
  }

  /** Offline-Paket der Lehrkraft: offene Einträge und eigene Stunden der nächsten Tage samt Schülerlisten. */
  async prefetch(
    tx: Tx,
    tenantId: string,
    personId: string,
    user: PolicyUser,
  ): Promise<OccurrenceDetail[]> {
    const today = todayIn(await this.timezone(tx, tenantId));
    const rows = await tx.occurrence.findMany({
      where: {
        OR: [
          this.ownOpenWhere(personId, today, new Date()),
          {
            teachers: { some: { teacherId: personId } },
            status: { not: 'CANCELLED' },
            date: { gte: asDate(today), lte: asDate(addDays(today, PREFETCH_DAYS)) },
          },
        ],
      },
      include: occurrenceInclude,
      orderBy: [{ startsAt: 'asc' }],
      take: PREFETCH_MAX,
    });
    return this.details(tx, rows, user, today);
  }

  /** Stoff und Hausübung mit optimistischer Sperre; Wiederholung derselben Änderung liefert denselben Stand. */
  async saveEntry(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    id: string,
    input: ClassbookInput,
  ): Promise<{ entry: ClassbookEntryState }> {
    const o = await this.load(tx, id);
    this.assertWrite(user, o);
    const current = o.classbook;
    if (current && current.lastMutationId === input.clientMutationId)
      return { entry: entryState(current)! };
    const conflict = () =>
      new ConflictException({
        title: 'Der Eintrag wurde inzwischen auf einem anderen Gerät geändert',
        current: entryState(current),
      });
    if ((current?.version ?? 0) !== input.baseVersion) throw conflict();
    const data = {
      topic: input.topic,
      homework: input.homework,
      homeworkDueOn: input.homework && input.homeworkDueOn ? asDate(input.homeworkDueOn) : null,
      updatedById: me.personId,
      lastMutationId: input.clientMutationId,
    };
    let saved;
    if (!current) {
      saved = await tx.classbookEntry.create({ data: { tenantId, occurrenceId: o.id, ...data } });
    } else {
      // Bedingtes Update: schützt auch gegen gleichzeitige Anfragen zwischen Lesen und Schreiben.
      const r = await tx.classbookEntry.updateMany({
        where: { id: current.id, version: input.baseVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (r.count === 0) throw conflict();
      saved = await tx.classbookEntry.findUniqueOrThrow({ where: { id: current.id } });
    }
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'classbook.write',
      entity: 'occurrence',
      entityId: o.id,
    });
    await this.events.emit(tx, tenantId, 'occurrence.updated', [o.id], this.teacherIds(o));
    return { entry: entryState(saved)! };
  }

  /**
   * Anwesenheit pro Schüler:in: "letzte Änderung gewinnt" nach Gerätezeit (höchstens Serverzeit,
   * damit eine vorgehende Uhr nicht dauerhaft gewinnt). Wiederholte Mutationen ändern nichts.
   */
  async saveAttendance(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    id: string,
    items: AttendanceItemInput[],
  ): Promise<{ attendance: Record<string, AttendanceState>; applied: number }> {
    const o = await this.load(tx, id);
    this.assertWrite(user, o);
    const allowed = new Set((await this.students(tx, [o]))(o).map((s) => s.id));
    const unknown = items.filter((i) => !allowed.has(i.studentId));
    if (unknown.length)
      throw new UnprocessableEntityException({
        title: 'Schüler:in gehört nicht zu dieser Stunde',
        errors: unknown.map((i) => ({ field: 'studentId', message: i.studentId })),
      });
    const now = Date.now();
    const existing = new Map(o.attendances.map((a) => [a.studentId, a]));
    const byMutation = new Set(
      (
        await tx.attendance.findMany({
          where: { clientMutationId: { in: items.map((i) => i.clientMutationId) } },
          select: { clientMutationId: true },
        })
      ).map((a) => a.clientMutationId),
    );
    let applied = 0;
    for (const item of items) {
      if (byMutation.has(item.clientMutationId)) continue;
      const at = new Date(Math.min(Date.parse(item.clientUpdatedAt), now));
      const prev = existing.get(item.studentId);
      if (prev?.clientUpdatedAt && prev.clientUpdatedAt > at) continue; // neuere Änderung liegt schon vor
      const data = {
        status: item.status,
        lateMinutes: item.status === 'LATE' ? (item.lateMinutes ?? null) : null,
        recordedById: me.personId,
        clientMutationId: item.clientMutationId,
        clientUpdatedAt: at,
      };
      await tx.attendance.upsert({
        where: { occurrenceId_studentId: { occurrenceId: o.id, studentId: item.studentId } },
        create: { tenantId, occurrenceId: o.id, studentId: item.studentId, ...data },
        update: data,
      });
      existing.set(item.studentId, { studentId: item.studentId, ...data });
      applied++;
    }
    if (applied > 0) {
      // "abwesend" im Klassenbuch erzeugt bzw. ändert offene Fehlzeiten (Spec Abschnitt 11)
      await this.absences.syncFromClassbook(
        tx,
        tenantId,
        o.date,
        [...new Set(items.map((i) => i.studentId))],
        me.personId,
      );
      await this.audit.record({
        tenantId,
        actorId: me.personId,
        action: 'attendance.write',
        entity: 'occurrence',
        entityId: o.id,
        meta: { count: applied },
      });
      await this.events.emit(tx, tenantId, 'occurrence.updated', [o.id], this.teacherIds(o));
    }
    const attendance: Record<string, AttendanceState> = {};
    for (const [studentId, a] of existing)
      attendance[studentId] = {
        status: a.status,
        lateMinutes: a.lateMinutes,
        clientUpdatedAt: a.clientUpdatedAt?.toISOString() ?? null,
      };
    return { attendance, applied };
  }

  /** Stunde abschließen (KB-03): fehlende Anwesenheit wird als "anwesend" festgehalten. Idempotent. */
  async close(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    id: string,
  ): Promise<{ entry: ClassbookEntryState }> {
    const o = await this.load(tx, id);
    this.assertWrite(user, o);
    if (o.classbook?.closedAt) return { entry: entryState(o.classbook)! };
    const today = todayIn(await this.timezone(tx, tenantId));
    if (iso(o.date) > today)
      throw new UnprocessableEntityException({ title: 'Die Stunde liegt in der Zukunft' });
    const students = (await this.students(tx, [o]))(o);
    const recorded = new Set(o.attendances.map((a) => a.studentId));
    const missing = students.filter((s) => !recorded.has(s.id));
    if (missing.length)
      await tx.attendance.createMany({
        data: missing.map((s) => ({
          tenantId,
          occurrenceId: o.id,
          studentId: s.id,
          status: 'PRESENT' as const,
          recordedById: me.personId,
        })),
        skipDuplicates: true,
      });
    const closed = { closedAt: new Date(), closedById: me.personId, updatedById: me.personId };
    const entry = o.classbook
      ? await tx.classbookEntry.update({ where: { id: o.classbook.id }, data: closed })
      : await tx.classbookEntry.create({ data: { tenantId, occurrenceId: o.id, ...closed } });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'classbook.close',
      entity: 'occurrence',
      entityId: o.id,
    });
    await this.events.emit(tx, tenantId, 'occurrence.updated', [o.id], this.teacherIds(o));
    return { entry: entryState(entry)! };
  }
}
