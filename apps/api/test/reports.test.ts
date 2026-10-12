import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '@sp/shared';
import { Harness, type Client } from './support/harness';
import { at, enroll, occurrence, smallSchool, today } from './support/school';

describe('Lagebild (DB-02) und Auswertungen (DB-03)', () => {
  let h: Harness;
  let principal: Client;
  let homeroom: Client;
  let teacher: Client;
  const ids = {} as Record<
    'c1' | 'c2' | 'teacher' | 'sub' | 'student' | 'cancelled' | 'open',
    string
  >;
  const yesterday = addDays(today, -1);

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.createTenant('rep');
    const s = await smallSchool(h, t.id);
    ids.c1 = s.c1.id;
    ids.c2 = s.c2.id;
    const tu = await h.createUser(t.id, [{ role: 'TEACHER' }]);
    const su = await h.createUser(t.id, [{ role: 'TEACHER' }]);
    const hu = await h.createUser(t.id, [
      { role: 'TEACHER' },
      { role: 'HOMEROOM', classId: s.c1.id },
    ]);
    const pu = await h.createUser(t.id, [{ role: 'PRINCIPAL' }]);
    ids.teacher = tu.personId;
    ids.sub = su.personId;
    const st = await h.createUser(t.id, [{ role: 'STUDENT' }], undefined, 'STUDENT');
    ids.student = st.personId;
    await enroll(h, t.id, st.personId, s.c1.id);
    const base = { subjectId: s.math.id, classId: s.c1.id, teacherId: tu.personId };

    // Heute: eine entfallene Stunde, eine offene Supplierung (Lehrkraft krank)
    ids.cancelled = await occurrence(h, t.id, { ...base, date: today, period: 5 });
    await h.owner.occurrence.update({
      where: { id: ids.cancelled },
      data: { status: 'CANCELLED' },
    });
    ids.open = await occurrence(h, t.id, { ...base, date: today, period: 6 });
    const absence = await h.owner.teacherAbsence.create({
      data: {
        tenantId: t.id,
        teacherId: tu.personId,
        kind: 'SICK',
        fromAt: at(today, '00:00'),
        toAt: at(today, '23:59'),
      },
    });
    await h.owner.substitution.create({
      data: {
        tenantId: t.id,
        occurrenceId: ids.open,
        kind: 'SUBSTITUTE',
        teacherAbsenceId: absence.id,
      },
    });

    // Gestern: Stunde ohne abgeschlossenes Klassenbuch, Schüler:in abwesend; eine veröffentlichte Vertretung
    const past = await occurrence(h, t.id, { ...base, date: yesterday, period: 1 });
    await h.owner.attendance.create({
      data: {
        tenantId: t.id,
        occurrenceId: past,
        studentId: st.personId,
        status: 'ABSENT',
        recordedById: tu.personId,
      },
    });
    const late = await occurrence(h, t.id, { ...base, date: yesterday, period: 2 });
    await h.owner.attendance.create({
      data: {
        tenantId: t.id,
        occurrenceId: late,
        studentId: st.personId,
        status: 'LATE',
        lateMinutes: 7,
        recordedById: tu.personId,
      },
    });
    await h.owner.classbookEntry.create({
      data: { tenantId: t.id, occurrenceId: late, closedAt: new Date(), closedById: tu.personId },
    });
    const subbed = await occurrence(h, t.id, { ...base, date: yesterday, period: 3 });
    await h.owner.occurrence.update({ where: { id: subbed }, data: { status: 'SUBSTITUTED' } });
    await h.owner.classbookEntry.create({
      data: { tenantId: t.id, occurrenceId: subbed, closedAt: new Date(), closedById: su.personId },
    });
    const yAbsence = await h.owner.teacherAbsence.create({
      data: {
        tenantId: t.id,
        teacherId: tu.personId,
        kind: 'SICK',
        fromAt: at(yesterday, '00:00'),
        toAt: at(yesterday, '23:59'),
      },
    });
    await h.owner.substitution.create({
      data: {
        tenantId: t.id,
        occurrenceId: subbed,
        kind: 'SUBSTITUTE',
        status: 'PUBLISHED',
        substituteTeacherId: su.personId,
        teacherAbsenceId: yAbsence.id,
        publishedAt: new Date(),
      },
    });
    await h.owner.absence.create({
      data: {
        tenantId: t.id,
        studentId: st.personId,
        fromAt: at(yesterday, '08:00'),
        toAt: at(yesterday, '08:50'),
        status: 'REPORTED',
        reportedById: st.personId,
      },
    });
    principal = (await h.loginFully(t.slug, pu.email)).client;
    homeroom = (await h.loginFully(t.slug, hu.email)).client;
    teacher = (await h.loginFully(t.slug, tu.email)).client;
  });
  afterAll(async () => h.close());

  it('Lagebild zeigt Fehlende, Entfall, offene Supplierungen und fehlende Einträge', async () => {
    const res = await principal.get('/dashboard/principal');
    expect(res.status).toBe(200);
    expect(res.json.date).toBe(today);
    expect(res.json.cards).toMatchObject({
      teachersAbsent: 1,
      cancelled: 1,
      openSubstitutions: 1,
      pendingExcuses: 1,
    });
    expect(res.json.cards.missingClassbook).toBeGreaterThanOrEqual(1);
    expect(res.json.missingClassbook.map((m: { date: string }) => m.date)).toContain(yesterday);
    expect(res.json.teachersAbsent[0]).toMatchObject({ affected: 1, open: 1 });
    const kinds = Object.fromEntries(
      res.json.timeline.map((x: { occurrenceId: string; kind: string }) => [
        x.occurrenceId,
        x.kind,
      ]),
    );
    expect(kinds[ids.cancelled]).toBe('cancelled');
    expect(kinds[ids.open]).toBe('open');

    const y = await principal.get(`/dashboard/principal?date=${yesterday}`);
    expect(y.json.cards.studentsAbsent).toBe(1);
    expect(y.json.timeline.some((x: { kind: string }) => x.kind === 'substituted')).toBe(true);
  });

  it('Lagebild nur für Direktion und Administration', async () => {
    expect((await teacher.get('/dashboard/principal')).status).toBe(403);
    expect((await homeroom.get('/dashboard/principal')).status).toBe(403);
  });

  it('Anwesenheit je Klasse und je Schüler:in, Klassenvorstand nur für die eigene Klasse', async () => {
    const q = `from=${addDays(today, -7)}&to=${today}`;
    const all = await principal.get(`/reports/attendance?${q}`);
    expect(all.status).toBe(200);
    const c1 = all.json.classes.find((c: { classId: string }) => c.classId === ids.c1);
    expect(c1).toMatchObject({ students: 1, lessons: 2, absentLessons: 1, lateLessons: 1 });
    expect(c1.absences.reported).toBe(1);
    expect(all.json.students).toBeNull();

    const own = await homeroom.get(`/reports/attendance?${q}`);
    expect(own.json.classes.map((c: { classId: string }) => c.classId)).toEqual([ids.c1]);
    expect(own.json.students[0]).toMatchObject({
      absentLessons: 1,
      lateLessons: 1,
      lateMinutes: 7,
    });
    expect((await homeroom.get(`/reports/attendance?${q}&classId=${ids.c2}`)).status).toBe(403);
    expect((await teacher.get(`/reports/attendance?${q}`)).status).toBe(403);
    expect((await principal.get(`/reports/attendance?from=${today}&to=${yesterday}`)).status).toBe(
      400,
    );
  });

  it('CSV-Export für Excel (Strichpunkt, BOM)', async () => {
    const res = await principal.get(
      `/reports/attendance?from=${addDays(today, -7)}&to=${today}&classId=${ids.c1}&format=csv`,
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text.split('\r\n')[0]).toContain('Schüler:in;Abwesend (Stunden)');
  });

  it('Supplierstunden je Lehrkraft', async () => {
    const res = await principal.get(
      `/reports/substitutions?from=${addDays(today, -7)}&to=${today}`,
    );
    expect(res.json.totals).toEqual({
      substitutions: 1,
      supervisions: 0,
      cancelled: 0,
      roomChanges: 0,
    });
    const sub = res.json.teachers.find((t: { teacherId: string }) => t.teacherId === ids.sub);
    const absent = res.json.teachers.find(
      (t: { teacherId: string }) => t.teacherId === ids.teacher,
    );
    expect(sub.substituted).toBe(1);
    expect(absent.missed).toBe(1);
    expect((await homeroom.get(`/reports/substitutions?from=${today}&to=${today}`)).status).toBe(
      403,
    );
  });
});
