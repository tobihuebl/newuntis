import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '@sp/shared';
import { Harness, type Client } from './support/harness';
import { day, enroll, lesson, occurrence, smallSchool, today } from './support/school';

/**
 * Mehrstündige Prüfungen (ADR 0024): andere Stunden der Klasse entfallen automatisch und kommen beim Ändern
 * oder Löschen zurück; der Plan zeigt Prüfungen und schulfreie Tage.
 */
describe('Prüfungen mit Stunden und schulfreie Tage im Plan', () => {
  let h: Harness;
  let tenantId = '';
  let teacher: Client;
  const ids = {} as Record<
    'c1' | 'math' | 'eng' | 'yearId' | 't' | 'o' | 'student' | 'm1' | 'e2' | 'e3' | 'e5' | 'exam',
    string
  >;
  const D = addDays(today, 7);

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.tenantWithAdmin('exper');
    tenantId = t.tenant.id;
    const s = await smallSchool(h, tenantId);
    Object.assign(ids, { c1: s.c1.id, math: s.math.id, eng: s.eng.id, yearId: s.year.id });
    const tu = await h.createUser(tenantId, [{ role: 'TEACHER' }]);
    const ou = await h.createUser(tenantId, [{ role: 'TEACHER' }]);
    ids.t = tu.personId;
    ids.o = ou.personId;
    await lesson(h, tenantId, s.version.id, {
      subjectId: s.math.id,
      classId: s.c1.id,
      teacherId: tu.personId,
    });
    const su = await h.createUser(tenantId, [{ role: 'STUDENT' }], undefined, 'STUDENT');
    ids.student = su.personId;
    await enroll(h, tenantId, su.personId, s.c1.id);
    const occ = (period: number, subjectId: string, teacherId: string) =>
      occurrence(h, tenantId, { date: D, period, subjectId, classId: s.c1.id, teacherId });
    ids.m1 = await occ(1, s.math.id, tu.personId);
    ids.e2 = await occ(2, s.eng.id, ou.personId);
    ids.e3 = await occ(3, s.eng.id, ou.personId);
    ids.e5 = await occ(5, s.eng.id, ou.personId);
    // Stunde 3 hat schon Anwesenheit: wird nie angefasst
    await h.owner.attendance.create({
      data: {
        tenantId,
        occurrenceId: ids.e3,
        studentId: su.personId,
        status: 'PRESENT',
        recordedById: ou.personId,
      },
    });
    teacher = (await h.loginFully(t.tenant.slug, tu.email)).client;
  });
  afterAll(async () => h.close());

  const status = async (id: string) =>
    (await h.owner.occurrence.findUniqueOrThrow({ where: { id } })).status;

  it('Prüfung 1. bis 4. Stunde: andere Fächer entfallen, eigenes Fach und angefasste Termine bleiben', async () => {
    const base = {
      classId: ids.c1,
      subjectId: ids.math,
      date: D,
      title: 'SA 1',
      kind: 'Schularbeit',
    };
    expect((await teacher.post('/exams', { ...base, periodStart: 1, periodEnd: 9 })).status).toBe(
      400,
    );
    expect((await teacher.post('/exams', { ...base, periodStart: 3, periodEnd: 2 })).status).toBe(
      400,
    );
    const r = await teacher.post('/exams', { ...base, periodStart: 1, periodEnd: 4 });
    expect(r.status).toBe(201);
    ids.exam = r.json.exam.id;
    expect(r.json.exam).toMatchObject({ periodStart: 1, periodCount: 4 });
    expect([
      await status(ids.m1),
      await status(ids.e2),
      await status(ids.e3),
      await status(ids.e5),
    ]).toEqual(['SCHEDULED', 'CANCELLED', 'SCHEDULED', 'SCHEDULED']);
    expect(
      await h.owner.notification.count({
        where: { personId: ids.o, type: 'substitution.published' },
      }),
    ).toBe(1);
  });

  it('Plan zeigt die Prüfung, den Grund des Entfalls und schulfreie Tage', async () => {
    await h.owner.schoolFreeDay.create({
      data: {
        tenantId,
        schoolYearId: ids.yearId,
        fromDate: day(addDays(D, 1)),
        toDate: day(addDays(D, 2)),
        label: 'Herbstferien',
      },
    });
    const p = await teacher.get(`/classes/${ids.c1}/timetable?from=${D}&to=${addDays(D, 2)}`);
    expect(p.status).toBe(200);
    expect(p.json.exams).toEqual([
      expect.objectContaining({ id: ids.exam, periodStart: 1, periodCount: 4, title: 'SA 1' }),
    ]);
    const e2 = p.json.entries.find((e: { id: string }) => e.id === ids.e2);
    expect(e2).toMatchObject({ status: 'CANCELLED', displacedBy: { title: 'SA 1', subject: 'M' } });
    expect(p.json.freeDays).toEqual([
      { date: addDays(D, 1), label: 'Herbstferien' },
      { date: addDays(D, 2), label: 'Herbstferien' },
    ]);
    // Lehrerplan der Lehrkraft, die die Prüfung beaufsichtigt
    const mine = await teacher.get(`/me/timetable?from=${D}&to=${D}`);
    expect(mine.json.exams.map((x: { id: string }) => x.id)).toEqual([ids.exam]);
  });

  it('Stunden ändern oder entfernen nimmt den Entfall zurück; Löschen ebenso', async () => {
    expect(
      (await teacher.patch(`/exams/${ids.exam}`, { periodStart: 1, periodEnd: 1 })).status,
    ).toBe(200);
    expect(await status(ids.e2)).toBe('SCHEDULED');
    await teacher.patch(`/exams/${ids.exam}`, { periodStart: 2, periodEnd: 5 });
    expect([await status(ids.e2), await status(ids.e5)]).toEqual(['CANCELLED', 'CANCELLED']);
    expect((await teacher.del(`/exams/${ids.exam}`)).status).toBe(204);
    expect([await status(ids.e2), await status(ids.e5)]).toEqual(['SCHEDULED', 'SCHEDULED']);
  });

  it('Heute an einem schulfreien Tag: freier Tag als eigener Eintrag', async () => {
    await h.owner.schoolFreeDay.create({
      data: {
        tenantId,
        schoolYearId: ids.yearId,
        fromDate: day(today),
        toDate: day(today),
        label: 'Nationalfeiertag',
      },
    });
    const r = await teacher.get('/today');
    expect(r.json.freeDay).toEqual({ date: today, label: 'Nationalfeiertag' });
    expect(r.json.examsToday).toEqual([]);
  });
});
