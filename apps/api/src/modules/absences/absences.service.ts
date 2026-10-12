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
  absenceBlocks,
  addDays,
  can,
  daySpan,
  EXCUSABLE,
  tenantSettingsSchema,
  type AbsenceItem,
  type AbsenceReason,
  type AbsenceReportInput,
  type AbsenceStatusName,
  type PolicyUser,
  type TenantSettings,
} from '@sp/shared';
import { DateTime } from 'luxon';
import type { Principal } from '../../common/request';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';
import { FilesService } from '../files/files.service';
import { QueueService } from '../jobs/queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { asDate, todayIn } from '../timetable/data';

export const QUEUE_ABSENCES = 'absences-daily';

const studentSelect = {
  id: true,
  firstName: true,
  lastName: true,
  birthDate: true,
} satisfies Prisma.PersonSelect;

type AbsenceRow = Prisma.AbsenceGetPayload<{
  include: { student: { select: typeof studentSelect } };
}>;

/** Zeitpunkt eines Kalendertags und einer Uhrzeit ("08:00") in der Zeitzone der Schule. */
const at = (date: string, time: string, tz: string) =>
  DateTime.fromISO(`${date}T${time}`, { zone: tz }).toUTC().toJSDate();

/**
 * Fehlzeiten von Schüler:innen (Spec Abschnitt 11):
 * - Klassenbuch "abwesend" erzeugt eine offene Fehlzeit (OPEN), sofern keine Meldung den Zeitraum abdeckt.
 * - Eltern (mit Recht zu entschuldigen), Schüler:innen ab der Altersgrenze oder die Administration melden;
 *   noch nicht entschuldigte Fehlzeiten im Zeitraum gehen in der Meldung auf (REPORTED).
 * - Der Klassenvorstand (oder Direktion, Administration) nimmt an (EXCUSED) oder lehnt ab (REJECTED).
 * - Täglicher Job: Erinnerungen an Eltern, nach Ablauf der Frist UNEXCUSED.
 */
@Injectable()
export class AbsencesService implements OnModuleInit {
  private readonly logger = new Logger(AbsencesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly events: EventsService,
    private readonly files: FilesService,
    private readonly queue: QueueService,
  ) {}

  onModuleInit(): void {
    this.queue.register(QUEUE_ABSENCES, () => this.dailyAllTenants(), {
      cron: '30 6 * * *',
      onStartup: true,
    });
  }

  private async settings(tx: Tx, tenantId: string): Promise<{ s: TenantSettings; tz: string }> {
    const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    return { s: tenantSettingsSchema.parse(t.settings), tz: t.timezone };
  }

  // ───────────── aus dem Klassenbuch ─────────────

  /**
   * Gleicht die offenen Fehlzeiten aus dem Klassenbuch eines Tages ab (nach jeder Anwesenheitsänderung).
   * Nur OPEN-Fehlzeiten aus dem Klassenbuch werden neu berechnet; Meldungen und Entscheidungen bleiben.
   */
  async syncFromClassbook(
    tx: Tx,
    tenantId: string,
    date: Date,
    studentIds: string[],
    recordedById: string,
  ): Promise<void> {
    if (studentIds.length === 0) return;
    const dayStart = new Date(date.getTime() - 12 * 3_600_000);
    const dayEnd = new Date(date.getTime() + 36 * 3_600_000);
    const [absent, existing] = await Promise.all([
      tx.attendance.findMany({
        where: {
          studentId: { in: studentIds },
          status: 'ABSENT',
          occurrence: { date, status: { not: 'CANCELLED' } },
        },
        select: { studentId: true, occurrence: { select: { startsAt: true, endsAt: true } } },
      }),
      tx.absence.findMany({
        where: { studentId: { in: studentIds }, fromAt: { lt: dayEnd }, toAt: { gt: dayStart } },
      }),
    ]);
    for (const studentId of studentIds) {
      const mine = existing.filter((a) => a.studentId === studentId);
      const replaceable = mine.filter((a) => a.origin === 'CLASSBOOK' && a.status === 'OPEN');
      const covering = mine.filter((a) => !replaceable.includes(a));
      const blocks = absenceBlocks(
        absent.filter((a) => a.studentId === studentId).map((a) => a.occurrence),
      ).filter((b) => !covering.some((c) => c.fromAt <= b.fromAt && c.toAt >= b.toAt));
      // unverändert? dann nichts tun (keine neuen Ids, keine erneuten Erinnerungen)
      const same =
        blocks.length === replaceable.length &&
        blocks.every((b) =>
          replaceable.some(
            (r) =>
              r.fromAt.getTime() === b.fromAt.getTime() && r.toAt.getTime() === b.toAt.getTime(),
          ),
        );
      if (same) continue;
      if (replaceable.length)
        await tx.absence.deleteMany({ where: { id: { in: replaceable.map((r) => r.id) } } });
      if (blocks.length)
        await tx.absence.createMany({
          data: blocks.map((b) => ({
            tenantId,
            studentId,
            fromAt: b.fromAt,
            toAt: b.toAt,
            status: 'OPEN' as const,
            origin: 'CLASSBOOK' as const,
            reportedById: recordedById,
          })),
        });
    }
  }

