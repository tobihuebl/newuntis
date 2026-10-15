import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Harness, type Client } from './support/harness';
import { smallSchool } from './support/school';

/** Beispielexport: Doppelstunde, Teamteaching, Kopplung, neue Klasse, Stunde außerhalb des Rasters. */
const GPU001 = [
  '1,"1A","HUB","M","R1",1,1,,',
  '1,"1A","HUB","M","R1",1,2,,',
  '2,"1A","MAY","E","R2",2,3,,',
  '2,"1A","KAL","E","R2",2,3,,',
  '3,"1A","GRU","RK","R3",3,4,,',
  '3,"1B","GRU","RK","R3",3,4,,',
  '4,"2A","HUB","M","R1",4,1,,',
  '5,"1B","HUB","M","R1",5,9,,',
].join('\r\n');
const GPU002 = [
  '1,2,2,2,"1A","HUB","M"',
  '3,1,1,1,"1A","GRU","RK"',
  '3,1,0,0,"1B","GRU","RK"',
].join('\n');
const teacherRow = (code: string, last: string, first: string, email: string) => {
  const r = Array.from({ length: 33 }, () => '""');
  r[0] = `"${code}"`;
  r[1] = `"${last}"`;
  r[28] = `"${first}"`;
  r[32] = `"${email}"`;
  return r.join(',');
};
const GPU004 = [
  teacherRow('HUB', 'Huber', 'Anna', 'anna.huber@example.test'),
  teacherRow('MAY', 'Mayer', 'Max', ''),
  teacherRow('GRU', 'Gruber', 'Gerda', ''),
].join('\n');
const GPU006 = ['"RK","Religion (röm.-kath.)"', '"M","Mathematik"'].join('\n');

describe('Untis-Import (SD-06)', () => {
  let h: Harness;
  let tenantId = '';
  let admin: Client;
  let teacher: Client;
  let yearId = '';
  let hub = '';

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.tenantWithAdmin('untis');
    tenantId = t.tenant.id;
    admin = t.admin;
    const s = await smallSchool(h, tenantId);
    yearId = s.year.id;
    // Bestehende Lehrkraft mit derselben E-Mail wie HUB in GPU004
    const u = await h.createUser(tenantId, [{ role: 'TEACHER' }], 'anna.huber@example.test');
    hub = u.personId;
    teacher = (await h.loginFully(t.tenant.slug, u.email)).client;
  });
  afterAll(async () => h.close());

  const body = () => ({
    schoolYearId: yearId,
    name: 'Untis Test',
    files: { gpu001: GPU001, gpu002: GPU002, gpu004: GPU004, gpu006: GPU006 },
  });

  it('Vorschau: Zuordnung, Zählungen, Hinweise; nur mit Recht zum Bearbeiten des Stundenplans', async () => {
    expect((await teacher.post('/admin/import/untis', body())).status).toBe(403);
    const r = await admin.post('/admin/import/untis', body());
    expect(r.status).toBe(200);
    expect(r.json.counts).toEqual({
      lessons: 4,
      doubles: 1,
      couplings: 1,
      teamTeaching: 1,
      requirements: 2,
    });
    expect(r.json.classes).toEqual([
      { name: '1A', exists: true },
      { name: '1B', exists: true },
      { name: '2A', exists: false },
    ]);
    expect(r.json.groups).toEqual([{ name: '1A/1B RK', exists: false }]);
    expect(r.json.subjects).toEqual(
      expect.arrayContaining([
        { code: 'M', name: 'Mathematik', exists: true },
        { code: 'RK', name: 'Religion (röm.-kath.)', exists: false },
      ]),
    );
    const byCode = Object.fromEntries(
      r.json.teachers.map((t: { code: string; match: string }) => [t.code, t.match]),
    );
    expect(byCode).toEqual({ GRU: 'new', HUB: 'email', KAL: 'new', MAY: 'new' });
    expect(r.json.warnings).toEqual([expect.objectContaining({ kind: 'missingPeriod', count: 1 })]);
    expect(r.json.errors).toEqual([]);
    expect(await h.owner.timetableVersion.count({ where: { tenantId, name: 'Untis Test' } })).toBe(
      0,
    );
  });

  it('Übernehmen: neuer Entwurf mit Stunden, Lehrkräften und Lehrfächerverteilung; zweiter Import findet alles wieder', async () => {
    const r = await admin.post('/admin/import/untis/commit', body());
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({
      lessons: 4,
      requirements: 2,
      created: { classes: 1, groups: 1, subjects: 1, rooms: 1, teachers: 3 },
    });
    const v = await h.owner.timetableVersion.findUniqueOrThrow({
      where: { id: r.json.versionId },
      include: {
        lessons: { include: { teachers: true, group: true, subject: true } },
        requirements: true,
      },
    });
    expect(v.status).toBe('DRAFT');
    const math = v.lessons.find((l) => l.subject.code === 'M' && l.weekday === 1)!;
    expect(math).toMatchObject({ periodStart: 1, periodCount: 2 });
    expect(math.teachers.map((t) => t.teacherId)).toEqual([hub]);
    expect(v.lessons.find((l) => l.subject.code === 'E')!.teachers).toHaveLength(2);
    expect(v.lessons.find((l) => l.subject.code === 'RK')!.group?.name).toBe('1A/1B RK');
    expect(v.requirements.map((q) => q.hoursPerWeek).sort()).toEqual([1, 2]);
    expect(
      await h.owner.person.findFirst({ where: { tenantId, externalId: 'untis:MAY' } }),
    ).toMatchObject({ firstName: 'Max', lastName: 'Mayer', kind: 'TEACHER' });
    expect((await h.owner.person.findUniqueOrThrow({ where: { id: hub } })).externalId).toBe(
      'untis:HUB',
    );

    const again = await admin.post('/admin/import/untis', body());
    expect(again.json.teachers.every((t: { match: string }) => t.match === 'existing')).toBe(true);
    expect(again.json.groups).toEqual([{ name: '1A/1B RK', exists: true }]);
  });

  it('ohne Raster oder ohne Unterricht keine Übernahme', async () => {
    const empty = await admin.post('/admin/import/untis', {
      ...body(),
      files: { gpu001: 'x,y\n' },
    });
    expect(empty.json.errors).toEqual(['In GPU001.TXT wurde kein Unterricht gefunden.']);
    expect(
      (await admin.post('/admin/import/untis/commit', { ...body(), files: { gpu001: 'x,y\n' } }))
        .status,
    ).toBe(400);
  });
});
