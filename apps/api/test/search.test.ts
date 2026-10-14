import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SearchResult } from '@sp/shared';
import { Harness, type Client } from './support/harness';
import { enroll, smallSchool } from './support/school';

/** Globale Suche (PL-06): Ergebnisse folgen den Rechten der Person. */
describe('Globale Suche', () => {
  let h: Harness;
  let tenantId = '';
  let admin: Client;
  let teacher: Client;
  let student: Client;
  const ids = {} as Record<'teacher' | 'mine' | 'foreign' | 'c1' | 'c2', string>;
  const kinds = (r: { json: { data: SearchResult[] } }) =>
    r.json.data.map((x) => `${x.kind}:${x.label}`).sort();

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.tenantWithAdmin('su');
    tenantId = t.tenant.id;
    admin = t.admin;
    const s = await smallSchool(h, tenantId);
    ids.c1 = s.c1.id;
    ids.c2 = s.c2.id;
    const tu = await h.createUser(tenantId, [{ role: 'TEACHER' }]);
    ids.teacher = tu.personId;
    await h.owner.person.update({ where: { id: tu.personId }, data: { lastName: 'Huber' } });
    // Lehrkraft unterrichtet die 1A (veröffentlichte Stunde)
    await h.owner.lesson.create({
      data: {
        tenantId,
        versionId: s.version.id,
        subjectId: s.math.id,
        classId: s.c1.id,
        weekday: 1,
        periodStart: 1,
        teachers: { create: { tenantId, teacherId: tu.personId } },
      },
    });
    const mine = await h.createUser(tenantId, [{ role: 'STUDENT' }], undefined, 'STUDENT');
    const foreign = await h.createUser(tenantId, [{ role: 'STUDENT' }], undefined, 'STUDENT');
    ids.mine = mine.personId;
    ids.foreign = foreign.personId;
    await h.owner.person.update({ where: { id: mine.personId }, data: { lastName: 'Hubmann' } });
    await h.owner.person.update({ where: { id: foreign.personId }, data: { lastName: 'Hubert' } });
    await enroll(h, tenantId, mine.personId, s.c1.id);
    await enroll(h, tenantId, foreign.personId, s.c2.id);
    teacher = (await h.loginFully(t.tenant.slug, tu.email)).client;
    student = (await h.loginFully(t.tenant.slug, mine.email)).client;
  });
  afterAll(async () => h.close());

  it('Lehrkraft: Lehrkräfte (Plan), nur Schüler:innen eigener Klassen, Klassen und Räume', async () => {
    const r = await teacher.get('/search?q=hub');
    expect(r.status).toBe(200);
    expect(kinds(r)).toEqual(['student:Hubmann Test', 'teacher:Huber Test']);
    const student = r.json.data.find((x: SearchResult) => x.kind === 'student');
    expect(student).toMatchObject({ detail: '1A', href: `/klassen/${ids.c1}` });
    const cls = await teacher.get('/search?q=1a');
    expect(cls.json.data).toEqual([
      expect.objectContaining({ kind: 'class', label: '1A', href: `/plan?class=${ids.c1}` }),
    ]);
    const room = await teacher.get('/search?q=r1');
    expect(room.json.data[0]).toMatchObject({ kind: 'room', label: 'R1' });
  });

  it('Administration: alle Personen mit Art und Klasse, Suche wird ohne Suchtext protokolliert', async () => {
    const r = await admin.get('/search?q=hub');
    expect(kinds(r)).toEqual(['person:Huber Test', 'person:Hubert Test', 'person:Hubmann Test']);
    expect(r.json.data.find((x: SearchResult) => x.id === ids.foreign)).toMatchObject({
      personKind: 'STUDENT',
      detail: '1B',
      href: `/admin/personen/${ids.foreign}`,
    });
    const log = await h.owner.auditLog.findFirst({
      where: { tenantId, action: 'person.search' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log?.meta).toEqual({ count: 3 });
  });

  it('Schüler:innen finden keine Personen; zu kurze Suche wird abgelehnt', async () => {
    expect((await student.get('/search?q=hub')).json.data).toEqual([]);
    expect((await teacher.get('/search?q=h')).status).toBe(400);
  });
});
