import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Harness } from './support/harness';

describe('Stammdaten', () => {
  let h: Harness;
  let admin: Awaited<ReturnType<Harness['tenantWithAdmin']>>;

  beforeAll(async () => {
    h = await Harness.create();
    admin = await h.tenantWithAdmin();
  });
  afterAll(async () => h.close());

  const teacher = async (name = 'Lehrer') => {
    const r = await admin.admin.post('/admin/persons', {
      kind: 'TEACHER',
      firstName: name,
      lastName: 'Test',
    });
    expect(r.status).toBe(201);
    return r.json.id as string;
  };

  describe('Rechte', () => {
    it('Schüler dürfen Stammdaten weder lesen noch ändern, die Direktion nur lesen', async () => {
      const t = await h.createTenant();
      const stu = await h.loginFully(
        t.slug,
        (await h.createUser(t.id, [{ role: 'STUDENT' }])).email,
      );
      expect((await stu.client.get('/admin/subjects')).status).toBe(403);
      const pr = await h.loginFully(
        t.slug,
        (await h.createUser(t.id, [{ role: 'PRINCIPAL' }])).email,
      );
      expect((await pr.client.get('/admin/subjects')).status).toBe(200);
      expect((await pr.client.post('/admin/subjects', { name: 'Mathe', code: 'M' })).status).toBe(
        403,
      );
      expect((await pr.client.get('/admin/audit')).status).toBe(200); // Direktion darf das Audit-Log lesen
    });
  });

  describe('Schuljahr und Ferien', () => {
    it('legt Schuljahre an, nur eines ist aktuell, Ferien gehören zum Jahr', async () => {
      const a = await admin.admin.post('/admin/school-years', {
        name: '2026/27',
        startsOn: '2026-09-07',
        endsOn: '2027-07-02',
        isCurrent: true,
      });
      expect(a.status).toBe(201);
      const b = await admin.admin.post('/admin/school-years', {
        name: '2027/28',
        startsOn: '2027-09-06',
        endsOn: '2028-07-07',
        isCurrent: true,
      });
      const list = (await admin.admin.get('/admin/school-years')).json.data as {
        id: string;
        isCurrent: boolean;
      }[];
      expect(list.filter((y) => y.isCurrent).map((y) => y.id)).toEqual([b.json.id]);
      await admin.admin.patch(`/admin/school-years/${a.json.id}`, { isCurrent: true });
      expect(
        (
          (await admin.admin.get('/admin/school-years')).json.data as { isCurrent: boolean }[]
        ).filter((y) => y.isCurrent),
      ).toHaveLength(1);

      expect(
        (
          await admin.admin.post(`/admin/school-years/${a.json.id}/free-days`, {
            fromDate: '2026-12-24',
            toDate: '2027-01-06',
            label: 'Weihnachtsferien',
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await admin.admin.post(`/admin/school-years/${a.json.id}/free-days`, {
            fromDate: '2027-01-06',
            toDate: '2026-12-24',
            label: 'verkehrt',
          })
        ).status,
      ).toBe(400);
      const detail = await admin.admin.get(`/admin/school-years/${a.json.id}`);
      expect(detail.json.freeDays).toHaveLength(1);
      expect((await admin.admin.del(`/admin/school-years/${b.json.id}`)).status).toBe(204);
    });

    it('lehnt ein Ende vor dem Beginn ab und doppelte Namen', async () => {
      expect(
        (
          await admin.admin.post('/admin/school-years', {
            name: 'X',
            startsOn: '2027-01-01',
            endsOn: '2026-01-01',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await admin.admin.post('/admin/school-years', {
            name: '2026/27',
            startsOn: '2026-09-07',
            endsOn: '2027-07-02',
          })
        ).status,
      ).toBe(409);
    });
  });

  describe('Raster', () => {
    it('prüft Reihenfolge und Überlappung, Nummern sind eindeutig, Vorlage nur ohne Raster', async () => {
      expect(
        (
          await admin.admin.post('/admin/periods', {
            number: 1,
            startTime: '08:00',
            endTime: '08:50',
          })
        ).status,
      ).toBe(201);
      const p2 = await admin.admin.post('/admin/periods', {
        number: 2,
        startTime: '08:55',
        endTime: '09:45',
        blocksDouble: true,
      });
      expect(p2.status).toBe(201);
      expect(
        (
          await admin.admin.post('/admin/periods', {
            number: 3,
            startTime: '09:30',
            endTime: '10:00',
          })
        ).status,
      ).toBe(400); // überlappt Stunde 2
      expect(
        (
          await admin.admin.post('/admin/periods', {
            number: 1,
            startTime: '13:00',
            endTime: '13:50',
          })
        ).status,
      ).toBe(409); // Nummer vergeben
      expect(
        (
          await admin.admin.post('/admin/periods', {
            number: 4,
            startTime: '25:00',
            endTime: '26:00',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await admin.admin.post('/admin/periods', {
            number: 5,
            startTime: '10:00',
            endTime: '09:00',
          })
        ).status,
      ).toBe(400);
      expect(
        (await admin.admin.patch(`/admin/periods/${p2.json.id}`, { startTime: '08:30' })).status,
      ).toBe(400); // überlappt Stunde 1
      expect((await admin.admin.post('/admin/periods/default-template')).status).toBe(400); // Raster existiert schon
      const t = await h.tenantWithAdmin();
      const tmpl = await t.admin.post('/admin/periods/default-template');
      expect(tmpl.status).toBe(201);
      expect(tmpl.json.data).toHaveLength(8);
    });
  });

  describe('Fächer und Räume', () => {
    it('legt an, lehnt doppelte Kürzel ab, ändert und löscht', async () => {
      const s = await admin.admin.post('/admin/subjects', {
        name: 'Mathematik',
        code: 'M',
        color: '#DC2626',
      });
      expect(s.status).toBe(201);
      expect((await admin.admin.post('/admin/subjects', { name: 'Musik', code: 'M' })).status).toBe(
        409,
      );
      expect(
        (await admin.admin.post('/admin/subjects', { name: 'Bunt', code: 'B', color: 'rot' }))
          .status,
      ).toBe(400);
      expect(
        (await admin.admin.patch(`/admin/subjects/${s.json.id}`, { name: 'Mathe' })).json.name,
      ).toBe('Mathe');
      expect((await admin.admin.del(`/admin/subjects/${s.json.id}`)).status).toBe(204);
      expect((await admin.admin.del(`/admin/subjects/${s.json.id}`)).status).toBe(404);

      const r = await admin.admin.post('/admin/rooms', {
        name: 'Turnsaal',
        capacity: 60,
        kind: 'Sport',
      });
      expect(r.status).toBe(201);
      expect((await admin.admin.post('/admin/rooms', { name: 'Turnsaal' })).status).toBe(409);
      expect((await admin.admin.post('/admin/rooms', { name: 'Leer', capacity: 0 })).status).toBe(
        400,
      );
    });
  });

  describe('Klassen und Gruppen', () => {
    it('Klassenvorstand folgt der Klasse: Rolle HOMEROOM wird gesetzt, verschoben und entfernt', async () => {
      const year = (await admin.admin.get('/admin/school-years')).json.data.find(
        (y: { isCurrent: boolean }) => y.isCurrent,
      );
      const t1 = await teacher('Eins');
      const t2 = await teacher('Zwei');
      const c = await admin.admin.post('/admin/classes', {
        schoolYearId: year.id,
        name: '3A',
        homeroomTeacherId: t1,
      });
      expect(c.status).toBe(201);
      const roles = async (id: string) =>
        (await h.owner.roleAssignment.findMany({ where: { personId: id } }))
          .map((r) => `${r.role}:${r.classId ?? ''}`)
          .sort();
      expect(await roles(t1)).toEqual([`HOMEROOM:${c.json.id}`, 'TEACHER:']);
      await admin.admin.patch(`/admin/classes/${c.json.id}`, { homeroomTeacherId: t2 });
      expect(await roles(t1)).toEqual(['TEACHER:']);
      expect(await roles(t2)).toEqual([`HOMEROOM:${c.json.id}`, 'TEACHER:']);
      await admin.admin.patch(`/admin/classes/${c.json.id}`, { homeroomTeacherId: null });
      expect(await roles(t2)).toEqual(['TEACHER:']);
    });

    it('Klassenvorstand muss Lehrkraft sein, Klassen mit Schüler:innen sind nicht löschbar', async () => {
      const year = (await admin.admin.get('/admin/school-years')).json.data.find(
        (y: { isCurrent: boolean }) => y.isCurrent,
      );
      const stu = await admin.admin.post('/admin/persons', {
        kind: 'STUDENT',
        firstName: 'Kind',
        lastName: 'Eins',
      });
      expect(
        (
          await admin.admin.post('/admin/classes', {
            schoolYearId: year.id,
            name: '1B',
            homeroomTeacherId: stu.json.id,
          })
        ).status,
      ).toBe(400);
      const c = await admin.admin.post('/admin/classes', { schoolYearId: year.id, name: '1B' });
      await admin.admin.post('/admin/persons', {
        kind: 'STUDENT',
        firstName: 'Ben',
        lastName: 'Eins',
        classId: c.json.id,
      });
      expect((await admin.admin.del(`/admin/classes/${c.json.id}`)).status).toBe(400);
      expect(
        (await admin.admin.post('/admin/classes', { schoolYearId: year.id, name: '1B' })).status,
      ).toBe(409);
      const detail = await admin.admin.get(`/admin/classes/${c.json.id}`);
      expect(detail.json.students.map((s: { firstName: string }) => s.firstName)).toEqual(['Ben']);
    });

    it('Gruppen: Mitglieder hinzufügen und entfernen, nur Schüler:innen', async () => {
      const year = (await admin.admin.get('/admin/school-years')).json.data.find(
        (y: { isCurrent: boolean }) => y.isCurrent,
      );
      const g = await admin.admin.post('/admin/groups', { schoolYearId: year.id, name: 'Chor' });
      const s = await admin.admin.post('/admin/persons', {
        kind: 'STUDENT',
        firstName: 'Chorkind',
        lastName: 'Test',
      });
      const t = await teacher('Chorleiter');
      expect(
        (await admin.admin.post(`/admin/groups/${g.json.id}/members`, { studentIds: [t] })).status,
      ).toBe(400);
      expect(
        (await admin.admin.post(`/admin/groups/${g.json.id}/members`, { studentIds: [s.json.id] }))
          .json.added,
      ).toBe(1);
      expect((await admin.admin.get(`/admin/groups/${g.json.id}`)).json.members).toHaveLength(1);
      expect(
        (await admin.admin.del(`/admin/groups/${g.json.id}/members/${s.json.id}`)).status,
      ).toBe(204);
      expect((await admin.admin.del(`/admin/groups/${g.json.id}`)).status).toBe(204);
    });
  });

  describe('Personen', () => {
    it('legt Personen mit Rolle, Klasse und Einschreibung an; Liste filtert und sucht', async () => {
      const t = await h.tenantWithAdmin();
      const year = await t.admin.post('/admin/school-years', {
        name: '2026/27',
        startsOn: '2026-09-07',
        endsOn: '2027-07-02',
        isCurrent: true,
      });
      const c = await t.admin.post('/admin/classes', { schoolYearId: year.json.id, name: '2A' });
      const s = await t.admin.post('/admin/persons', {
        kind: 'STUDENT',
        firstName: 'Anna',
        lastName: 'Gruber',
        externalId: 'S100',
        classId: c.json.id,
      });
      await t.admin.post('/admin/persons', {
        kind: 'TEACHER',
        firstName: 'Paul',
        lastName: 'Bauer',
        email: 'paul@example.test',
      });
      expect(
        (
          await t.admin.post('/admin/persons', {
            kind: 'STUDENT',
            firstName: 'Zweite',
            lastName: 'Gruber',
            externalId: 'S100',
          })
        ).status,
      ).toBe(400); // Schülernummer vergeben
      expect(
        (
          await t.admin.post('/admin/persons', {
            kind: 'TEACHER',
            firstName: 'X',
            lastName: 'Y',
            classId: c.json.id,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await t.admin.post('/admin/persons', {
            kind: 'STUDENT',
            firstName: 'X',
            lastName: 'Y',
            extraRoles: ['ADMIN'],
          })
        ).status,
      ).toBe(400);

      const all = await t.admin.get('/admin/persons');
      expect(all.json.data.map((p: { lastName: string }) => p.lastName)).toEqual(
        expect.arrayContaining(['Gruber', 'Bauer']),
      );
      expect(
        (await t.admin.get('/admin/persons?kind=TEACHER')).json.data.map(
          (p: { firstName: string }) => p.firstName,
        ),
      ).toContain('Paul');
      expect((await t.admin.get(`/admin/persons?classId=${c.json.id}`)).json.data).toHaveLength(1);
      expect((await t.admin.get('/admin/persons?q=s100')).json.data[0].firstName).toBe('Anna');
      expect((await t.admin.get('/admin/persons?q=paul%20bau')).json.data).toHaveLength(1);

      // Klassenwechsel schließt die alte Einschreibung
      const c2 = await t.admin.post('/admin/classes', { schoolYearId: year.json.id, name: '2B' });
      await t.admin.patch(`/admin/persons/${s.json.id}`, { classId: c2.json.id });
      const detail = await t.admin.get(`/admin/persons/${s.json.id}`);
      expect(detail.json.enrollments).toHaveLength(2);
      expect((await t.admin.get(`/admin/persons?classId=${c2.json.id}`)).json.data).toHaveLength(1);
      expect((await t.admin.get(`/admin/persons?classId=${c.json.id}`)).json.data).toHaveLength(0);
    });

    it('Cursor-Paginierung liefert alle Personen ohne Doppelte', async () => {
      const t = await h.tenantWithAdmin();
      for (let i = 0; i < 7; i++)
        await t.admin.post('/admin/persons', {
          kind: 'TEACHER',
          firstName: `P${i}`,
          lastName: 'Seite',
        });
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const r = await t.admin.get(
          `/admin/persons?q=Seite&limit=3${cursor ? `&cursor=${cursor}` : ''}`,
        );
        seen.push(...r.json.data.map((p: { id: string }) => p.id));
        cursor = r.json.nextCursor;
      } while (cursor);
      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);
    });

    it('Verwaltungsrollen setzen und entziehen; letzte Administration und eigener Zugang sind geschützt', async () => {
      const t = await h.tenantWithAdmin();
      const p = await t.admin.post('/admin/persons', {
        kind: 'STAFF',
        firstName: 'Direktion',
        lastName: 'Test',
        extraRoles: ['PRINCIPAL'],
      });
      expect(
        (await h.owner.roleAssignment.findMany({ where: { personId: p.json.id } })).map(
          (r) => r.role,
        ),
      ).toEqual(['PRINCIPAL']);
      await t.admin.patch(`/admin/persons/${p.json.id}`, { extraRoles: ['PRINCIPAL', 'ADMIN'] });
      expect(
        await h.owner.roleAssignment.count({ where: { personId: p.json.id, role: 'ADMIN' } }),
      ).toBe(1);
      expect(
        (await t.admin.patch(`/admin/persons/${t.adminPersonId}`, { extraRoles: [] })).status,
      ).toBe(400); // eigener Admin-Zugang
      expect(
        (await t.admin.patch(`/admin/persons/${p.json.id}`, { extraRoles: ['PRINCIPAL'] })).status,
      ).toBe(200);
    });

    it('Löschen anonymisiert: Konto und Sitzungen weg, Name ersetzt, nicht mehr in der Liste', async () => {
      const t = await h.tenantWithAdmin();
      const u = await h.createUser(t.tenant.id, [{ role: 'STUDENT' }]);
      const login = await h.loginFully(t.tenant.slug, u.email);
      expect((await login.client.get('/me')).status).toBe(200);
      expect((await t.admin.del(`/admin/persons/${u.personId}`)).status).toBe(204);
      const row = await h.owner.person.findUniqueOrThrow({ where: { id: u.personId } });
      expect(row).toMatchObject({
        firstName: 'Anonymisiert',
        lastName: '',
        email: null,
        externalId: null,
      });
      expect(row.anonymizedAt).not.toBeNull();
      expect(await h.owner.user.count({ where: { personId: u.personId } })).toBe(0);
      expect((await login.client.get('/me')).status).toBe(401);
      expect((await t.admin.get(`/admin/persons/${u.personId}`)).json.anonymized).toBe(true);
      expect(
        (await t.admin.get('/admin/persons')).json.data.map((p: { id: string }) => p.id),
      ).not.toContain(u.personId);
      expect((await t.admin.del(`/admin/persons/${t.adminPersonId}`)).status).toBe(400); // nicht selbst
    });

    it('protokolliert lesende Zugriffe auf Personendaten', async () => {
      const t = await h.tenantWithAdmin();
      await t.admin.get('/admin/persons');
      const log = await t.admin.get('/admin/audit?action=person.read');
      expect(log.status).toBe(200);
      expect(log.json.data.length).toBeGreaterThan(0);
      expect(log.json.data[0].actor).toContain('Test');
    });
  });

  describe('Mandantentrennung', () => {
    it('eine andere Schule sieht und ändert keine Stammdaten', async () => {
      const a = await h.tenantWithAdmin('iso');
      const b = await h.tenantWithAdmin('iso');
      const p = await a.admin.post('/admin/persons', {
        kind: 'TEACHER',
        firstName: 'Geheim',
        lastName: 'Lehrer',
      });
      const room = await a.admin.post('/admin/rooms', { name: 'Raum A' });
      expect((await b.admin.get(`/admin/persons/${p.json.id}`)).status).toBe(404);
      expect(
        (await b.admin.patch(`/admin/persons/${p.json.id}`, { firstName: 'Hack' })).status,
      ).toBe(404);
      expect((await b.admin.del(`/admin/persons/${p.json.id}`)).status).toBe(404);
      expect((await b.admin.patch(`/admin/rooms/${room.json.id}`, { name: 'Hack' })).status).toBe(
        404,
      );
      expect((await b.admin.get('/admin/rooms')).json.data).toEqual([]);
      expect((await b.admin.get('/admin/persons?q=Geheim')).json.data).toEqual([]);
      expect((await h.owner.person.findUniqueOrThrow({ where: { id: p.json.id } })).firstName).toBe(
        'Geheim',
      );
    });
  });
});
