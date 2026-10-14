import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { addDays } from '@sp/shared';
import { Harness, type Client } from './support/harness';

const today = DateTime.now().setZone('Europe/Vienna').toISODate()!;

/** Lehrkräfte: Fächer (Lehrbefähigung) und Stundenausmaß; Auslastung in der Lehrfächerverteilung. */
describe('Lehrkräfte: Fächer und Stundenausmaß', () => {
  let h: Harness;
  let admin: Client;
  let slug = '';
  let tenantId = '';
  const ids = {} as Record<'year' | 'm' | 'd' | 'c1' | 'hu' | 'st' | 'version', string>;

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.tenantWithAdmin('lk');
    admin = t.admin;
    slug = t.tenant.slug;
    tenantId = t.tenant.id;
    ids.year = (
      await admin.post('/admin/school-years', {
        name: 'SJ',
        startsOn: addDays(today, -1),
        endsOn: addDays(today, 200),
        isCurrent: true,
      })
    ).json.id;
    ids.m = (await admin.post('/admin/subjects', { name: 'Mathematik', code: 'M' })).json.id;
    ids.d = (await admin.post('/admin/subjects', { name: 'Deutsch', code: 'D' })).json.id;
    ids.c1 = (await admin.post('/admin/classes', { schoolYearId: ids.year, name: '1A' })).json.id;
    ids.hu = (
      await admin.post('/admin/persons', {
        kind: 'TEACHER',
        firstName: 'Anna',
        lastName: 'Huber',
        email: 'huber@schule.test',
      })
    ).json.id;
    ids.st = (
      await admin.post('/admin/persons', { kind: 'STUDENT', firstName: 'Max', lastName: 'Moser' })
    ).json.id;
    ids.version = (
      await admin.post('/admin/timetable-versions', { schoolYearId: ids.year, name: 'LFV' })
    ).json.id;
  });
  afterAll(async () => h.close());

  it('speichert Fächer, Beschäftigungsausmaß und davon Unterricht', async () => {
    const before = await admin.get(`/admin/persons/${ids.hu}`);
    expect(before.json.teaching).toEqual({
      subjects: [],
      employmentHours: null,
      teachingHours: null,
      plannedHours: 0,
    });
    const put = await admin.put(`/admin/persons/${ids.hu}/teaching`, {
      subjectIds: [ids.m, ids.m],
      employmentHours: 20,
      teachingHours: 10.5,
    });
    expect(put.status).toBe(200);
    const after = await admin.get(`/admin/persons/${ids.hu}`);
    expect(after.json.teaching).toMatchObject({
      subjects: [{ id: ids.m, code: 'M', name: 'Mathematik' }],
      employmentHours: 20,
      teachingHours: 10.5,
    });
    // Schüler:innen haben keine Lehrkräfte-Angaben
    expect((await admin.get(`/admin/persons/${ids.st}`)).json.teaching).toBeNull();
  });

  it('lehnt ungültige Angaben ab', async () => {
    const put = (body: object) => admin.put(`/admin/persons/${ids.hu}/teaching`, body);
    const base = { subjectIds: [], employmentHours: 20, teachingHours: 10 };
    expect((await put({ ...base, teachingHours: 22 })).status).toBe(400);
    expect((await put({ ...base, teachingHours: 10.3 })).status).toBe(400);
    expect((await put({ ...base, subjectIds: ['gibt-es-nicht'] })).status).toBe(400);
    expect(
      (await admin.put(`/admin/persons/${ids.st}/teaching`, { ...base, subjectIds: [] })).status,
    ).toBe(400);
  });

  it('Rechte: Direktion liest, ändert aber nicht', async () => {
    const u = await h.createUser(tenantId, [{ role: 'PRINCIPAL' }], undefined, 'STAFF');
    const { client } = await h.loginFully(slug, u.email);
    expect((await client.get(`/admin/persons/${ids.hu}`)).json.teaching.teachingHours).toBe(10.5);
    const put = await client.put(`/admin/persons/${ids.hu}/teaching`, {
      subjectIds: [],
      employmentHours: null,
      teachingHours: null,
    });
    expect(put.status).toBe(403);
  });

  it('Lehrfächerverteilung: Auslastung gegen das Soll und Fächer ohne Lehrbefähigung', async () => {
    await admin.put(`/admin/persons/${ids.hu}/teaching`, {
      subjectIds: [ids.m],
      employmentHours: 20,
      teachingHours: 10,
    });
    const imp = await admin.post(`/admin/timetable-versions/${ids.version}/requirements/import`, {
      csv: 'Klasse;Fach;Lehrkraft;Wochenstunden\n1A;M;huber@schule.test;4\n1A;D;Huber;8',
      commit: true,
    });
    expect(imp.json).toMatchObject({ valid: 2, invalid: 0, committed: true });
    expect(imp.json.rows[0].warnings).toEqual([]);
    expect(imp.json.rows[1].warnings).toEqual(['Huber: keine Lehrbefähigung für D hinterlegt']);
    const v = await admin.get(`/admin/timetable-versions/${ids.version}`);
    expect(v.json.teacherLoad).toEqual([
      { teacherId: ids.hu, target: 10, assigned: 12, diff: 2, unqualified: [ids.d] },
    ]);
  });

  it('Anonymisieren entfernt Fächer und Stundenausmaß', async () => {
    const t = (
      await admin.post('/admin/persons', { kind: 'TEACHER', firstName: 'Eva', lastName: 'Egger' })
    ).json.id;
    await admin.put(`/admin/persons/${t}/teaching`, {
      subjectIds: [ids.d],
      employmentHours: 22,
      teachingHours: 22,
    });
    expect((await admin.del(`/admin/persons/${t}`)).status).toBe(204);
    const p = await h.owner.person.findUniqueOrThrow({
      where: { id: t },
      include: { teacherSubjects: true },
    });
    expect(p).toMatchObject({ employmentHours: null, teachingHours: null, teacherSubjects: [] });
  });
});
