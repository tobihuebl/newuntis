import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Tx } from '@sp/db';
import {
  can,
  DEFAULT_WEIGHTS,
  gradeDistribution,
  gradeWeightsSchema,
  kindFromExam,
  tenantSettingsSchema,
  weightedAverage,
  type AssessmentItem,
  type AssessmentKind,
  type ClassGradesOverview,
  type CourseDetail,
  type CourseRef,
  type CourseSummary,
  type GradeWeights,
  type PolicyUser,
  type StudentGrades,
} from '@sp/shared';
import { DateTime } from 'luxon';
import type { z } from 'zod';
import type { assessmentInput, assessmentPatch, gradesInput } from '@sp/shared';
import type { Principal } from '../../common/request';
import { AuditService } from '../audit/audit.service';
import { currentEnrollments, guardianLinks } from '../messages/recipients';
import { NotificationsService } from '../notifications/notifications.service';
import { asDate, iso, todayIn } from '../timetable/data';

export const courseKey = (c: CourseRef) => `${c.classId ?? c.groupId}:${c.subjectId}`;
const subjectSelect = { id: true, name: true, code: true, color: true } as const;
const name = (p: { firstName: string; lastName: string }) => `${p.lastName} ${p.firstName}`.trim();

/**
 * Noten (PN-02, ADR 0018). Rechte über das policy-Modul: eintragen `grade.write` (Lehrkraft des Fachs in dieser
 * Klasse oder Gruppe), lesen `grade.read` (Lehrkraft, KV der Klasse, Direktion, Administration; Schüler:innen und
 * Eltern nur freigegebene Noten über `forStudent`).
 */
