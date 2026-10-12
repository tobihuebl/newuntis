import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  type OnModuleInit,
} from '@nestjs/common';
import type { Prisma, Tx } from '@sp/db';
import {
  can,
  mondayOf,
  rankSuggestions,
  type PolicyUser,
  type SubstitutionActionInput,
  type SubstitutionDay,
  type SubstitutionItem,
  type Suggestion,
  type TeacherAbsenceInput,
  type TeacherAbsenceItem,
} from '@sp/shared';
import { DateTime } from 'luxon';
import type { Principal } from '../../common/request';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';
import { QueueService } from '../jobs/queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { asDate, iso, todayIn } from '../timetable/data';
import { PlansService, rawFromOccurrence } from '../timetable/plans.service';

export const QUEUE_SUBSTITUTIONS = 'substitutions-sync';

const occInclude = {
  teachers: { select: { teacherId: true } },
  lesson: { include: { teachers: { select: { teacherId: true } } } },
  substitution: {
    include: {
      substituteTeacher: { select: { id: true, firstName: true, lastName: true } },
      newRoom: { select: { id: true, name: true } },
      teacherAbsence: {
        include: { teacher: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  },
} satisfies Prisma.OccurrenceInclude;
type OccRow = Prisma.OccurrenceGetPayload<{ include: typeof occInclude }>;

const name = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
const at = (date: string, time: string, tz: string) =>
  DateTime.fromISO(`${date}T${time}`, { zone: tz }).toUTC().toJSDate();

/**
 * Lehrerabwesenheit und Supplierung (Spec Abschnitt 11):
 * - Eine TeacherAbsence erzeugt für jeden betroffenen Termin eine Substitution (OPEN). Der Termin bleibt
 *   bis zur Veröffentlichung unverändert.
 * - Aktionen: Vertretung, Entfall, Raumwechsel, Betreuung (ASSIGNED); Vorschläge nach Eignung und Fairness.
 * - Veröffentlichen ändert die Termine in einer Transaktion, benachrichtigt Betroffene und sendet ein Ereignis.
 * - Rücknahme: verkürzte oder gelöschte Abwesenheit → betroffene Supplierungen entfallen; bereits
 *   veröffentlichte Termine werden auf den Plan zurückgesetzt und als Korrektur gemeldet.
 */
@Injectable()
export class SubstitutionsService implements OnModuleInit {
  private readonly logger = new Logger(SubstitutionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly events: EventsService,
    private readonly queue: QueueService,
  ) {}

  onModuleInit(): void {
    // nach der nächtlichen Terminerzeugung: neue Termine abwesender Lehrkräfte erfassen
    this.queue.register(QUEUE_SUBSTITUTIONS, () => this.syncAllTenants(), {
      cron: '45 2 * * *',
      onStartup: true,
    });
  }

  private async tz(tx: Tx, tenantId: string): Promise<string> {
    return (
      await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })
    ).timezone;
  }

  // ───────────── Lehrerabwesenheit ─────────────

  async createAbsence(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    input: TeacherAbsenceInput,
  ): Promise<TeacherAbsenceItem> {
    const teacherId = input.teacherId ?? me.personId;
    if (!can(user, 'teacherAbsence.report', { personId: teacherId }))
      throw new ForbiddenException({ title: 'Nur die eigene Abwesenheit melden' });
    const manager = user.roles.some((r) => r === 'PRINCIPAL' || r === 'ADMIN');
    // Freistellungen und Fortbildungen brauchen eine Genehmigung (V1): Lehrkräfte melden selbst nur Krankheit
    if (!manager && !['SICK', 'OTHER'].includes(input.kind))
      throw new ForbiddenException({ title: 'Freistellungen trägt die Direktion ein' });
    const teacher = await tx.person.findUnique({
      where: { id: teacherId },
      select: { kind: true },
    });
    if (!teacher || teacher.kind !== 'TEACHER')
      throw new NotFoundException({ title: 'Lehrkraft nicht gefunden' });
    const { fromAt, toAt } = await this.range(tx, tenantId, input);
    const overlap = await tx.teacherAbsence.findFirst({
      where: { teacherId, fromAt: { lt: toAt }, toAt: { gt: fromAt } },
    });
    if (overlap)
      throw new ConflictException({
        title: 'Für diesen Zeitraum ist schon eine Abwesenheit eingetragen',
      });
    const a = await tx.teacherAbsence.create({
      data: {
        tenantId,
        teacherId,
        fromAt,
        toAt,
        kind: input.kind,
        note: input.note,
        createdById: me.personId,
        approvedById: manager ? me.personId : null,
      },
    });
    await this.syncForAbsence(tx, tenantId, a.id, me.personId);
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'teacherAbsence.create',
      entity: 'teacherAbsence',
      entityId: a.id,
    });
    return (await this.absenceItems(tx, [a.id]))[0]!;
  }

  async updateAbsence(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    id: string,
    input: TeacherAbsenceInput,
  ): Promise<TeacherAbsenceItem> {
    const a = await this.ownAbsence(tx, user, id);
    const { fromAt, toAt } = await this.range(tx, tenantId, input);
    await tx.teacherAbsence.update({
      where: { id: a.id },
      data: { fromAt, toAt, kind: input.kind, note: input.note },
    });
    await this.syncForAbsence(tx, tenantId, a.id, me.personId);
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'teacherAbsence.update',
      entity: 'teacherAbsence',
      entityId: a.id,
    });
    return (await this.absenceItems(tx, [a.id]))[0]!;
  }

  async deleteAbsence(tx: Tx, tenantId: string, me: Principal, user: PolicyUser, id: string) {
    const a = await this.ownAbsence(tx, user, id);
    const subs = await tx.substitution.findMany({ where: { teacherAbsenceId: a.id } });
    await this.removeMany(
      tx,
      tenantId,
      subs.map((s) => s.id),
      me.personId,
    );
    await tx.teacherAbsence.delete({ where: { id: a.id } });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'teacherAbsence.delete',
      entity: 'teacherAbsence',
      entityId: a.id,
    });
  }

  private async ownAbsence(tx: Tx, user: PolicyUser, id: string) {
    const a = await tx.teacherAbsence.findUnique({ where: { id } });
    if (!a) throw new NotFoundException({ title: 'Abwesenheit nicht gefunden' });
    if (!can(user, 'teacherAbsence.report', { personId: a.teacherId }))
      throw new ForbiddenException({ title: 'Keine Berechtigung' });
    return a;
  }

  private async range(tx: Tx, tenantId: string, input: TeacherAbsenceInput) {
    const tz = await this.tz(tx, tenantId);
    const periods = await tx.period.findMany({ orderBy: { number: 'asc' } });
    const p = (n: number | null | undefined) => periods.find((x) => x.number === n);
    const fromAt = at(input.fromDate, p(input.fromPeriod)?.startTime ?? '00:00', tz);
    const toAt = input.toPeriod
      ? at(input.toDate, p(input.toPeriod)?.endTime ?? '23:59', tz)
      : at(input.toDate, '23:59:59', tz);
    if (toAt <= fromAt) throw new UnprocessableEntityException({ title: 'Ende vor Beginn' });
    return { fromAt, toAt };
  }

  async listAbsences(
    tx: Tx,
    me: Principal,
    user: PolicyUser,
    from: string,
    to: string,
  ): Promise<TeacherAbsenceItem[]> {
    const manager = user.roles.some((r) => r === 'PRINCIPAL' || r === 'ADMIN');
    const rows = await tx.teacherAbsence.findMany({
      where: {
        ...(manager ? {} : { teacherId: me.personId }),
        fromAt: { lt: asDate(DateTime.fromISO(to).plus({ days: 1 }).toISODate()!) },
        toAt: { gt: asDate(from) },
      },
      select: { id: true },
      orderBy: { fromAt: 'asc' },
    });
    return this.absenceItems(
      tx,
      rows.map((r) => r.id),
    );
  }

  private async absenceItems(tx: Tx, ids: string[]): Promise<TeacherAbsenceItem[]> {
    const rows = await tx.teacherAbsence.findMany({
      where: { id: { in: ids } },
      include: {
        teacher: { select: { id: true, firstName: true, lastName: true } },
        substitutions: { select: { status: true } },
      },
      orderBy: { fromAt: 'asc' },
    });
    return rows.map((a) => ({
      id: a.id,
      teacher: { id: a.teacher.id, name: name(a.teacher) },
      fromAt: a.fromAt.toISOString(),
      toAt: a.toAt.toISOString(),
      kind: a.kind,
      note: a.note,
      substitutions: {
        open: a.substitutions.filter((s) => s.status === 'OPEN').length,
        assigned: a.substitutions.filter((s) => s.status === 'ASSIGNED').length,
        published: a.substitutions.filter((s) => s.status === 'PUBLISHED').length,
      },
    }));
  }

  /**
   * Gleicht die Supplierungen einer Abwesenheit mit den betroffenen Terminen ab (idempotent):
   * fehlende anlegen (OPEN), nicht mehr betroffene entfernen (veröffentlichte zurücksetzen).
   */
  async syncForAbsence(tx: Tx, tenantId: string, absenceId: string, actorId: string | null) {
    const a = await tx.teacherAbsence.findUniqueOrThrow({ where: { id: absenceId } });
    const today = todayIn(await this.tz(tx, tenantId));
    const affected = await tx.occurrence.findMany({
      where: {
        date: { gte: asDate(today) },
        startsAt: { lt: a.toAt },
        endsAt: { gt: a.fromAt },
        OR: [
          { teachers: { some: { teacherId: a.teacherId } } },
          { substitution: { is: { teacherAbsenceId: a.id } } },
        ],
      },
      select: { id: true, status: true, substitution: { select: { id: true } } },
    });
    const affectedIds = new Set(affected.map((o) => o.id));
    const existing = await tx.substitution.findMany({
      where: { teacherAbsenceId: a.id },
      select: { id: true, occurrenceId: true },
    });
    const stale = existing.filter((s) => !affectedIds.has(s.occurrenceId)).map((s) => s.id);
    if (stale.length) await this.removeMany(tx, tenantId, stale, actorId);
    const missing = affected.filter((o) => !o.substitution && o.status === 'SCHEDULED');
    if (missing.length)
      await tx.substitution.createMany({
        data: missing.map((o) => ({
          tenantId,
          occurrenceId: o.id,
          kind: 'SUBSTITUTE' as const,
          status: 'OPEN' as const,
          teacherAbsenceId: a.id,
        })),
      });
    return { created: missing.length, removed: stale.length };
  }

  async syncAllTenants(): Promise<void> {
    const tenants = await this.prisma.client.tenant.findMany({ select: { id: true, slug: true } });
    for (const t of tenants) {
      try {
        await this.prisma.runAsTenant(
          t.id,
          async (tx) => {
            const active = await tx.teacherAbsence.findMany({
              where: { toAt: { gte: new Date() } },
              select: { id: true },
            });
            for (const a of active) await this.syncForAbsence(tx, t.id, a.id, null);
          },
          { timeoutMs: 120_000 },
        );
      } catch (err) {
        this.logger.error(
          `Supplierungen ${t.slug}: ${err instanceof Error ? err.message : 'Fehler'}`,
        );
      }
    }
  }

  // ───────────── Supplierungen ─────────────

  private async loadOcc(tx: Tx, where: Prisma.OccurrenceWhereInput): Promise<OccRow[]> {
    return tx.occurrence.findMany({ where, include: occInclude, orderBy: { startsAt: 'asc' } });
  }

  async day(tx: Tx, tenantId: string, date?: string): Promise<SubstitutionDay> {
    const d = date ?? todayIn(await this.tz(tx, tenantId));
    const rows = await this.loadOcc(tx, { date: asDate(d), substitution: { isNot: null } });
    const dayStart = asDate(d);
    const dayEnd = asDate(DateTime.fromISO(d).plus({ days: 1 }).toISODate()!);
    const [absences, rooms] = await Promise.all([
      tx.teacherAbsence.findMany({
        where: {
          fromAt: { lt: dayEnd },
          toAt: { gt: new Date(dayStart.getTime() - 12 * 3_600_000) },
        },
        include: { teacher: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { fromAt: 'asc' },
      }),
      tx.room.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ]);
    return {
      date: d,
      items: await this.items(tx, rows),
      absences: absences.map((a) => ({
        id: a.id,
        teacher: { id: a.teacher.id, name: name(a.teacher) },
        fromAt: a.fromAt.toISOString(),
        toAt: a.toAt.toISOString(),
        kind: a.kind,
      })),
      rooms,
    };
  }

  private async items(tx: Tx, rows: OccRow[]): Promise<SubstitutionItem[]> {
    const entries = await this.plans.toEntries(tx, rows.map(rawFromOccurrence));
    const byId = new Map(entries.map((e) => [e.id, e]));
    const plannedIds = [
      ...new Set(rows.flatMap((r) => (r.lesson?.teachers ?? r.teachers).map((t) => t.teacherId))),
    ];
    const people = await tx.person.findMany({
      where: { id: { in: plannedIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const P = new Map(people.map((p) => [p.id, { id: p.id, name: name(p) }]));
    return rows
      .filter((r) => r.substitution)
      .map((r) => {
        const s = r.substitution!;
        return {
          id: s.id,
          status: s.status,
          kind: s.kind,
          note: s.note,
          substitute: s.substituteTeacher
            ? { id: s.substituteTeacher.id, name: name(s.substituteTeacher) }
            : null,
          newRoom: s.newRoom,
          plannedTeachers: (r.lesson?.teachers ?? r.teachers)
            .map((t) => P.get(t.teacherId))
            .filter((x) => x !== undefined),
          absentTeacher: s.teacherAbsence
            ? { id: s.teacherAbsence.teacher.id, name: name(s.teacherAbsence.teacher) }
            : null,
          occurrence: byId.get(r.id)!,
          publishedAt: s.publishedAt?.toISOString() ?? null,
          changedAfterPublish: s.publishedAt !== null && s.status !== 'PUBLISHED',
        };
      });
  }

  private async one(tx: Tx, id: string): Promise<OccRow> {
    const [o] = await this.loadOcc(tx, { substitution: { is: { id } } });
    if (!o) throw new NotFoundException({ title: 'Supplierung nicht gefunden' });
    return o;
  }

  /** Vorschläge (SU-02): freie, nicht abwesende Lehrkräfte; Fach, Klasse, Fairness. Dazu freie Räume. */
  async suggestions(tx: Tx, tenantId: string, id: string) {
    const o = await this.one(tx, id);
    const overlap = { date: o.date, startsAt: { lt: o.endsAt }, endsAt: { gt: o.startsAt } };
    const [teachers, busy, absent, taken, usedRooms, rooms, lessons] = await Promise.all([
      tx.person.findMany({
        where: { kind: 'TEACHER', anonymizedAt: null },
        select: { id: true, firstName: true, lastName: true },
      }),
      tx.occurrenceTeacher.findMany({
        where: { occurrence: { ...overlap, status: { not: 'CANCELLED' } } },
        select: { teacherId: true },
      }),
      tx.teacherAbsence.findMany({
        where: { fromAt: { lt: o.endsAt }, toAt: { gt: o.startsAt } },
        select: { teacherId: true },
      }),
      tx.substitution.findMany({
        where: {
          id: { not: id },
          substituteTeacherId: { not: null },
          status: { in: ['OPEN', 'ASSIGNED'] },
          occurrence: overlap,
        },
        select: { substituteTeacherId: true },
      }),
      tx.occurrence.findMany({
        where: {
          ...overlap,
          id: { not: o.id },
          status: { not: 'CANCELLED' },
          roomId: { not: null },
        },
        select: { roomId: true },
      }),
      tx.room.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      tx.lesson.findMany({
        where: { timetable: { status: 'PUBLISHED' } },
        select: { subjectId: true, classId: true, teachers: { select: { teacherId: true } } },
      }),
    ]);
    const planned = new Set((o.lesson?.teachers ?? o.teachers).map((t) => t.teacherId));
    const blocked = new Set([
      ...busy.map((b) => b.teacherId),
      ...absent.map((a) => a.teacherId),
      ...taken.map((t) => t.substituteTeacherId!),
      ...planned,
    ]);
    const year = await tx.schoolYear.findFirst({
      where: { startsOn: { lte: o.date }, endsOn: { gte: o.date } },
      select: { startsOn: true, endsOn: true },
    });
    const counts = await tx.substitution.groupBy({
      by: ['substituteTeacherId'],
      where: {
        status: 'PUBLISHED',
        kind: { in: ['SUBSTITUTE', 'SUPERVISION'] },
        substituteTeacherId: { not: null },
        ...(year ? { occurrence: { date: { gte: year.startsOn, lte: year.endsOn } } } : {}),
      },
      _count: { _all: true },
    });
    const count = new Map(counts.map((c) => [c.substituteTeacherId!, c._count._all]));
    const teaches = (t: string, f: (l: (typeof lessons)[number]) => boolean) =>
      lessons.some((l) => f(l) && l.teachers.some((x) => x.teacherId === t));
    const list: Suggestion[] = teachers
      .filter((t) => !blocked.has(t.id))
      .map((t) => ({
        teacher: { id: t.id, name: name(t) },
        teachesSubject: teaches(t.id, (l) => l.subjectId === o.subjectId),
        knowsClass: o.classId !== null && teaches(t.id, (l) => l.classId === o.classId),
        count: count.get(t.id) ?? 0,
      }));
    const used = new Set(usedRooms.map((r) => r.roomId));
    return {
      teachers: rankSuggestions(list),
      freeRooms: rooms.filter((r) => !used.has(r.id) && r.id !== o.roomId),
    };
  }

  private async validateAction(tx: Tx, input: SubstitutionActionInput) {
    if (input.substituteTeacherId) {
      const t = await tx.person.findUnique({
        where: { id: input.substituteTeacherId },
        select: { kind: true },
      });
      if (!t || t.kind !== 'TEACHER')
        throw new UnprocessableEntityException({ title: 'Lehrkraft nicht gefunden' });
    }
    if (input.newRoomId && !(await tx.room.findUnique({ where: { id: input.newRoomId } })))
      throw new UnprocessableEntityException({ title: 'Raum nicht gefunden' });
  }

  private actionData(input: SubstitutionActionInput) {
    const needsTeacher = input.kind === 'SUBSTITUTE' || input.kind === 'SUPERVISION';
    return {
      kind: input.kind,
      substituteTeacherId: needsTeacher ? (input.substituteTeacherId ?? null) : null,
      newRoomId: input.kind === 'CANCEL' ? null : (input.newRoomId ?? null),
      note: input.note,
      status: 'ASSIGNED' as const,
    };
  }

  async setAction(
    tx: Tx,
    tenantId: string,
    me: Principal,
    id: string,
    input: SubstitutionActionInput,
  ) {
    const o = await this.one(tx, id);
    await this.validateAction(tx, input);
    await tx.substitution.update({ where: { id }, data: this.actionData(input) });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'substitution.assign',
      entity: 'substitution',
      entityId: id,
      meta: { kind: input.kind },
    });
    void o;
    return (await this.items(tx, [await this.one(tx, id)]))[0]!;
  }

  /** Änderung an einer Stunde ohne Lehrerabwesenheit, z. B. Entfall wegen Ausflug. */
  async createManual(
    tx: Tx,
    tenantId: string,
    me: Principal,
    input: SubstitutionActionInput & { occurrenceId: string },
  ) {
    const o = await tx.occurrence.findUnique({
      where: { id: input.occurrenceId },
      include: { substitution: true },
    });
    if (!o) throw new NotFoundException({ title: 'Termin nicht gefunden' });
    if (o.substitution)
      throw new ConflictException({ title: 'Für diese Stunde gibt es schon eine Supplierung' });
    if (iso(o.date) < todayIn(await this.tz(tx, tenantId)))
      throw new UnprocessableEntityException({ title: 'Die Stunde liegt in der Vergangenheit' });
    await this.validateAction(tx, input);
    const s = await tx.substitution.create({
      data: { tenantId, occurrenceId: o.id, ...this.actionData(input) },
    });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'substitution.create',
      entity: 'substitution',
      entityId: s.id,
      meta: { kind: input.kind },
    });
    return (await this.items(tx, [await this.one(tx, s.id)]))[0]!;
  }

  async remove(tx: Tx, tenantId: string, me: Principal, id: string) {
    await this.one(tx, id);
    await this.removeMany(tx, tenantId, [id], me.personId);
  }

  /** Supplierungen entfernen; veröffentlichte Termine zurück auf den Plan und Betroffene benachrichtigen. */
  private async removeMany(tx: Tx, tenantId: string, ids: string[], actorId: string | null) {
    if (ids.length === 0) return;
    const rows = await this.loadOcc(tx, { substitution: { is: { id: { in: ids } } } });
    const published = rows.filter((r) => r.substitution?.publishedAt);
    for (const r of published) {
      const planned = (r.lesson?.teachers ?? r.teachers).map((t) => t.teacherId);
      await tx.occurrence.update({
        where: { id: r.id },
        data: { status: 'SCHEDULED', roomId: r.lesson?.roomId ?? r.roomId },
      });
      await this.setTeachers(tx, tenantId, r.id, planned);
    }
    await tx.substitution.deleteMany({ where: { id: { in: ids } } });
    if (published.length) await this.announce(tx, tenantId, published, [], true);
    await this.audit.record({
      tenantId,
      actorId,
      action: 'substitution.remove',
      entity: 'substitution',
      meta: { count: ids.length, reverted: published.length },
    });
  }

  private async setTeachers(tx: Tx, tenantId: string, occurrenceId: string, teacherIds: string[]) {
    await tx.occurrenceTeacher.deleteMany({ where: { occurrenceId } });
    if (teacherIds.length)
      await tx.occurrenceTeacher.createMany({
        data: [...new Set(teacherIds)].map((teacherId) => ({ tenantId, occurrenceId, teacherId })),
      });
  }

  /** Veröffentlichen (SU-04): Termine ändern, Betroffene benachrichtigen, Ereignis senden. Eine Transaktion. */
  async publish(tx: Tx, tenantId: string, me: Principal, q: { date?: string; ids?: string[] }) {
    const rows = await this.loadOcc(tx, {
      ...(q.date ? { date: asDate(q.date) } : {}),
      substitution: { is: { status: 'ASSIGNED', ...(q.ids ? { id: { in: q.ids } } : {}) } },
    });
    if (rows.length === 0) return { published: 0 };
    const now = new Date();
    const previousTeachers: string[] = [];
    for (const r of rows) {
      const s = r.substitution!;
      const planned = (r.lesson?.teachers ?? r.teachers).map((t) => t.teacherId);
      previousTeachers.push(...r.teachers.map((t) => t.teacherId));
      const absent = s.teacherAbsence?.teacherId;
      const base = r.lesson?.roomId ?? r.roomId;
      let teachers = planned;
      let status: 'CANCELLED' | 'SUBSTITUTED' | 'ROOM_CHANGED';
      let roomId = base;
      if (s.kind === 'SUBSTITUTE' || s.kind === 'SUPERVISION') {
        teachers = [...(absent ? planned.filter((t) => t !== absent) : []), s.substituteTeacherId!];
        status = 'SUBSTITUTED';
        roomId = s.newRoomId ?? base;
      } else if (s.kind === 'CANCEL') {
        status = 'CANCELLED';
      } else {
        status = 'ROOM_CHANGED';
        roomId = s.newRoomId ?? base;
      }
      await tx.occurrence.update({ where: { id: r.id }, data: { status, roomId } });
      await this.setTeachers(tx, tenantId, r.id, teachers);
      await tx.substitution.update({
        where: { id: s.id },
        data: { status: 'PUBLISHED', publishedAt: now, publishedById: me.personId },
      });
    }
    await this.announce(tx, tenantId, rows, previousTeachers, false);
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'substitution.publish',
      entity: 'substitution',
      meta: { count: rows.length, date: q.date ?? null },
    });
    return { published: rows.length };
  }

  /** Benachrichtigung an Schüler:innen, Eltern und betroffene Lehrkräfte; Echtzeit-Ereignis. */
  private async announce(
    tx: Tx,
    tenantId: string,
    rows: OccRow[],
    extraTeachers: string[],
    correction: boolean,
  ) {
    const tz = await this.tz(tx, tenantId);
    const fresh = await tx.occurrence.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: {
        id: true,
        date: true,
        classId: true,
        groupId: true,
        teachers: { select: { teacherId: true } },
      },
    });
    const byDate = new Map<string, typeof fresh>();
    for (const o of fresh) byDate.set(iso(o.date), [...(byDate.get(iso(o.date)) ?? []), o]);
    const everyone = new Set<string>();
    for (const [date, list] of byDate) {
      const day = asDate(date);
      const classIds = list.flatMap((o) => (o.classId ? [o.classId] : []));
      const groupIds = list.flatMap((o) => (o.groupId ? [o.groupId] : []));
      const [enrolled, members] = await Promise.all([
        tx.enrollment.findMany({
          where: {
            classId: { in: classIds },
            fromDate: { lte: day },
            OR: [{ toDate: null }, { toDate: { gte: day } }],
          },
          select: { studentId: true },
        }),
        tx.groupMember.findMany({
          where: { groupId: { in: groupIds } },
          select: { studentId: true },
        }),
      ]);
      const students = [...new Set([...enrolled, ...members].map((s) => s.studentId))];
      const guardians = (
        await tx.guardianLink.findMany({
          where: {
            studentId: { in: students },
            validFrom: { lte: day },
            OR: [{ validTo: null }, { validTo: { gte: day } }],
          },
          select: { guardianId: true },
        })
      ).map((g) => g.guardianId);
      const original = rows
        .filter((r) => list.some((o) => o.id === r.id))
        .flatMap((r) => (r.lesson?.teachers ?? r.teachers).map((t) => t.teacherId));
      const teachers = [
        ...list.flatMap((o) => o.teachers.map((t) => t.teacherId)),
        ...original,
        ...extraTeachers,
      ];
      const recipients = [...new Set([...students, ...guardians, ...teachers])];
      recipients.forEach((p) => everyone.add(p));
      const weekday = DateTime.fromISO(date, { zone: tz }).setLocale('de-AT').toFormat('cccc');
      await this.notifications.emit(tx, tenantId, 'substitution.published', recipients, {
        params: { day: weekday, ...(correction ? { correction: 1 } : {}) },
        url: date === todayIn(tz) ? '/heute' : `/plan?from=${mondayOf(date)}`,
      });
    }
    await this.events.emit(
      tx,
      tenantId,
      'substitution.published',
      rows.map((r) => r.id),
      [...everyone],
    );
  }
}
