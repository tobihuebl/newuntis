import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '@sp/shared';
import { Harness, type Client } from './support/harness';
import { day, enroll, lesson, smallSchool, today } from './support/school';

/** Noten (PN-02): eintragen durch die Lehrkraft, Gewichtung, Freigabe, Sichtbarkeit je Rolle. */
describe('Noten', () => {
  let h: Harness;
  let tenantId = '';
  let admin: Client;
  let teacher: Client;
  let other: Client;
  let homeroom: Client;
  let principal: Client;
  let student: Client;
  let guardian: Client;
  const ids = {} as Record<
    'math' | 'c1' | 'c2' | 's1' | 's2' | 's3' | 'g' | 'sa' | 'teacher' | 'version',
    string
  >;
  const course = () => ({ classId: ids.c1, subjectId: ids.math });
  const q = () => `/grades/course?classId=${ids.c1}&subjectId=${ids.math}`;

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.tenantWithAdmin('nt');
    tenantId = t.tenant.id;
    admin = t.admin;
    const s = await smallSchool(h, tenantId);
    ids.math = s.math.id;
    ids.c1 = s.c1.id;
    ids.c2 = s.c2.id;
    ids.version = s.version.id;
    const tu = await h.createUser(tenantId, [{ role: 'TEACHER' }]);
    const ou = await h.createUser(tenantId, [{ role: 'TEACHER' }]);
    const hu = await h.createUser(tenantId, [
      { role: 'TEACHER' },
      { role: 'HOMEROOM', classId: s.c1.id },
    ]);
    const pu = await h.createUser(tenantId, [{ role: 'PRINCIPAL' }], undefined, 'STAFF');
    ids.teacher = tu.personId;
    await lesson(h, tenantId, s.version.id, {
      subjectId: s.math.id,
      classId: s.c1.id,
      teacherId: tu.personId,
    });
    await lesson(h, tenantId, s.version.id, {
      subjectId: s.eng.id,
      classId: s.c1.id,
      teacherId: ou.personId,
    });
    const st = [];
    for (const [k, cls] of [
      ['s1', s.c1.id],
      ['s2', s.c1.id],
      ['s3', s.c2.id],
    ] as const) {
      const u = await h.createUser(tenantId, [{ role: 'STUDENT' }], undefined, 'STUDENT');
      ids[k] = u.personId;
      await enroll(h, tenantId, u.personId, cls);
      st.push(u);
    }
    const g = await h.createUser(tenantId, [{ role: 'GUARDIAN' }], undefined, 'GUARDIAN');
    ids.g = g.personId;
    await h.owner.guardianLink.create({
      data: {
        tenantId,
        guardianId: g.personId,
        studentId: ids.s1,
        validFrom: day(addDays(today, -100)),
      },
    });
    teacher = (await h.loginFully(t.tenant.slug, tu.email)).client;
    other = (await h.loginFully(t.tenant.slug, ou.email)).client;
    homeroom = (await h.loginFully(t.tenant.slug, hu.email)).client;
    principal = (await h.loginFully(t.tenant.slug, pu.email)).client;
    student = (await h.loginFully(t.tenant.slug, st[0]!.email)).client;
    guardian = (await h.loginFully(t.tenant.slug, g.email)).client;
  });
  afterAll(async () => h.close());

  it('Lehrkraft sieht ihre Kurse, trägt eine Schularbeit ein und bewertet nur eigene Schüler:innen', async () => {
    const courses = await teacher.get('/grades/courses');
    expect(courses.json.data).toEqual([
      expect.objectContaining({ classId: ids.c1, label: '1A', subjectId: ids.math }),
    ]);
    const a = await teacher.post('/grades/assessments', {
      course: course(),
      kind: 'SCHULARBEIT',
      title: '1. Schularbeit',
      date: today,
    });
    expect(a.status).toBe(201);
    ids.sa = a.json.id;
    const put = await teacher.put(`/grades/assessments/${ids.sa}/grades`, {
      items: [
        { studentId: ids.s1, value: 2 },
        { studentId: ids.s2, value: 4, comment: 'Bruchrechnen üben' },
      ],
    });
    expect(put.json.distribution).toEqual({
      counts: { 1: 0, 2: 1, 3: 0, 4: 1, 5: 0 },
      average: 3,
    });
    expect(
      (
        await teacher.put(`/grades/assessments/${ids.sa}/grades`, {
          items: [{ studentId: ids.s3, value: 1 }],
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await teacher.put(`/grades/assessments/${ids.sa}/grades`, {
          items: [{ studentId: ids.s1, value: 6 }],
        })
      ).status,
    ).toBe(400);
  });

  it('nur die Lehrkraft des Fachs schreibt; KV, Direktion und Administration lesen', async () => {
    const body = { course: course(), kind: 'TEST', title: 'Test', date: today };
    expect((await other.post('/grades/assessments', body)).status).toBe(403);
    expect((await principal.post('/grades/assessments', body)).status).toBe(403);
    expect((await other.get(q())).status).toBe(403);
    for (const c of [homeroom, principal, admin]) {
      const r = await c.get(q());
      expect(r.status).toBe(200);
      expect(r.json.canWrite).toBe(false);
      expect(r.json.grades[ids.sa]).toEqual({ [ids.s1]: 2, [ids.s2]: 4 });
    }
    const own = await teacher.get(q());
    expect(own.json).toMatchObject({ canWrite: true, defaultWeights: true });
    expect(own.json.averages).toEqual({ [ids.s1]: 2, [ids.s2]: 4 });
    expect(
      await h.owner.auditLog.count({ where: { tenantId, action: 'grade.read', entity: 'course' } }),
    ).toBe(3);
  });

  it('Gewichtung: Summe 100 %, wirkt auf den Durchschnitt', async () => {
    const bad = await teacher.put('/grades/weighting', {
      course: course(),
      weights: { SCHULARBEIT: 50, TEST: 50, MUENDLICH: 10, MITARBEIT: 0 },
    });
    expect(bad.status).toBe(400);
    const t = await teacher.post('/grades/assessments', {
      course: course(),
      kind: 'TEST',
      title: 'Test 1',
      date: today,
    });
    await teacher.put(`/grades/assessments/${t.json.id}/grades`, {
      items: [{ studentId: ids.s1, value: 1 }],
    });
    const ok = await teacher.put('/grades/weighting', {
      course: course(),
      weights: { SCHULARBEIT: 60, TEST: 40, MUENDLICH: 0, MITARBEIT: 0 },
    });
    expect(ok.status).toBe(200);
    const r = await teacher.get(q());
    expect(r.json.defaultWeights).toBe(false);
    expect(r.json.averages[ids.s1]).toBe(1.6); // 0,6 × 2 + 0,4 × 1
  });

  it('Schüler:innen und Eltern sehen Noten erst nach der Freigabe, mit Notenspiegel', async () => {
    expect((await student.get('/me/grades')).json.subjects).toEqual([]);
    const rel = await teacher.post(`/grades/assessments/${ids.sa}/release`);
    expect(rel.status).toBe(200);
    const mine = await student.get('/me/grades');
    expect(mine.json.subjects).toEqual([
      expect.objectContaining({
        average: 2,
        assessments: [
          expect.objectContaining({
            title: '1. Schularbeit',
            value: 2,
            distribution: expect.objectContaining({ average: 3 }),
          }),
        ],
      }),
    ]);
    // Eltern: nur eigene Kinder
    expect((await guardian.get(`/me/grades?studentId=${ids.s1}`)).json.subjects).toHaveLength(1);
    expect((await guardian.get(`/me/grades?studentId=${ids.s2}`)).status).toBe(403);
    expect((await student.get(`/me/grades?studentId=${ids.s2}`)).status).toBe(403);
    const notes = await h.owner.notification.findMany({
      where: { tenantId, type: 'grade.released' },
    });
    expect(notes.map((n) => n.personId).sort()).toEqual([ids.g, ids.s1, ids.s2].sort());
    expect(JSON.stringify(notes)).not.toMatch(/"value"|Bruchrechnen/);
    // Datenauskunft der Person enthält freigegebene Noten
    expect((await student.get('/me/export')).json.grades).toEqual([
      expect.objectContaining({ title: '1. Schularbeit', value: 2 }),
    ]);
    // Freigegebene Leistungen bleiben erhalten
    expect((await teacher.del(`/grades/assessments/${ids.sa}`)).status).toBe(409);
  });

  it('Notenübersicht der Klasse: KV, Direktion, Administration; nicht eine Fachlehrkraft', async () => {
    const r = await homeroom.get(`/grades/classes/${ids.c1}`);
    expect(r.status).toBe(200);
    expect(r.json.students.find((s: { id: string }) => s.id === ids.s1).averages[ids.math]).toBe(
      1.6,
    );
    expect((await admin.get(`/grades/classes/${ids.c1}`)).status).toBe(200);
    expect((await principal.get(`/grades/classes/${ids.c1}`)).status).toBe(200);
    expect((await teacher.get(`/grades/classes/${ids.c1}`)).status).toBe(403);
    expect((await homeroom.get(`/grades/classes/${ids.c2}`)).status).toBe(403);
  });

  it('Altersgrenze der Schule gilt für Schüler:innen, nicht für Eltern', async () => {
    await h.owner.person.update({
      where: { id: ids.s1 },
      data: { birthDate: day(addDays(today, -365 * 11)) },
    });
    await h.owner.tenant.update({
      where: { id: tenantId },
      data: { settings: { ageLimits: { seeGradesFrom: 14 } } },
    });
    expect((await student.get('/me/grades')).status).toBe(403);
    expect((await guardian.get(`/me/grades?studentId=${ids.s1}`)).status).toBe(200);
    await h.owner.tenant.update({ where: { id: tenantId }, data: { settings: {} } });
    expect((await student.get('/me/grades')).status).toBe(200);
  });
});
