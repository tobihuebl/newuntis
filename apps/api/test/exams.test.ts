import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '@sp/shared';
import { Harness, type Client } from './support/harness';
import { enroll, lesson, smallSchool, today } from './support/school';

describe('Prüfungskalender (PN-01) und Geräteliste', () => {
  let h: Harness;
  let teacher: Client;
  let other: Client;
  let student: Client;
  let guardian: Client;
  const ids = {} as Record<'c1' | 'c2' | 'math' | 'eng' | 'student' | 'guardian', string>;
  const d = addDays(today, 10);

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.createTenant('ex');
    const s = await smallSchool(h, t.id);
    Object.assign(ids, { c1: s.c1.id, c2: s.c2.id, math: s.math.id, eng: s.eng.id });
    const tu = await h.createUser(t.id, [{ role: 'TEACHER' }]);
    const ou = await h.createUser(t.id, [{ role: 'TEACHER' }]);
    await lesson(h, t.id, s.version.id, {
      subjectId: s.math.id,
      classId: s.c1.id,
      teacherId: tu.personId,
    });
    await lesson(h, t.id, s.version.id, {
      subjectId: s.eng.id,
      classId: s.c1.id,
      teacherId: ou.personId,
    });
    const st = await h.createUser(t.id, [{ role: 'STUDENT' }], undefined, 'STUDENT');
    const g = await h.createUser(t.id, [{ role: 'GUARDIAN' }], undefined, 'GUARDIAN');
    ids.student = st.personId;
    ids.guardian = g.personId;
    await enroll(h, t.id, st.personId, s.c1.id);
    await h.owner.guardianLink.create({
      data: {
        tenantId: t.id,
        guardianId: g.personId,
        studentId: st.personId,
        validFrom: new Date('2020-01-01'),
      },
    });
    teacher = (await h.loginFully(t.slug, tu.email)).client;
    other = (await h.loginFully(t.slug, ou.email)).client;
    student = (await h.loginFully(t.slug, st.email)).client;
    guardian = (await h.loginFully(t.slug, g.email)).client;
  });
  afterAll(async () => h.close());

  const exam = (c: Client, over: Record<string, unknown> = {}) =>
    c.post('/exams', {
      classId: ids.c1,
      subjectId: ids.math,
      date: d,
      title: '1. Schularbeit',
      kind: 'Schularbeit',
      ...over,
    });

  it('nur eigene Fächer; Kollision am selben Tag wird gemeldet und kann bewusst übergangen werden', async () => {
    expect((await exam(teacher, { classId: ids.c2 })).status).toBe(403);
    const first = await exam(teacher);
    expect(first.status).toBe(201);
    expect(first.json.warnings).toEqual([]);
    const second = await exam(other, { subjectId: ids.eng, title: 'Vokabeltest', kind: 'Test' });
    expect(second.status).toBe(409);
    expect(second.json.warnings[0]).toMatchObject({ code: 'EXAM_DAY_LIMIT', count: 2, limit: 1 });
    const forced = await exam(other, {
      subjectId: ids.eng,
      title: 'Vokabeltest',
      kind: 'Test',
      force: true,
    });
    expect(forced.status).toBe(201);
    expect(forced.json.warnings).toHaveLength(1);
  });

  it('Schüler:innen und Eltern sehen die Prüfungen der Klasse und werden benachrichtigt', async () => {
    const s = await student.get('/exams');
    expect(s.json.data.map((x: { title: string }) => x.title)).toEqual([
      '1. Schularbeit',
      'Vokabeltest',
    ]);
    expect(s.json.data.every((x: { canEdit: boolean }) => !x.canEdit)).toBe(true);
    const g = await guardian.get(`/exams?studentId=${ids.student}`);
    expect(g.json.data).toHaveLength(2);
    expect(
      await h.owner.notification.count({ where: { personId: ids.guardian, type: 'exam.created' } }),
    ).toBe(2);
    expect((await guardian.get(`/exams?classId=${ids.c2}`)).status).toBe(403);
  });

  it('ändern und löschen nur durch die eintragende Lehrkraft', async () => {
    const mine = (await teacher.get('/exams')).json.data.find(
      (x: { title: string }) => x.title === '1. Schularbeit',
    );
    expect(mine.canEdit).toBe(true);
    expect((await other.del(`/exams/${mine.id}`)).status).toBe(403);
    expect((await teacher.patch(`/exams/${mine.id}`, { title: '1. SA' })).status).toBe(200);
    expect((await teacher.del(`/exams/${mine.id}`)).status).toBe(204);
  });

  it('Geräteliste: eigene Sitzungen sehen und ein anderes Gerät abmelden', async () => {
    const list = await teacher.get('/me/sessions');
    expect(list.json.data.some((x: { current: boolean }) => x.current)).toBe(true);
    const others = list.json.data.filter((x: { current: boolean }) => !x.current);
    for (const o of others) expect((await teacher.del(`/me/sessions/${o.id}`)).status).toBe(204);
    expect((await teacher.del('/me/sessions/gibt-es-nicht')).status).toBe(404);
  });
});
