import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { addDays, isoWeekday } from '@sp/shared';
import { OccurrencesService, WINDOW_DAYS } from '../src/modules/timetable/occurrences.service';
import { Harness, type Client } from './support/harness';

const TZ = 'Europe/Vienna';
const today = DateTime.now().setZone(TZ).toISODate()!;
/** Nächster Tag mit diesem Wochentag ab morgen (damit "gültig ab" nie in der Vergangenheit liegt). */
const next = (weekday: number, after = addDays(today, 1)) => {
  let d = after;
  while (isoWeekday(d) !== weekday) d = addDays(d, 1);
  return d;
};

describe('Stundenplan', () => {
  let h: Harness;
  let admin: Client;
  let slug = '';
  let tenantId = '';
  const ids = {} as Record<
    'year' | 'math' | 'eng' | 'r1' | 'r2' | 'c1' | 'c2' | 't1' | 't2' | 's1' | 's2' | 's3',
    string
  >;

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.tenantWithAdmin('tt');
    admin = t.admin;
    slug = t.tenant.slug;
    tenantId = t.tenant.id;
    const year = await admin.post('/admin/school-years', {
      name: 'SJ',
      startsOn: addDays(today, -40),
      endsOn: addDays(today, 300),
      isCurrent: true,
    });
    ids.year = year.json.id;
    await admin.post('/admin/periods/default-template');
    ids.math = (await admin.post('/admin/subjects', { name: 'Mathematik', code: 'M' })).json.id;
    ids.eng = (await admin.post('/admin/subjects', { name: 'Englisch', code: 'E' })).json.id;
    ids.r1 = (await admin.post('/admin/rooms', { name: 'R1', capacity: 30 })).json.id;
    ids.r2 = (await admin.post('/admin/rooms', { name: 'R2', capacity: 2 })).json.id;
    ids.c1 = (await admin.post('/admin/classes', { schoolYearId: ids.year, name: '1A' })).json.id;
    ids.c2 = (await admin.post('/admin/classes', { schoolYearId: ids.year, name: '1B' })).json.id;
    ids.t1 = (
      await admin.post('/admin/persons', {
        kind: 'TEACHER',
        firstName: 'Tina',
        lastName: 'Eins',
        email: 't1@example.test',
      })
    ).json.id;
    ids.t2 = (
      await admin.post('/admin/persons', { kind: 'TEACHER', firstName: 'Tom', lastName: 'Zwei' })
    ).json.id;
    ids.s1 = (
      await admin.post('/admin/persons', {
        kind: 'STUDENT',
        firstName: 'Sara',
        lastName: 'Schüler',
        classId: ids.c1,
      })
    ).json.id;
    ids.s2 = (
      await admin.post('/admin/persons', {
        kind: 'STUDENT',
        firstName: 'Sam',
        lastName: 'Schüler',
        classId: ids.c1,
      })
    ).json.id;
    ids.s3 = (
      await admin.post('/admin/persons', {
        kind: 'STUDENT',
        firstName: 'Sina',
        lastName: 'Schüler',
        classId: ids.c1,
      })
    ).json.id;
  });
  afterAll(async () => h.close());

  const draft = async (copyFromVersionId?: string) =>
    (
      await admin.post('/admin/timetable-versions', {
        schoolYearId: ids.year,
        name: 'Entwurf',
        copyFromVersionId,
      })
    ).json.id as string;
  const lesson = (vid: string, over: Record<string, unknown> = {}) =>
    admin.post(`/admin/timetable-versions/${vid}/lessons`, {
      subjectId: ids.math,
      classId: ids.c1,
      roomId: ids.r1,
      weekday: 1,
      periodStart: 1,
      teacherIds: [ids.t1],
      ...over,
    });

  describe('Rechte', () => {
    it('Schüler:innen sehen keine Versionen; Direktion darf ansehen und prüfen, aber nicht bearbeiten', async () => {
      const vid = await draft();
      const stu = await h.loginFully(
        slug,
        (await h.createUser(tenantId, [{ role: 'STUDENT' }], undefined, 'STUDENT')).email,
      );
      expect((await stu.client.get('/admin/timetable-versions')).status).toBe(403);
      const pr = await h.loginFully(
        slug,
        (await h.createUser(tenantId, [{ role: 'PRINCIPAL' }], undefined, 'STAFF')).email,
      );
      expect((await pr.client.get(`/admin/timetable-versions/${vid}`)).status).toBe(200);
      expect((await pr.client.post(`/admin/timetable-versions/${vid}/validate`, {})).status).toBe(
        200,
      );
      expect(
        (
          await pr.client.post(`/admin/timetable-versions/${vid}/lessons`, {
            subjectId: ids.math,
            classId: ids.c1,
            weekday: 1,
            periodStart: 1,
          })
        ).status,
      ).toBe(403);
      expect((await admin.del(`/admin/timetable-versions/${vid}`)).status).toBe(204);
    });
  });

  describe('Regeln im Entwurf', () => {
    it('liefert beim Anlegen die Konflikte der neuen Regel; Verweise werden geprüft', async () => {
      const vid = await draft();
      const a = await lesson(vid);
      expect(a.status).toBe(201);
      expect(a.json.conflicts).toEqual([]);
      const b = await lesson(vid, { classId: ids.c2, roomId: ids.r1 });
      expect(b.json.conflicts.map((c: { code: string }) => c.code).sort()).toEqual([
        'ROOM_DOUBLE',
        'TEACHER_DOUBLE',
      ]);
      expect((await lesson(vid, { teacherIds: [ids.s1] })).status).toBe(400); // keine Lehrkraft
      expect((await lesson(vid, { classId: null })).status).toBe(400); // weder Klasse noch Gruppe
      expect((await lesson(vid, { weekday: 6 })).status).toBe(400);
      const detail = await admin.get(`/admin/timetable-versions/${vid}`);
      expect(detail.json.lessons).toHaveLength(2);
      expect(detail.json.periods).toHaveLength(8);
      expect(detail.json.context.classStudents[ids.c1]).toHaveLength(3);
      expect(detail.json.conflicts.length).toBeGreaterThan(0);
    });

    it('optimistische Sperre: veralteter Stand ergibt 409 mit aktuellem Stand statt Überschreiben', async () => {
      const vid = await draft();
      const created = await lesson(vid);
      const lid = created.json.lesson.id;
      const v1 = created.json.lesson.version;
      const moved = await admin.patch(`/admin/timetable-versions/${vid}/lessons/${lid}`, {
        version: v1,
        periodStart: 3,
      });
      expect(moved.status).toBe(200);
      expect(moved.json.lesson).toMatchObject({ periodStart: 3, version: v1 + 1 });
      const stale = await admin.patch(`/admin/timetable-versions/${vid}/lessons/${lid}`, {
        version: v1,
        periodStart: 5,
      });
      expect(stale.status).toBe(409);
      expect(stale.json.current).toMatchObject({ periodStart: 3, version: v1 + 1 });
      const both = await admin.patch(`/admin/timetable-versions/${vid}/lessons/${lid}`, {
        version: v1 + 1,
        periodCount: 2,
        teacherIds: [ids.t1, ids.t2],
      });
      expect(both.json.lesson).toMatchObject({
        periodCount: 2,
        teacherIds: [ids.t1, ids.t2].sort(),
      });
    });

    it('prüft eine einzelne Änderung live (nur deren Konflikte)', async () => {
      const vid = await draft();
      const a = (await lesson(vid)).json.lesson;
      await lesson(vid, { weekday: 2, classId: ids.c2, teacherIds: [ids.t2], roomId: ids.r1 });
      const res = await admin.post(`/admin/timetable-versions/${vid}/validate`, {
        change: { ...a, weekday: 2 },
      });
      expect(res.status).toBe(200);
      expect(res.json.conflicts.map((c: { code: string }) => c.code)).toEqual(['ROOM_DOUBLE']);
    });

    it('Soll-Stunden anlegen, ändern, löschen', async () => {
      const vid = await draft();
      const r = await admin.post(`/admin/timetable-versions/${vid}/requirements`, {
        subjectId: ids.math,
        classId: ids.c1,
        teacherId: ids.t1,
        hoursPerWeek: 4,
      });
      expect(r.status).toBe(201);
      expect(
        (
          await admin.patch(`/admin/timetable-versions/${vid}/requirements/${r.json.id}`, {
            hoursPerWeek: 5,
          })
        ).status,
      ).toBe(200);
      expect(
        (await admin.get(`/admin/timetable-versions/${vid}`)).json.requirements[0],
      ).toMatchObject({ hoursPerWeek: 5, teacherId: ids.t1 });
      expect(
        (
          await admin.post(`/admin/timetable-versions/${vid}/requirements`, {
            subjectId: ids.math,
            classId: ids.c1,
            teacherId: ids.s1,
            hoursPerWeek: 1,
          })
        ).status,
      ).toBe(400);
      expect(
        (await admin.del(`/admin/timetable-versions/${vid}/requirements/${r.json.id}`)).status,
      ).toBe(204);
    });
  });

  describe('Veröffentlichen und Termine', () => {
    let published = '';
    let mathLesson = '';

    it('harte Konflikte blockieren, "gültig ab" darf nicht in der Vergangenheit liegen', async () => {
      const vid = await draft();
      const a = (await lesson(vid)).json.lesson;
      await lesson(vid, { classId: ids.c2 }); // gleiche Lehrkraft, gleicher Raum
      const blocked = await admin.post(`/admin/timetable-versions/${vid}/publish`, {
        validFrom: today,
      });
      expect(blocked.status).toBe(422);
      expect(blocked.json.conflicts.map((c: { code: string }) => c.code).sort()).toEqual([
        'ROOM_DOUBLE',
        'TEACHER_DOUBLE',
      ]);
      expect(
        (
          await admin.post(`/admin/timetable-versions/${vid}/publish`, {
            validFrom: addDays(today, -1),
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await admin.post(`/admin/timetable-versions/${vid}/publish`, {
            validFrom: addDays(today, 400),
          })
        ).status,
      ).toBe(400);
      // Konflikt auflösen: zweite Regel auf Dienstag mit anderem Raum
      const detail = await admin.get(`/admin/timetable-versions/${vid}`);
      const other = detail.json.lessons.find((l: { id: string }) => l.id !== a.id);
      await admin.patch(`/admin/timetable-versions/${vid}/lessons/${other.id}`, {
        version: other.version,
        weekday: 2,
      });
      // Englisch für 1A am Mittwoch, Doppelstunde 1-2 (Raum zu klein: nur Warnung)
      await lesson(vid, {
        subjectId: ids.eng,
        weekday: 3,
        periodStart: 3,
        periodCount: 2,
        teacherIds: [ids.t2],
        roomId: ids.r2,
      });
      const ok = await admin.post(`/admin/timetable-versions/${vid}/publish`, { validFrom: today });
      expect(ok.status).toBe(200);
      expect(ok.json.warnings).toBe(1); // ROOM_CAPACITY
      expect(ok.json.generated.created).toBeGreaterThan(0);
      published = vid;
      mathLesson = a.id;
    });

    it('veröffentlichte Versionen sind schreibgeschützt', async () => {
      const detail = await admin.get(`/admin/timetable-versions/${published}`);
      expect(detail.json.version.status).toBe('PUBLISHED');
      const l = detail.json.lessons[0];
      expect(
        (
          await admin.patch(`/admin/timetable-versions/${published}/lessons/${l.id}`, {
            version: l.version,
            periodStart: 4,
          })
        ).status,
      ).toBe(409);
      expect((await admin.del(`/admin/timetable-versions/${published}`)).status).toBe(409);
    });

    it('erzeugt Termine im Fenster heute bis heute + 28 Tage, mit Wiener Uhrzeit', async () => {
      const occ = await h.owner.occurrence.findMany({
        where: { tenantId, lessonId: mathLesson },
        orderBy: { date: 'asc' },
      });
      const mondays: string[] = [];
      for (let d = today; d <= addDays(today, WINDOW_DAYS); d = addDays(d, 1))
        if (isoWeekday(d) === 1) mondays.push(d);
      expect(occ.map((o) => o.date.toISOString().slice(0, 10))).toEqual(mondays);
      for (const o of occ) {
        const local = DateTime.fromJSDate(o.startsAt).setZone(TZ);
        expect(local.toFormat('HH:mm')).toBe('08:00');
        expect(DateTime.fromJSDate(o.endsAt).setZone(TZ).toFormat('HH:mm')).toBe('08:50');
      }
      const teachers = await h.owner.occurrenceTeacher.findMany({
        where: { occurrenceId: occ[0]!.id },
      });
      expect(teachers.map((t) => t.teacherId)).toEqual([ids.t1]);
    });

    it('die Terminerzeugung ist idempotent', async () => {
      const svc = h.app.get(OccurrencesService);
      const prisma = h.app.get(
        (await import('../src/modules/prisma/prisma.service')).PrismaService,
      );
      const again = await prisma.runAsTenant(tenantId, (tx) => svc.generateWindow(tx, tenantId));
      expect(again).toMatchObject({ created: 0, updated: 0, deleted: 0 });
    });

    it('neue Version ab einem Datum: Termine davor bleiben, danach gilt die neue; Termine mit Klassenbuch bleiben unangetastet; Ferien ohne Termine', async () => {
      const validFrom = next(1, addDays(today, 8)); // ein Montag in 8 bis 14 Tagen
      const firstOcc = await h.owner.occurrence.findMany({
        where: { tenantId, lessonId: mathLesson },
        orderBy: { date: 'asc' },
      });
      const protectedOcc = firstOcc.find((o) => o.date.toISOString().slice(0, 10) >= validFrom)!;
      await h.owner.classbookEntry.create({
        data: { tenantId, occurrenceId: protectedOcc.id, topic: 'Bruchrechnen' },
      });
      const freeDay = next(3, validFrom); // ein Mittwoch nach dem Wechsel
      await admin.post(`/admin/school-years/${ids.year}/free-days`, {
        fromDate: freeDay,
        toDate: freeDay,
        label: 'schulautonom frei',
      });

      const vid = await draft(published);
      const copy = (await admin.get(`/admin/timetable-versions/${vid}`)).json.lessons;
      expect(copy).toHaveLength(3);
      const math = copy.find(
        (l: { subjectId: string; weekday: number }) => l.subjectId === ids.math && l.weekday === 1,
      );
      await admin.del(`/admin/timetable-versions/${vid}/lessons/${math.id}`); // Mathe am Montag entfällt künftig
      const res = await admin.post(`/admin/timetable-versions/${vid}/publish`, { validFrom });
      expect(res.status).toBe(200);

      const versions = (await admin.get('/admin/timetable-versions')).json.data;
      expect(versions.find((v: { id: string }) => v.id === published).status).toBe('ARCHIVED');
      expect(versions.find((v: { id: string }) => v.id === vid).status).toBe('PUBLISHED');

      const after = await h.owner.occurrence.findMany({
        where: { tenantId, lessonId: mathLesson },
        orderBy: { date: 'asc' },
      });
      const dates = after.map((o) => o.date.toISOString().slice(0, 10));
      expect(dates.filter((d) => d < validFrom)).toEqual(
        firstOcc.map((o) => o.date.toISOString().slice(0, 10)).filter((d) => d < validFrom),
      ); // davor unverändert
      expect(dates.filter((d) => d >= validFrom)).toEqual([
        protectedOcc.date.toISOString().slice(0, 10),
      ]); // nur der mit Klassenbuch bleibt
      const onFreeDay = await h.owner.occurrence.count({
        where: { tenantId, date: new Date(`${freeDay}T00:00:00Z`) },
      });
      expect(onFreeDay).toBe(0);
    });
  });

  describe('Pläne', () => {
    it('Schüler:in sieht den Plan der eigenen Klasse, aber keine fremden Pläne', async () => {
      const u = await h.createUser(tenantId, [{ role: 'STUDENT' }], undefined, 'STUDENT');
      await h.owner.enrollment.create({
        data: {
          tenantId,
          studentId: u.personId,
          classId: ids.c1,
          fromDate: new Date(`${addDays(today, -1)}T00:00:00Z`),
        },
      });
      const { client } = await h.loginFully(slug, u.email);
      const week = await client.get(`/me/timetable?from=${today}&to=${addDays(today, 13)}`);
      expect(week.status).toBe(200);
      expect(week.json.entries.length).toBeGreaterThan(0);
      expect(
        week.json.entries.every((e: { class: { id: string } | null }) => e.class?.id === ids.c1),
      ).toBe(true);
      expect(week.json.entries[0]).toHaveProperty('subject.name');
      expect(week.json.periods).toHaveLength(8);
      expect((await client.get(`/classes/${ids.c2}/timetable`)).status).toBe(403);
      expect((await client.get(`/teachers/${ids.t1}/timetable`)).status).toBe(403);
    });

    it('jenseits des erzeugten Fensters kommen geplante Einträge aus den Regeln', async () => {
      const from = addDays(today, WINDOW_DAYS + 10);
      const res = await admin.get(
        `/classes/${ids.c1}/timetable?from=${from}&to=${addDays(from, 6)}`,
      );
      expect(res.status).toBe(200);
      expect(res.json.entries.length).toBeGreaterThan(0);
      expect(res.json.entries.every((e: { planned: boolean }) => e.planned)).toBe(true);
      expect(
        (await admin.get(`/classes/${ids.c1}/timetable?from=${today}&to=${addDays(today, 100)}`))
          .status,
      ).toBe(400); // zu langer Zeitraum
    });

    it('Lehrkraft sieht eigene Stunden und fremde Pläne; Raumplan', async () => {
      await admin.post('/admin/invitations', { personIds: [ids.t1] });
      await h.owner.user.create({
        data: {
          tenantId,
          personId: ids.t2,
          email: 't2@example.test',
          passwordHash: (await h.owner.user.findFirstOrThrow({ where: { tenantId } })).passwordHash,
        },
      });
      await h.owner.roleAssignment
        .create({ data: { tenantId, personId: ids.t2, role: 'TEACHER' } })
        .catch(() => undefined);
      const { client } = await h.loginFully(slug, 't2@example.test');
      const mine = await client.get(`/me/timetable?from=${today}&to=${addDays(today, 13)}`);
      expect(mine.status).toBe(200);
      expect(mine.json.entries.length).toBeGreaterThan(0);
      expect(
        mine.json.entries.every((e: { teachers: { id: string }[] }) =>
          e.teachers.some((t) => t.id === ids.t2),
        ),
      ).toBe(true);
      expect((await client.get(`/classes/${ids.c1}/timetable`)).status).toBe(200);
      expect(
        (
          await client.get(`/rooms/${ids.r2}/timetable?from=${today}&to=${addDays(today, 13)}`)
        ).json.entries.every((e: { room: { id: string } }) => e.room.id === ids.r2),
      ).toBe(true);
      const dir = await client.get('/timetable/directory');
      expect(dir.json.classes.map((c: { name: string }) => c.name)).toEqual(['1A', '1B']);
    });

    it('Eltern sehen nur den Plan verknüpfter Kinder', async () => {
      const g = await h.createUser(tenantId, [{ role: 'GUARDIAN' }], undefined, 'GUARDIAN');
      await h.owner.guardianLink.create({
        data: {
          tenantId,
          guardianId: g.personId,
          studentId: ids.s1,
          validFrom: new Date(`${addDays(today, -1)}T00:00:00Z`),
        },
      });
      const { client } = await h.loginFully(slug, g.email);
      const kids = await client.get('/me/children');
      expect(kids.json.data.map((k: { id: string }) => k.id)).toEqual([ids.s1]);
      const plan = await client.get(
        `/me/timetable?studentId=${ids.s1}&from=${today}&to=${addDays(today, 13)}`,
      );
      expect(plan.status).toBe(200);
      expect(plan.json.entries.length).toBeGreaterThan(0);
      expect((await client.get('/me/timetable')).status).toBe(200); // nur ein Kind: ohne Angabe
      expect((await client.get(`/me/timetable?studentId=${ids.s2}`)).status).toBe(403); // fremdes Kind
    });
  });

  describe('Kalender-Abo', () => {
    it('liefert einen iCal-Feed über den geheimen Link, nur auf der eigenen Schule, Erneuern macht den alten Link ungültig', async () => {
      const u = await h.createUser(tenantId, [{ role: 'STUDENT' }], undefined, 'STUDENT');
      await h.owner.enrollment.create({
        data: {
          tenantId,
          studentId: u.personId,
          classId: ids.c1,
          fromDate: new Date(`${addDays(today, -1)}T00:00:00Z`),
        },
      });
      const { client } = await h.loginFully(slug, u.email);
      const first = await client.post('/me/calendar-token');
      expect(first.json.url).toMatch(
        new RegExp(`^http://${slug}\\.localhost:3000/api/v1/calendar/[\\w-]+\\.ics$`),
      );
      const path = new URL(first.json.url).pathname.replace('/api/v1', '');
      const anon = h.client(slug);
      const ics = await h.app.inject({
        method: 'GET',
        url: `/api/v1${path}`,
        headers: { host: `${slug}.localhost` },
      });
      expect(ics.statusCode).toBe(200);
      expect(ics.headers['content-type']).toContain('text/calendar');
      expect(ics.body).toContain('BEGIN:VCALENDAR');
      expect(ics.body).toContain('SUMMARY:Mathematik');
      expect(ics.body).toMatch(/DTSTART:\d{8}T\d{6}Z/);
      expect(ics.body.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
      expect((await anon.get('/calendar/falsch.ics')).status).toBe(404);
      const other = await h.createTenant('ttx');
      expect(
        (
          await h.app.inject({
            method: 'GET',
            url: `/api/v1${path}`,
            headers: { host: `${other.slug}.localhost` },
          })
        ).statusCode,
      ).toBe(404);
      await client.post('/me/calendar-token');
      expect(
        (
          await h.app.inject({
            method: 'GET',
            url: `/api/v1${path}`,
            headers: { host: `${slug}.localhost` },
          })
        ).statusCode,
      ).toBe(404);
    });
  });
});
