import { Controller, ForbiddenException, Get, NotFoundException, Param } from '@nestjs/common';
import {
  can,
  hasScope,
  todayStatus,
  type AbsenceStatusName,
  type ClassRemarkItem,
  type MyClass,
  type MyClassDetail,
} from '@sp/shared';
import { DateTime } from 'luxon';
import { Authenticated } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { AuditService } from '../audit/audit.service';
import { currentEnrollments, fullName, guardianLinks } from '../messages/recipients';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { asDate, iso, todayIn } from '../timetable/data';

/**
 * "Klassen" für Lehrkräfte (Spec Abschnitt 5, /klassen): unterrichtete Klassen mit Schülerliste.
 * Sichtbar nach `attendance.read` (Lehrkraft: eigene Klassen, Klassenvorstand: eigene Klasse, Direktion: alle).
 */
@Controller('my-classes')
export class MyClassesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
  ) {}

  @Authenticated()
  @Get()
  async list(@TenantId() tenantId: string, @Actor() me: Principal): Promise<{ data: MyClass[] }> {
    const tx = this.prisma.tx;
    const user = await this.policy.loadUser(tenantId, me);
    const all = hasScope(user, 'attendance.read', 'ALL');
    const ids = [...new Set([...(user.teachesClassIds ?? []), ...(user.homeroomClassIds ?? [])])];
    if (!all && ids.length === 0) return { data: [] };
    const tz = (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })).timezone;
    const classes = await tx.schoolClass.findMany({
      where: all ? { schoolYear: { isCurrent: true } } : { id: { in: ids } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    const enr = await currentEnrollments(
      tx,
      { classId: { in: classes.map((c) => c.id) } },
      todayIn(tz),
    );
    const lessons = await tx.lesson.findMany({
      where: {
        classId: { in: classes.map((c) => c.id) },
        timetable: { status: 'PUBLISHED' },
        teachers: { some: { teacherId: me.personId } },
      },
      select: { classId: true, subject: { select: { name: true } } },
    });
    return {
      data: classes.map((c) => ({
        id: c.id,
        name: c.name,
        homeroom: (user.homeroomClassIds ?? []).includes(c.id),
        students: enr.filter((e) => e.classId === c.id).length,
        subjects: [
          ...new Set(lessons.filter((l) => l.classId === c.id).map((l) => l.subject.name)),
        ].sort((a, b) => a.localeCompare(b, 'de')),
      })),
    };
  }

  @Authenticated()
  @Get(':id')
  async detail(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') id: string,
  ): Promise<MyClassDetail> {
    const tx = this.prisma.tx;
    const user = await this.policy.loadUser(tenantId, me);
    if (!can(user, 'attendance.read', { classId: id }))
      throw new ForbiddenException({ title: 'Keine Berechtigung für diese Klasse' });
    const c = await tx.schoolClass.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        homeroomTeacher: { select: { firstName: true, lastName: true } },
      },
    });
    if (!c) throw new NotFoundException({ title: 'Klasse nicht gefunden' });
    const tz = (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })).timezone;
    const day = todayIn(tz);
    const enr = await currentEnrollments(tx, { classId: { in: [id] } }, day);
    const students = await tx.person.findMany({
      where: { id: { in: enr.map((e) => e.studentId) } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        user: { select: { passwordHash: true } },
      },
    });
    const links = await guardianLinks(
      tx,
      students.map((s) => s.id),
      day,
    );
    const lessons = await tx.lesson.findMany({
      where: { classId: id, timetable: { status: 'PUBLISHED' } },
      select: {
        subject: { select: { name: true } },
        teachers: { select: { teacher: { select: { firstName: true, lastName: true } } } },
      },
    });
    const subjects = new Map<string, Set<string>>();
    for (const l of lessons) {
      const set = subjects.get(l.subject.name) ?? new Set<string>();
      for (const t of l.teachers) set.add(fullName(t.teacher));
      subjects.set(l.subject.name, set);
    }
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'person.read',
      entity: 'class',
      entityId: id,
      meta: { count: students.length },
    });

    // Heute: Anwesenheit der begonnenen Stunden und Fehlzeiten des Tages
    const now = new Date();
    const dayStart = DateTime.fromISO(day, { zone: tz }).startOf('day').toUTC().toJSDate();
    const dayEnd = DateTime.fromISO(day, { zone: tz }).endOf('day').toUTC().toJSDate();
    const ids = students.map((s) => s.id);
    const [todays, attendance, absences] = await Promise.all([
      tx.occurrence.findMany({
        where: { classId: id, date: asDate(day), status: { not: 'CANCELLED' } },
        select: { startsAt: true },
      }),
      tx.attendance.findMany({
        where: {
          studentId: { in: ids },
          occurrence: { date: asDate(day), status: { not: 'CANCELLED' } },
        },
        select: {
          studentId: true,
          status: true,
          lateMinutes: true,
          occurrence: { select: { startsAt: true } },
        },
      }),
      tx.absence.findMany({
        where: { studentId: { in: ids }, fromAt: { lt: dayEnd }, toAt: { gt: dayStart } },
        select: { studentId: true, fromAt: true, toAt: true, status: true },
      }),
    ]);
    const isHomeroom = (user.homeroomClassIds ?? []).includes(id);
    return {
      id: c.id,
      name: c.name,
      homeroomTeacher: c.homeroomTeacher ? fullName(c.homeroomTeacher) : null,
      isHomeroom,
      canReview: can(user, 'absence.review', { classId: id }),
      canIssueAccess: can(user, 'access.issue', { classId: id }),
      canSeeRemarks: isHomeroom || can(user, 'classbook.write', { teacherIds: [] }),
      canEdit: can(user, 'masterdata.write'),
      today: {
        date: day,
        lessonsStarted: todays.filter((o) => o.startsAt <= now).length,
        lessonsTotal: todays.length,
      },
      students: students.map((s) => {
        const t = todayStatus(
          attendance
            .filter((a) => a.studentId === s.id)
            .map((a) => ({
              startsAt: a.occurrence.startsAt,
              status: a.status,
              lateMinutes: a.lateMinutes,
            })),
          absences
            .filter((a) => a.studentId === s.id)
            .map((a) => ({ ...a, status: a.status as AbsenceStatusName })),
          now,
        );
        return {
          id: s.id,
          name: `${s.lastName} ${s.firstName}`.trim(),
          hasAccount: Boolean(s.user?.passwordHash),
          guardians: links.filter((l) => l.studentId === s.id).length,
          today: t.status,
          lateMinutes: t.lateMinutes,
        };
      }),
      subjects: [...subjects.entries()]
        .map(([name, teachers]) => ({ name, teachers: [...teachers].sort() }))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    };
  }

  /**
   * Vermerke der Klasse (KB-07) für den Klassenvorstand und die Direktion, neueste zuerst. Lehrkräfte sehen
   * Vermerke nur in ihren eigenen Stunden.
   */
  @Authenticated()
  @Get(':id/remarks')
  async remarks(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') id: string,
  ): Promise<{ data: ClassRemarkItem[] }> {
    const tx = this.prisma.tx;
    const user = await this.policy.loadUser(tenantId, me);
    const allowed =
      (user.homeroomClassIds ?? []).includes(id) ||
      can(user, 'classbook.write', { teacherIds: [] });
    if (!allowed) throw new ForbiddenException({ title: 'Keine Berechtigung für diese Klasse' });
    const rows = await tx.classbookRemark.findMany({
      where: {
        student: { enrollments: { some: { classId: id } } },
        occurrence: { OR: [{ classId: id }, { groupId: { not: null } }] },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        student: { select: { firstName: true, lastName: true } },
        occurrence: { select: { date: true, subject: { select: { name: true } } } },
      },
    });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'classbook.remark.read',
      entity: 'class',
      entityId: id,
      meta: { count: rows.length },
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        studentId: r.studentId,
        text: r.text,
        createdAt: r.createdAt.toISOString(),
        author: fullName(r.createdBy),
        own: r.createdById === me.personId,
        date: iso(r.occurrence.date),
        occurrenceId: r.occurrenceId,
        subject: r.occurrence.subject.name,
        student: `${r.student.lastName} ${r.student.firstName}`.trim(),
      })),
    };
  }
}
