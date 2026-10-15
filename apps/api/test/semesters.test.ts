import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '@sp/shared';
import { courseKey } from '../src/modules/grades/grades.service';
import { Harness, type Client } from './support/harness';
import { day, enroll, lesson, smallSchool, today } from './support/school';

/**
 * Semester (SD-01, ADR 0022): Beginn des 2. Semesters am Schuljahr oder aus den Semesterferien, Notenfilter je
 * Semester, Frühwarnung zählt unentschuldigte Stunden im laufenden Semester.
 */
describe('Semester', () => {
  let h: Harness;
  let tenantId = '';
  let admin: Client;
  let teacher: Client;
  let student: Client;
  const ids = {} as Record<'year' | 'c1' | 'math' | 'teacher' | 'student', string>;
  // Schuljahr: Beginn vor 120 Tagen, Ende in 200 Tagen; 2. Semester hat vor 10 Tagen begonnen
  const second = addDays(today, -10);

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.tenantWithAdmin('sem');
    tenantId = t.tenant.id;
    admin = t.admin;
    const s = await smallSchool(h, tenantId);
    ids.year = s.year.id;
    ids.c1 = s.c1.id;
    ids.math = s.math.id;
    const tu = await h.createUser(tenantId, [{ role: 'TEACHER' }]);
    ids.teacher = tu.personId;
    await lesson(h, tenantId, s.version.id, {
      subjectId: s.math.id,
      classId: s.c1.id,
      teacherId: tu.personId,
    });
    const su = await h.createUser(tenantId, [{ role: 'STUDENT' }], undefined, 'STUDENT');
    ids.student = su.personId;
    await enroll(h, tenantId, su.personId, s.c1.id);
    teacher = (await h.loginFully(t.tenant.slug, tu.email)).client;
    student = (await h.loginFully(t.tenant.slug, su.email)).client;
  });
  afterAll(async () => h.close());

  it('ohne Angabe gilt der Tag nach den Semesterferien; eingetragen gilt der Eintrag', async () => {
    const before = await admin.get(`/admin/school-years/${ids.year}`);
    expect(before.json.semesters).toBeNull();
    await admin.post(`/admin/school-years/${ids.year}/free-days`, {
      fromDate: addDays(second, -7),
      toDate: addDays(second, -1),
      label: 'Semesterferien',
    });
    const derived = await admin.get(`/admin/school-years/${ids.year}`);
    expect(derived.json).toMatchObject({ secondSemesterFrom: null });
    expect(derived.json.semesters[1]).toMatchObject({ no: 2, from: second });
    expect(
      (
        await admin.patch(`/admin/school-years/${ids.year}`, {
          secondSemesterFrom: addDays(today, 400),
        })
      ).status,
    ).toBe(400);
    const set = await admin.patch(`/admin/school-years/${ids.year}`, {
      secondSemesterFrom: second,
    });
    expect(set.json).toMatchObject({ secondSemesterFrom: second });
  });

  it('Noten: Filter je Semester für Kurs, Klasse und eigene Noten', async () => {
    const key = courseKey({ classId: ids.c1, groupId: null, subjectId: ids.math });
    for (const [title, date, value] of [
      ['Schularbeit 1', addDays(second, -30), 1],
      ['Schularbeit 2', addDays(second, 3), 5],
    ] as const) {
      const a = await h.owner.assessment.create({
        data: {
          tenantId,
          schoolYearId: ids.year,
          courseKey: key,
          subjectId: ids.math,
          classId: ids.c1,
          kind: 'SCHULARBEIT',
          title,
          date: day(date),
          releasedAt: new Date(),
          createdById: ids.teacher,
        },
      });
      await h.owner.grade.create({
        data: {
          tenantId,
          assessmentId: a.id,
          studentId: ids.student,
          value,
          updatedById: ids.teacher,
        },
      });
    }
    const q = `/grades/course?classId=${ids.c1}&subjectId=${ids.math}`;
    const all = await teacher.get(q);
    expect(all.json).toMatchObject({ semester: null, averages: { [ids.student]: 3 } });
    expect(all.json.semesters).toHaveLength(2);
    const s1 = await teacher.get(`${q}&semester=1`);
    expect(s1.json.assessments.map((a: { title: string }) => a.title)).toEqual(['Schularbeit 1']);
    expect(s1.json).toMatchObject({ semester: 1, averages: { [ids.student]: 1 } });
    const mine = await student.get('/me/grades?semester=2');
    expect(mine.json.subjects[0]).toMatchObject({ average: 5 });
    expect(mine.json.semester).toBe(2);
    expect((await teacher.get(`${q}&semester=3`)).status).toBe(400);
  });

  it('Frühwarnung: unentschuldigte Stunden zählen im laufenden Semester', async () => {
    await h.owner.tenant.update({
      where: { id: tenantId },
      data: { settings: { absence: { warnUnexcusedLessons: 1, warnLessons: 0 } } },
    });
    for (const d of [addDays(second, -20), addDays(today, -1)]) {
      const o = await h.owner.occurrence.create({
        data: {
          tenantId,
          date: day(d),
          periodStart: 1,
          periodCount: 1,
          startsAt: new Date(`${d}T07:00:00Z`),
          endsAt: new Date(`${d}T07:50:00Z`),
          subjectId: ids.math,
          classId: ids.c1,
        },
      });
      await h.owner.attendance.create({
        data: {
          tenantId,
          occurrenceId: o.id,
          studentId: ids.student,
          status: 'ABSENT',
          recordedById: ids.teacher,
        },
      });
      await h.owner.absence.create({
        data: {
          tenantId,
          studentId: ids.student,
          fromAt: new Date(`${d}T00:00:00Z`),
          toAt: new Date(`${d}T23:00:00Z`),
          status: 'UNEXCUSED',
          origin: 'CLASSBOOK',
          reportedById: ids.teacher,
        },
      });
    }
    const r = await admin.get(`/absences/warnings?classId=${ids.c1}`);
    expect(r.json.since).toBe('SEMESTER');
    expect(r.json.data[0]).toMatchObject({ studentId: ids.student, unexcused: 1 });
  });
});
