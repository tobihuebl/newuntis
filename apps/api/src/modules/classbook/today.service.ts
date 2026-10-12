import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Tx } from '@sp/db';
import {
  addDays,
  can,
  nextWeekday,
  type PolicyUser,
  type Role,
  type TodayResponse,
} from '@sp/shared';
import type { Principal } from '../../common/request';
import { asDate, iso, todayIn } from '../timetable/data';
import { PlansService, rawFromOccurrence, type PlanFilter } from '../timetable/plans.service';
import { MessagesService } from '../messages/messages.service';
import { ClassbookService, progressOf } from './classbook.service';

const TEACHING: Role[] = ['TEACHER', 'HOMEROOM', 'PRINCIPAL', 'ADMIN'];
const EXAM_DAYS = 6;
const SUBSTITUTION_DAYS = 6;

/** "Heute" je Rolle (DB-01, KB-01): Lehrkräfte sehen ihre Stunden, Schüler:innen und Eltern den Tag der Klasse. */
@Injectable()
export class TodayService {
  constructor(
    private readonly plans: PlansService,
    private readonly classbook: ClassbookService,
    private readonly messages: MessagesService,
  ) {}

  async today(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    studentId?: string,
  ): Promise<TodayResponse> {
    const timezone = await this.classbook.timezone(tx, tenantId);
    const date = todayIn(timezone);
    const roles = user.roles;
    const base: TodayResponse = {
      date,
      now: new Date().toISOString(),
      view: 'none',
      lessons: [],
      homework: [],
      exams: [],
      teacher: null,
      children: [],
      studentId: null,
      inbox: await this.messages.inboxCounts(tx, me.personId),
    };

    // Wessen Tag? Ein ausgewähltes Kind, sonst nach Vorrang: Lehrkraft, Elternteil, Schüler:in.
    let filter: PlanFilter | null = null;
    if (studentId && studentId !== me.personId) {
      if (!can(user, 'timetable.read.own', { studentId }))
        throw new ForbiddenException({ title: 'Keine Berechtigung für dieses Kind' });
      base.view = 'guardian';
      base.children = await this.plans.children(tx, me.personId, date);
      base.studentId = studentId;
      filter = await this.plans.studentFilter(tx, studentId, date);
    } else if (roles.some((r) => TEACHING.includes(r))) {
      base.view = 'teacher';
    } else if (roles.includes('GUARDIAN')) {
      base.view = 'guardian';
      base.children = await this.plans.children(tx, me.personId, date);
      base.studentId = base.children[0]?.id ?? null;
      if (base.studentId) filter = await this.plans.studentFilter(tx, base.studentId, date);
    } else if (roles.includes('STUDENT')) {
      base.view = 'student';
      base.studentId = me.personId;
      filter = await this.plans.studentFilter(tx, me.personId, date);
    }

    if (base.view === 'teacher') return this.teacherDay(tx, me.personId, date, base);
    if (!filter) return base;
    const plan = await this.plans.plan(tx, tenantId, filter, date, date, timezone);
    base.lessons = plan.entries.map((e) => ({ ...e, classbook: null }));

    const groupOr = [
      ...(filter.classIds.length ? [{ classId: { in: filter.classIds } }] : []),
      ...(filter.groupIds.length ? [{ groupId: { in: filter.groupIds } }] : []),
    ];
    if (groupOr.length === 0) return base;
    const [homework, exams] = await Promise.all([
      tx.classbookEntry.findMany({
        where: {
          homework: { not: null },
          homeworkDueOn: { gte: asDate(date), lte: asDate(nextWeekday(date)) },
          occurrence: { OR: groupOr },
        },
        include: {
          occurrence: {
            select: { subject: { select: { id: true, name: true, code: true, color: true } } },
          },
        },
        orderBy: { homeworkDueOn: 'asc' },
      }),
      tx.exam.findMany({
        where: { date: { gte: asDate(date), lte: asDate(addDays(date, EXAM_DAYS)) }, OR: groupOr },
        include: { subject: { select: { id: true, name: true, code: true, color: true } } },
        orderBy: { date: 'asc' },
      }),
    ]);
    base.homework = homework.map((h) => ({
      occurrenceId: h.occurrenceId,
      subject: h.occurrence.subject,
      text: h.homework!,
      dueOn: iso(h.homeworkDueOn!),
    }));
    base.exams = exams.map((x) => ({
      id: x.id,
      date: iso(x.date),
      title: x.title,
      kind: x.kind,
      subject: x.subject,
    }));
    return base;
  }

  /** Hausübungen der nächsten zwei Wochen (Schüler:innen: eigene, Eltern: eines Kindes). */
  async homework(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    studentId?: string,
  ): Promise<TodayResponse['homework']> {
    const date = todayIn(await this.classbook.timezone(tx, tenantId));
    const sid =
      studentId ?? (user.roles.includes('STUDENT') ? me.personId : user.guardianOfStudentIds?.[0]);
    if (!sid) return [];
    if (!can(user, 'timetable.read.own', { studentId: sid }))
      throw new ForbiddenException({ title: 'Keine Berechtigung für dieses Kind' });
    const filter = await this.plans.studentFilter(tx, sid, date);
    const or = [
      ...(filter.classIds.length ? [{ classId: { in: filter.classIds } }] : []),
      ...(filter.groupIds.length ? [{ groupId: { in: filter.groupIds } }] : []),
    ];
    if (or.length === 0) return [];
    const rows = await tx.classbookEntry.findMany({
      where: {
        homework: { not: null },
        homeworkDueOn: { gte: asDate(date), lte: asDate(addDays(date, 14)) },
        occurrence: { OR: or },
      },
      include: {
        occurrence: {
          select: { subject: { select: { id: true, name: true, code: true, color: true } } },
        },
      },
      orderBy: { homeworkDueOn: 'asc' },
    });
    return rows.map((h) => ({
      occurrenceId: h.occurrenceId,
      subject: h.occurrence.subject,
      text: h.homework!,
      dueOn: iso(h.homeworkDueOn!),
    }));
  }

  private async teacherDay(
    tx: Tx,
    personId: string,
    date: string,
    base: TodayResponse,
  ): Promise<TodayResponse> {
    const mine = { teachers: { some: { teacherId: personId } } };
    const [rows, openEntries, substitutions] = await Promise.all([
      tx.occurrence.findMany({
        where: { ...mine, date: asDate(date) },
        include: {
          teachers: { select: { teacherId: true } },
          classbook: { select: { closedAt: true } },
          _count: { select: { attendances: true } },
        },
      }),
      this.classbook.openCount(tx, personId, date),
      tx.occurrence.findMany({
        where: {
          ...mine,
          date: { gte: asDate(date), lte: asDate(addDays(date, SUBSTITUTION_DAYS)) },
          substitution: { is: { status: 'PUBLISHED', substituteTeacherId: personId } },
        },
        include: { teachers: { select: { teacherId: true } } },
      }),
    ]);
    const progress = new Map(rows.map((o) => [o.id, progressOf(o)]));
    base.lessons = (await this.plans.toEntries(tx, rows.map(rawFromOccurrence))).map((e) => ({
      ...e,
      classbook: e.status === 'CANCELLED' ? null : (progress.get(e.id) ?? 'none'),
    }));
    base.teacher = {
      openEntries,
      substitutions: await this.plans.toEntries(tx, substitutions.map(rawFromOccurrence)),
    };
    return base;
  }
}