@Injectable()
export class GradesService {
  constructor(
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private resource = (c: CourseRef) => ({
    classId: c.classId ?? c.groupId!,
    subjectId: c.subjectId,
  });
  canRead = (user: PolicyUser, c: CourseRef) => can(user, 'grade.read', this.resource(c));
  canWrite = (user: PolicyUser, c: CourseRef) => can(user, 'grade.write', this.resource(c));

  private async tz(tx: Tx, tenantId: string) {
    const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    return { tz: t.timezone, settings: tenantSettingsSchema.parse(t.settings) };
  }

  async currentYear(tx: Tx) {
    const y = await tx.schoolYear.findFirst({
      where: { isCurrent: true },
      select: { id: true, startsOn: true, endsOn: true },
    });
    if (!y) throw new UnprocessableEntityException({ title: 'Es gibt kein aktuelles Schuljahr' });
    return y;
  }

  /** Kurs prüfen (Klasse oder Gruppe des Schuljahres, Fach) und Bezeichnung liefern. */
  private async course(tx: Tx, c: CourseRef, schoolYearId: string) {
    const [subject, cls, grp] = await Promise.all([
      tx.subject.findUnique({ where: { id: c.subjectId }, select: subjectSelect }),
      c.classId
        ? tx.schoolClass.findFirst({
            where: { id: c.classId, schoolYearId },
            select: { name: true },
          })
        : null,
      c.groupId
        ? tx.group.findFirst({ where: { id: c.groupId, schoolYearId }, select: { name: true } })
        : null,
    ]);
    const label = cls?.name ?? grp?.name;
    if (!subject || !label)
      throw new NotFoundException({ title: 'Fach oder Klasse nicht gefunden' });
    return { subject, label };
  }

  /** Schüler:innen des Kurses heute (Klasse: Einschreibung, Gruppe: Mitglieder), ohne anonymisierte. */
  private async students(tx: Tx, c: CourseRef, day: string) {
    const ids = c.classId
      ? (await currentEnrollments(tx, { classId: { in: [c.classId] } }, day)).map(
          (e) => e.studentId,
        )
      : (
          await tx.groupMember.findMany({
            where: { groupId: c.groupId! },
            select: { studentId: true },
          })
        ).map((m) => m.studentId);
    const people = await tx.person.findMany({
      where: { id: { in: ids }, anonymizedAt: null },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    });
    return people.map((p) => ({ id: p.id, name: name(p) }));
  }

  private async weights(tx: Tx, schoolYearId: string, key: string) {
    const w = await tx.gradeWeighting.findUnique({
      where: { schoolYearId_courseKey: { schoolYearId, courseKey: key } },
    });
    const parsed = w ? gradeWeightsSchema.safeParse(w.weights) : null;
    return parsed?.success
      ? { weights: parsed.data as GradeWeights, isDefault: false }
      : { weights: DEFAULT_WEIGHTS, isDefault: true };
  }

  // ───────────── Kurse ─────────────

  /** Eigene Kurse (Lehrkraft) oder die Fächer einer Klasse (KV, Direktion, Administration). */
  async courses(tx: Tx, user: PolicyUser, classId?: string): Promise<CourseSummary[]> {
    const year = await this.currentYear(tx);
    const lessons = await tx.lesson.findMany({
      where: {
        timetable: { status: 'PUBLISHED' },
        ...(classId ? { classId } : { teachers: { some: { teacherId: user.personId } } }),
      },
      select: {
        classId: true,
        groupId: true,
        subject: { select: subjectSelect },
        class: { select: { name: true } },
        group: { select: { name: true } },
      },
    });
    const seen = new Map<string, CourseSummary>();
    for (const l of lessons) {
      const ref = { classId: l.classId, groupId: l.groupId, subjectId: l.subject.id };
      if (!l.classId && !l.groupId) continue;
      const key = courseKey(ref);
      if (seen.has(key) || !this.canRead(user, ref)) continue;
      seen.set(key, {
        ...ref,
        label: l.class?.name ?? l.group?.name ?? '',
        subject: l.subject,
        assessments: 0,
        unreleased: 0,
      });
    }
    const counts = await tx.assessment.groupBy({
      by: ['courseKey', 'releasedAt'],
      where: { schoolYearId: year.id, courseKey: { in: [...seen.keys()] } },
      _count: { _all: true },
    });
    for (const c of counts) {
      const s = seen.get(c.courseKey);
      if (!s) continue;
      s.assessments += c._count._all;
      if (!c.releasedAt) s.unreleased += c._count._all;
    }
    return [...seen.values()].sort(
      (a, b) =>
        a.label.localeCompare(b.label, 'de') || a.subject.name.localeCompare(b.subject.name, 'de'),
    );
  }

  async detail(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    c: CourseRef,
  ): Promise<CourseDetail> {
    if (!this.canRead(user, c))
      throw new ForbiddenException({ title: 'Keine Berechtigung für diese Noten' });
    const year = await this.currentYear(tx);
    const { tz } = await this.tz(tx, tenantId);
    const key = courseKey(c);
    const [{ subject, label }, students, w, assessments, exams] = await Promise.all([
      this.course(tx, c, year.id),
      this.students(tx, c, todayIn(tz)),
      this.weights(tx, year.id, key),
      tx.assessment.findMany({
        where: { schoolYearId: year.id, courseKey: key },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        include: { grades: { select: { studentId: true, value: true, comment: true } } },
      }),
      tx.exam.findMany({
        where: {
          subjectId: c.subjectId,
          ...(c.classId ? { classId: c.classId } : { groupId: c.groupId }),
          date: { gte: year.startsOn, lte: year.endsOn },
          assessment: { is: null },
        },
        orderBy: { date: 'asc' },
        select: { id: true, title: true, date: true, kind: true },
      }),
    ]);
    const canWrite = this.canWrite(user, c);
    if (!canWrite)
      await this.audit.record({
        tenantId,
        actorId: me.personId,
        action: 'grade.read',
        entity: 'course',
        entityId: key,
      });
    const grades: CourseDetail['grades'] = {};
    const comments: CourseDetail['comments'] = {};
    for (const a of assessments) {
      grades[a.id] = Object.fromEntries(a.grades.map((g) => [g.studentId, g.value]));
      comments[a.id] = Object.fromEntries(
        a.grades.filter((g) => g.comment).map((g) => [g.studentId, g.comment!]),
      );
    }
    const averages = Object.fromEntries(
      students.map((s) => [
        s.id,
        weightedAverage(
          assessments.flatMap((a) =>
            grades[a.id]![s.id] !== undefined
              ? [{ kind: a.kind, value: grades[a.id]![s.id]! }]
              : [],
          ),
          w.weights,
        ),
      ]),
    );
    return {
      course: {
        ...c,
        label,
        subject,
        assessments: assessments.length,
        unreleased: assessments.filter((a) => !a.releasedAt).length,
      },
      canWrite,
      weights: w.weights,
      defaultWeights: w.isDefault,
      students,
      assessments: assessments.map((a) => this.item(a)),
      grades,
      comments,
      averages,
      examSuggestions: exams.map((e) => ({
        id: e.id,
        title: e.title,
        date: iso(e.date),
        kind: kindFromExam(e.kind),
      })),
    };
  }

  private item(a: {
    id: string;
    kind: AssessmentKind;
    title: string;
    date: Date;
    examId: string | null;
    releasedAt: Date | null;
    grades: { value: number }[];
  }): AssessmentItem {
    return {
      id: a.id,
      kind: a.kind,
      title: a.title,
      date: iso(a.date),
      examId: a.examId,
      releasedAt: a.releasedAt?.toISOString() ?? null,
      distribution: gradeDistribution(a.grades.map((g) => g.value)),
    };
  }

  // ───────────── Schreiben ─────────────

  private assertWrite(user: PolicyUser, c: CourseRef) {
    if (!this.canWrite(user, c))
      throw new ForbiddenException({
        title: 'Noten trägt die Lehrkraft dieses Fachs in dieser Klasse ein',
      });
  }

  async setWeights(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    c: CourseRef,
    weights: GradeWeights,
  ) {
    this.assertWrite(user, c);
    const year = await this.currentYear(tx);
    await this.course(tx, c, year.id);
    const key = courseKey(c);
    await tx.gradeWeighting.upsert({
      where: { schoolYearId_courseKey: { schoolYearId: year.id, courseKey: key } },
      create: {
        tenantId,
        schoolYearId: year.id,
        courseKey: key,
        subjectId: c.subjectId,
        classId: c.classId,
        groupId: c.groupId,
        weights,
        updatedById: me.personId,
      },
      update: { weights, updatedById: me.personId },
    });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'grade.weighting',
      entity: 'course',
      entityId: key,
    });
    return { weights };
  }

  async createAssessment(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    input: z.infer<typeof assessmentInput>,
  ): Promise<AssessmentItem> {
    const c = input.course;
    this.assertWrite(user, c);
    const year = await this.currentYear(tx);
    await this.course(tx, c, year.id);
    if (input.examId) {
      const exam = await tx.exam.findUnique({
        where: { id: input.examId },
        include: { assessment: { select: { id: true } } },
      });
      if (
        !exam ||
        exam.subjectId !== c.subjectId ||
        (exam.classId ?? null) !== c.classId ||
        (exam.groupId ?? null) !== c.groupId
      )
        throw new UnprocessableEntityException({ title: 'Prüfung passt nicht zu Fach und Klasse' });
      if (exam.assessment)
        throw new ConflictException({ title: 'Für diese Prüfung gibt es schon Noten' });
    }
    const a = await tx.assessment.create({
      data: {
        tenantId,
        schoolYearId: year.id,
        courseKey: courseKey(c),
        subjectId: c.subjectId,
        classId: c.classId,
        groupId: c.groupId,
        kind: input.kind,
        title: input.title,
        date: asDate(input.date),
        examId: input.examId,
        createdById: me.personId,
      },
      include: { grades: { select: { value: true } } },
    });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'grade.assessment.create',
      entity: 'assessment',
      entityId: a.id,
    });
    return this.item(a);
  }

  /** Leistung mit Kurs laden und Schreibrecht prüfen. */
  private async writable(tx: Tx, user: PolicyUser, id: string) {
    const a = await tx.assessment.findUnique({ where: { id } });
    if (!a) throw new NotFoundException({ title: 'Leistung nicht gefunden' });
    const c = { classId: a.classId, groupId: a.groupId, subjectId: a.subjectId };
    this.assertWrite(user, c);
    return { a, c };
  }

  async patchAssessment(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    id: string,
    input: z.infer<typeof assessmentPatch>,
  ) {
    await this.writable(tx, user, id);
    const a = await tx.assessment.update({
      where: { id },
      data: {
        kind: input.kind,
        title: input.title,
        date: input.date ? asDate(input.date) : undefined,
      },
      include: { grades: { select: { value: true } } },
    });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'grade.assessment.update',
      entity: 'assessment',
      entityId: id,
    });
    return this.item(a);
  }

  async deleteAssessment(tx: Tx, tenantId: string, me: Principal, user: PolicyUser, id: string) {
    const { a } = await this.writable(tx, user, id);
    if (a.releasedAt)
      throw new ConflictException({
        title: 'Freigegebene Noten bleiben erhalten. Einzelne Noten lassen sich weiter ändern.',
      });
    await tx.assessment.delete({ where: { id } });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'grade.assessment.delete',
      entity: 'assessment',
      entityId: id,
    });
  }

  async setGrades(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    id: string,
    items: z.infer<typeof gradesInput>['items'],
  ) {
    const { a, c } = await this.writable(tx, user, id);
    const { tz } = await this.tz(tx, tenantId);
    const allowed = new Set((await this.students(tx, c, todayIn(tz))).map((s) => s.id));
    const foreign = items.find((i) => !allowed.has(i.studentId));
    if (foreign)
      throw new UnprocessableEntityException({ title: 'Die Person gehört nicht zu diesem Kurs' });
    for (const i of items) {
      if (i.value === null) {
        await tx.grade.deleteMany({ where: { assessmentId: id, studentId: i.studentId } });
        continue;
      }
      await tx.grade.upsert({
        where: { assessmentId_studentId: { assessmentId: id, studentId: i.studentId } },
        create: {
          tenantId,
          assessmentId: id,
          studentId: i.studentId,
          value: i.value,
          comment: i.comment,
          updatedById: me.personId,
        },
        update: { value: i.value, comment: i.comment, updatedById: me.personId },
      });
    }
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'grade.write',
      entity: 'assessment',
      entityId: id,
      meta: { count: items.length, released: a.releasedAt !== null },
    });
    const fresh = await tx.assessment.findUniqueOrThrow({
      where: { id },
      include: { grades: { select: { value: true } } },
    });
    return this.item(fresh);
  }

  /** Freigeben: Schüler:innen und Eltern sehen die Noten und bekommen einen Hinweis (ohne Note). */
  async release(tx: Tx, tenantId: string, me: Principal, user: PolicyUser, id: string) {
    const { a } = await this.writable(tx, user, id);
    if (a.releasedAt) return { releasedAt: a.releasedAt.toISOString() };
    const now = new Date();
    await tx.assessment.update({ where: { id }, data: { releasedAt: now } });
    const graded = await tx.grade.findMany({
      where: { assessmentId: id },
      select: { studentId: true },
    });
    const ids = graded.map((g) => g.studentId);
    const { tz } = await this.tz(tx, tenantId);
    const [subject, links, accounts] = await Promise.all([
      tx.subject.findUniqueOrThrow({ where: { id: a.subjectId }, select: { name: true } }),
      guardianLinks(tx, ids, todayIn(tz)),
      tx.user.findMany({ where: { personId: { in: ids } }, select: { personId: true } }),
    ]);
    const params = { subject: subject.name };
    await this.notifications.emit(
      tx,
      tenantId,
      'grade.released',
      accounts.map((u) => u.personId),
      { params, url: '/noten' },
    );
    for (const l of links)
      await this.notifications.emit(tx, tenantId, 'grade.released', [l.guardianId], {
        params,
        url: `/noten?kind=${l.studentId}`,
      });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'grade.release',
      entity: 'assessment',
      entityId: id,
      meta: { count: ids.length },
    });
    return { releasedAt: now.toISOString() };
  }

  // ───────────── Übersichten ─────────────

  /** Durchschnitt je Schüler:in und Fach einer Klasse (alle Leistungen, auch nicht freigegebene). */
  async classOverview(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    classId: string,
  ): Promise<ClassGradesOverview> {
    if (!can(user, 'grade.read', { classId }))
      throw new ForbiddenException({ title: 'Keine Berechtigung für diese Klasse' });
    const year = await this.currentYear(tx);
    const cls = await tx.schoolClass.findFirst({
      where: { id: classId, schoolYearId: year.id },
      select: { name: true },
    });
    if (!cls) throw new NotFoundException({ title: 'Klasse nicht gefunden' });
    const { tz } = await this.tz(tx, tenantId);
    const students = await this.students(
      tx,
      { classId, groupId: null, subjectId: '' },
      todayIn(tz),
    );
    const [assessments, weightings] = await Promise.all([
      tx.assessment.findMany({
        where: { schoolYearId: year.id, classId },
        select: {
          subjectId: true,
          kind: true,
          courseKey: true,
          subject: { select: { id: true, name: true, code: true } },
          grades: { select: { studentId: true, value: true } },
        },
      }),
      tx.gradeWeighting.findMany({ where: { schoolYearId: year.id, classId } }),
    ]);
    const weightsOf = (key: string) => {
      const w = weightings.find((x) => x.courseKey === key);
      const p = w ? gradeWeightsSchema.safeParse(w.weights) : null;
      return p?.success ? (p.data as GradeWeights) : DEFAULT_WEIGHTS;
    };
    const subjects = [...new Map(assessments.map((a) => [a.subject.id, a.subject])).values()].sort(
      (a, b) => a.name.localeCompare(b.name, 'de'),
    );
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'grade.read',
      entity: 'class',
      entityId: classId,
    });
    return {
      classId,
      className: cls.name,
      subjects,
      students: students.map((s) => ({
        ...s,
        averages: Object.fromEntries(
          subjects.map((sub) => {
            const of = assessments.filter((a) => a.subjectId === sub.id);
            return [
              sub.id,
              weightedAverage(
                of.flatMap((a) =>
                  a.grades
                    .filter((g) => g.studentId === s.id)
                    .map((g) => ({ kind: a.kind, value: g.value })),
                ),
                weightsOf(of[0]!.courseKey),
              ),
            ];
          }),
        ),
      })),
    };
  }

  /** Eigene Noten oder die eines Kindes: nur freigegebene Leistungen, mit Notenspiegel. */
  async forStudent(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    studentId: string,
  ): Promise<StudentGrades> {
    // Diese Ansicht ist für die Person selbst und ihre Eltern; Lehrkräfte und Direktion nutzen Kurs und Klasse
    const self = studentId === me.personId;
    const allowed = self
      ? can(user, 'grade.read', { studentId })
      : (user.guardianOfStudentIds ?? []).includes(studentId);
    if (!allowed) throw new ForbiddenException({ title: 'Keine Berechtigung für diese Noten' });
    const { tz, settings } = await this.tz(tx, tenantId);
    const person = await tx.person.findUnique({
      where: { id: studentId },
      select: { id: true, firstName: true, lastName: true, birthDate: true },
    });
    if (!person) throw new NotFoundException({ title: 'Person nicht gefunden' });
    const minAge = settings.ageLimits.seeGradesFrom;
    if (studentId === me.personId && minAge > 0 && person.birthDate) {
      const age = DateTime.fromISO(todayIn(tz)).diff(
        DateTime.fromJSDate(person.birthDate),
        'years',
      ).years;
      if (age < minAge)
        throw new ForbiddenException({ title: `Noten sind ab ${minAge} Jahren sichtbar` });
    }
    const year = await this.currentYear(tx);
    const assessments = await tx.assessment.findMany({
      where: {
        schoolYearId: year.id,
        releasedAt: { not: null },
        grades: { some: { studentId } },
      },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        kind: true,
        title: true,
        date: true,
        courseKey: true,
        subject: { select: subjectSelect },
        grades: { select: { studentId: true, value: true, comment: true } },
      },
    });
    const keys = [...new Set(assessments.map((a) => a.courseKey))];
    const weightings = await tx.gradeWeighting.findMany({
      where: { schoolYearId: year.id, courseKey: { in: keys } },
    });
    const bySubject = new Map<string, StudentGrades['subjects'][number]>();
    for (const a of assessments) {
      const w = weightings.find((x) => x.courseKey === a.courseKey);
      const p = w ? gradeWeightsSchema.safeParse(w.weights) : null;
      const s = bySubject.get(a.subject.id) ?? {
        subject: a.subject,
        average: null,
        weights: p?.success ? (p.data as GradeWeights) : DEFAULT_WEIGHTS,
        assessments: [],
      };
      const own = a.grades.find((g) => g.studentId === studentId);
      s.assessments.push({
        id: a.id,
        kind: a.kind,
        title: a.title,
        date: iso(a.date),
        value: own?.value ?? null,
        comment: own?.comment ?? null,
        distribution: gradeDistribution(a.grades.map((g) => g.value)),
      });
      bySubject.set(a.subject.id, s);
    }
    const subjects = [...bySubject.values()]
      .map((s) => ({
        ...s,
        average: weightedAverage(
          s.assessments.flatMap((a) =>
            a.value === null ? [] : [{ kind: a.kind, value: a.value }],
          ),
          s.weights,
        ),
      }))
      .sort((a, b) => a.subject.name.localeCompare(b.subject.name, 'de'));
    if (studentId !== me.personId)
      await this.audit.record({
        tenantId,
        actorId: me.personId,
        action: 'grade.read',
        entity: 'person',
        entityId: studentId,
      });
    return { student: { id: person.id, name: `${person.firstName} ${person.lastName}` }, subjects };
  }
}