  // ───────────── Melden ─────────────

  /** Wer darf für dieses Kind entschuldigen? Eltern mit Recht, Schüler:in ab Altersgrenze, Administration. */
  private async mayExcuse(
    tx: Tx,
    me: Principal,
    user: PolicyUser,
    student: { id: string; birthDate: Date | null },
    s: TenantSettings,
    today: string,
  ): Promise<boolean> {
    if (!can(user, 'absence.report', { studentId: student.id })) return false;
    if (user.roles.includes('ADMIN')) return true;
    if (student.id === me.personId) {
      if (!student.birthDate) return false;
      const age = DateTime.fromISO(today).diff(
        DateTime.fromJSDate(student.birthDate),
        'years',
      ).years;
      return age >= s.ageLimits.selfExcuseFrom;
    }
    const link = await tx.guardianLink.findFirst({
      where: {
        guardianId: me.personId,
        studentId: student.id,
        canExcuse: true,
        validFrom: { lte: asDate(today) },
        OR: [{ validTo: null }, { validTo: { gte: asDate(today) } }],
      },
    });
    return link !== null;
  }

  async report(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    input: AbsenceReportInput,
  ): Promise<AbsenceItem> {
    const { s, tz } = await this.settings(tx, tenantId);
    const today = todayIn(tz);
    const student = await tx.person.findUnique({
      where: { id: input.studentId },
      select: { ...studentSelect, kind: true, anonymizedAt: true },
    });
    if (!student || student.kind !== 'STUDENT' || student.anonymizedAt)
      throw new NotFoundException({ title: 'Schüler:in nicht gefunden' });
    if (!(await this.mayExcuse(tx, me, user, student, s, today)))
      throw new ForbiddenException({
        title: 'Keine Berechtigung, für dieses Kind zu entschuldigen',
      });
    if (input.fromDate < addDays(today, -60) || input.toDate > addDays(today, 60))
      throw new UnprocessableEntityException({
        title: 'Zeitraum liegt zu weit zurück oder voraus',
      });
    if (daySpan(input.fromDate, input.toDate) > 31)
      throw new UnprocessableEntityException({ title: 'Höchstens 31 Tage auf einmal' });

    const periods = await tx.period.findMany({ orderBy: { number: 'asc' } });
    const period = (n: number | null | undefined) => periods.find((p) => p.number === n);
    const fromAt = at(input.fromDate, period(input.fromPeriod)?.startTime ?? '00:00', tz);
    const toAt = input.toPeriod
      ? at(input.toDate, period(input.toPeriod)?.endTime ?? '23:59', tz)
      : at(input.toDate, '23:59:59', tz);

    const overlapping = await tx.absence.findMany({
      where: { studentId: student.id, fromAt: { lt: toAt }, toAt: { gt: fromAt } },
    });
    if (overlapping.some((a) => a.status === 'REPORTED' || a.status === 'EXCUSED'))
      throw new ConflictException({ title: 'Für diesen Zeitraum liegt schon eine Meldung vor' });
    // Noch zu entschuldigende Fehlzeiten im Zeitraum gehen in der Meldung auf
    const absorbed = overlapping.filter(
      (a) =>
        EXCUSABLE.includes(a.status as AbsenceStatusName) && a.fromAt >= fromAt && a.toAt <= toAt,
    );
    if (absorbed.length)
      await tx.absence.deleteMany({ where: { id: { in: absorbed.map((a) => a.id) } } });

    const created = await tx.absence.create({
      data: {
        tenantId,
        studentId: student.id,
        fromAt,
        toAt,
        reason: input.reason,
        reasonCode: input.reasonCode,
        status: 'REPORTED',
        origin: 'REPORT',
        reportedById: me.personId,
      },
      include: { student: { select: studentSelect } },
    });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'absence.report',
      entity: 'absence',
      entityId: created.id,
      meta: { absorbed: absorbed.map((a) => a.id) },
    });
    const homeroom = await this.homeroomOf(tx, student.id, today);
    await this.notifications.emit(tx, tenantId, 'absence.reported', homeroom.personIds, {
      url: homeroom.classId ? `/klasse/${homeroom.classId}/entschuldigungen` : undefined,
    });
    return (await this.toItems(tx, tenantId, me, user, [created]))[0]!;
  }

  /** Klassenvorstand der aktuellen Klasse einer Schülerin, eines Schülers. */
  private async homeroomOf(tx: Tx, studentId: string, today: string) {
    const enrollment = await tx.enrollment.findFirst({
      where: {
        studentId,
        fromDate: { lte: asDate(today) },
        OR: [{ toDate: null }, { toDate: { gte: asDate(today) } }],
      },
      select: { classId: true },
    });
    if (!enrollment) return { classId: null, personIds: [] as string[] };
    const roles = await tx.roleAssignment.findMany({
      where: { role: 'HOMEROOM', classId: enrollment.classId },
      select: { personId: true },
    });
    return { classId: enrollment.classId, personIds: roles.map((r) => r.personId) };
  }

  // ───────────── Prüfen ─────────────

  async review(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    id: string,
    decision: 'EXCUSED' | 'REJECTED',
    comment: string | null,
  ): Promise<AbsenceItem> {
    const a = await tx.absence.findUnique({
      where: { id },
      include: { student: { select: studentSelect } },
    });
    if (!a) throw new NotFoundException({ title: 'Fehlzeit nicht gefunden' });
    const { tz } = await this.settings(tx, tenantId);
    const { classId } = await this.homeroomOf(tx, a.studentId, todayIn(tz));
    if (!can(user, 'absence.review', { classId: classId ?? undefined }))
      throw new ForbiddenException({ title: 'Keine Berechtigung für diese Klasse' });
    if (a.status === decision) return (await this.toItems(tx, tenantId, me, user, [a]))[0]!;
    const updated = await tx.absence.update({
      where: { id },
      data: {
        status: decision,
        reviewedById: me.personId,
        reviewedAt: new Date(),
        reviewComment: comment,
      },
      include: { student: { select: studentSelect } },
    });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: decision === 'EXCUSED' ? 'absence.excuse' : 'absence.reject',
      entity: 'absence',
      entityId: id,
    });
    const guardians = await this.guardiansOf(tx, a.studentId);
    await this.notifications.emit(tx, tenantId, 'absence.reviewed', guardians, {
      url: `/kind/${a.studentId}/fehlzeiten`,
    });
    await this.events.emit(tx, tenantId, 'absence.reviewed', [id], [...guardians, a.reportedById]);
    return (await this.toItems(tx, tenantId, me, user, [updated]))[0]!;
  }

  private async guardiansOf(tx: Tx, studentId: string): Promise<string[]> {
    const now = new Date();
    const links = await tx.guardianLink.findMany({
      where: {
        studentId,
        canExcuse: true,
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      select: { guardianId: true },
    });
    return links.map((l) => l.guardianId);
  }

  // ───────────── Lesen ─────────────

  async list(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    q: {
      studentId?: string;
      classId?: string;
      status?: AbsenceStatusName;
      from?: string;
      to?: string;
    },
  ): Promise<AbsenceItem[]> {
    const { tz } = await this.settings(tx, tenantId);
    const today = todayIn(tz);
    let studentIds: string[] | null = null;
    if (q.studentId) {
      const { classId } = await this.homeroomOf(tx, q.studentId, today);
      if (!can(user, 'attendance.read', { studentId: q.studentId, classId: classId ?? undefined }))
        throw new ForbiddenException({ title: 'Keine Berechtigung für diese Fehlzeiten' });
      studentIds = [q.studentId];
    } else if (q.classId) {
      if (!can(user, 'attendance.read', { classId: q.classId }))
        throw new ForbiddenException({ title: 'Keine Berechtigung für diese Klasse' });
      studentIds = (
        await tx.enrollment.findMany({
          where: {
            classId: q.classId,
            fromDate: { lte: asDate(today) },
            OR: [{ toDate: null }, { toDate: { gte: asDate(today) } }],
          },
          select: { studentId: true },
        })
      ).map((e) => e.studentId);
    } else if (user.roles.includes('GUARDIAN') || user.roles.includes('STUDENT')) {
      studentIds = [
        ...(user.guardianOfStudentIds ?? []),
        ...(user.roles.includes('STUDENT') ? [me.personId] : []),
      ];
    } else if (!user.roles.some((r) => r === 'PRINCIPAL' || r === 'ADMIN')) {
      throw new UnprocessableEntityException({ title: 'Schüler:in oder Klasse angeben' });
    }
    const rows = await tx.absence.findMany({
      where: {
        ...(studentIds ? { studentId: { in: studentIds } } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.from ? { toAt: { gte: asDate(q.from) } } : {}),
        ...(q.to ? { fromAt: { lt: asDate(addDays(q.to, 1)) } } : {}),
      },
      include: { student: { select: studentSelect } },
      orderBy: { fromAt: 'desc' },
      take: 500,
    });
    const own = studentIds?.every(
      (s) => s === me.personId || (user.guardianOfStudentIds ?? []).includes(s),
    );
    if (!own)
      await this.audit.record({
        tenantId,
        actorId: me.personId,
        action: 'absence.read',
        entity: q.classId ? 'class' : 'person',
        entityId: q.classId ?? q.studentId ?? null,
      });
    return this.toItems(tx, tenantId, me, user, rows);
  }

  private async toItems(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    rows: AbsenceRow[],
  ): Promise<AbsenceItem[]> {
    if (rows.length === 0) return [];
    const { s, tz } = await this.settings(tx, tenantId);
    const today = todayIn(tz);
    const studentIds = [...new Set(rows.map((r) => r.studentId))];
    const enrollments = await tx.enrollment.findMany({
      where: {
        studentId: { in: studentIds },
        fromDate: { lte: asDate(today) },
        OR: [{ toDate: null }, { toDate: { gte: asDate(today) } }],
      },
      select: { studentId: true, classId: true, class: { select: { name: true } } },
    });
    const classOf = new Map(enrollments.map((e) => [e.studentId, e]));
    const groups = await tx.groupMember.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, groupId: true },
    });
    const minFrom = new Date(Math.min(...rows.map((r) => r.fromAt.getTime())));
    const maxTo = new Date(Math.max(...rows.map((r) => r.toAt.getTime())));
    const occ = await tx.occurrence.findMany({
      where: {
        startsAt: { lt: maxTo },
        endsAt: { gt: minFrom },
        status: { not: 'CANCELLED' },
        OR: [
          { classId: { in: enrollments.map((e) => e.classId) } },
          { groupId: { in: groups.map((g) => g.groupId) } },
        ],
      },
      select: { classId: true, groupId: true, startsAt: true, endsAt: true },
    });
    const excuseCache = new Map<string, boolean>();
    const out: AbsenceItem[] = [];
    for (const r of rows) {
      const cls = classOf.get(r.studentId);
      const myGroups = groups.filter((g) => g.studentId === r.studentId).map((g) => g.groupId);
      const lessons = occ.filter(
        (o) =>
          o.startsAt < r.toAt &&
          o.endsAt > r.fromAt &&
          ((o.classId && o.classId === cls?.classId) ||
            (o.groupId && myGroups.includes(o.groupId))),
      ).length;
      if (!excuseCache.has(r.studentId))
        excuseCache.set(r.studentId, await this.mayExcuse(tx, me, user, r.student, s, today));
      const fromDate = DateTime.fromJSDate(r.fromAt).setZone(tz).toISODate()!;
      const toDate = DateTime.fromJSDate(r.toAt).setZone(tz).toISODate()!;
      out.push({
        id: r.id,
        student: {
          id: r.student.id,
          firstName: r.student.firstName,
          lastName: r.student.lastName,
          className: cls?.class.name ?? null,
        },
        fromAt: r.fromAt.toISOString(),
        toAt: r.toAt.toISOString(),
        status: r.status as AbsenceStatusName,
        origin: r.origin,
        reasonCode: (r.reasonCode as AbsenceReason | null) ?? null,
        reason: r.reason,
        reviewComment: r.reviewComment,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        attachmentRequired:
          r.origin === 'REPORT' &&
          daySpan(fromDate, toDate) >= s.absence.attachmentRequiredFromDays,
        hasAttachment: r.attachmentId !== null,
        deadline: r.status === 'OPEN' ? addDays(fromDate, s.absence.excuseDeadlineDays) : null,
        canExcuse:
          EXCUSABLE.includes(r.status as AbsenceStatusName) && excuseCache.get(r.studentId)!,
        canReview: can(user, 'absence.review', { classId: cls?.classId }),
        lessons,
      });
    }
    return out;
  }

  // ───────────── Anhang ─────────────

  async attach(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    id: string,
    body: Buffer,
  ): Promise<AbsenceItem> {
    const a = await tx.absence.findUnique({
      where: { id },
      include: { student: { select: studentSelect } },
    });
    if (!a) throw new NotFoundException({ title: 'Fehlzeit nicht gefunden' });
    const { s, tz } = await this.settings(tx, tenantId);
    const mine =
      a.reportedById === me.personId ||
      (await this.mayExcuse(tx, me, user, a.student, s, todayIn(tz)));
    if (!mine)
      throw new ForbiddenException({
        title: 'Nur die meldende Person kann eine Bestätigung anhängen',
      });
    if (a.status !== 'REPORTED')
      throw new UnprocessableEntityException({ title: 'Nur bei offenen Meldungen möglich' });
    const file = await this.files.upload(tx, tenantId, me.personId, body);
    const updated = await tx.absence.update({
      where: { id },
      data: { attachmentId: file.id },
      include: { student: { select: studentSelect } },
    });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'absence.attach',
      entity: 'absence',
      entityId: id,
    });
    return (await this.toItems(tx, tenantId, me, user, [updated]))[0]!;
  }

  /** Signierter Link zur Bestätigung: Klassenvorstand/Direktion/Administration und meldende Person. */
  async attachmentUrl(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    id: string,
  ): Promise<{ url: string }> {
    const a = await tx.absence.findUnique({ where: { id } });
    if (!a?.attachmentId) throw new NotFoundException({ title: 'Keine Bestätigung vorhanden' });
    const { tz } = await this.settings(tx, tenantId);
    const { classId } = await this.homeroomOf(tx, a.studentId, todayIn(tz));
    if (
      a.reportedById !== me.personId &&
      !can(user, 'absence.review', { classId: classId ?? undefined })
    )
      throw new ForbiddenException({ title: 'Keine Berechtigung' });
    const url = await this.files.link(tx, a.attachmentId);
    if (!url) throw new NotFoundException({ title: 'Datei nicht verfügbar' });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'absence.attachment.read',
      entity: 'absence',
      entityId: id,
    });
    return { url };
  }

  // ───────────── täglicher Job ─────────────

  async dailyAllTenants(): Promise<void> {
    const tenants = await this.prisma.client.tenant.findMany({ select: { id: true, slug: true } });
    for (const t of tenants) {
      try {
        const r = await this.prisma.runAsTenant(t.id, (tx) => this.daily(tx, t.id), {
          timeoutMs: 60_000,
        });
        this.logger.log(
          `Fehlzeiten ${t.slug}: ${r.reminded} erinnert, ${r.unexcused} unentschuldigt`,
        );
      } catch (err) {
        this.logger.error(`Fehlzeiten ${t.slug}: ${err instanceof Error ? err.message : 'Fehler'}`);
      }
    }
  }

  /** Erinnerungen nach den eingestellten Tagen; nach Ablauf der Frist UNEXCUSED. Idempotent pro Tag. */
  async daily(
    tx: Tx,
    tenantId: string,
    today?: string,
  ): Promise<{ reminded: number; unexcused: number }> {
    const { s, tz } = await this.settings(tx, tenantId);
    const day = today ?? todayIn(tz);
    const open = await tx.absence.findMany({ where: { status: 'OPEN' } });
    let reminded = 0;
    let unexcused = 0;
    const steps = [...s.absence.reminderAfterDays].sort((a, b) => a - b);
    for (const a of open) {
      const start = DateTime.fromJSDate(a.fromAt).setZone(tz).toISODate()!;
      const since = daySpan(start, day) - 1;
      if (since >= s.absence.excuseDeadlineDays) {
        await tx.absence.update({ where: { id: a.id }, data: { status: 'UNEXCUSED' } });
        await this.audit.record({
          tenantId,
          action: 'absence.unexcused',
          entity: 'absence',
          entityId: a.id,
        });
        unexcused++;
        continue;
      }
      const due = steps.filter((d) => since >= d).length;
      if (due > a.remindersSent) {
        const guardians = await this.guardiansOf(tx, a.studentId);
        await this.notifications.emit(tx, tenantId, 'absence.reminder', guardians, {
          url: `/kind/${a.studentId}/fehlzeiten`,
        });
        await tx.absence.update({
          where: { id: a.id },
          data: { remindersSent: due, lastReminderAt: new Date() },
        });
        reminded++;
      }
    }
    return { reminded, unexcused };
  }
}
