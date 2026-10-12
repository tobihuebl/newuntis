import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { addDays, nextWeekday, SESSION_COOKIE, type ServerEvent } from '@sp/shared';
import { EventsService } from '../src/modules/events/events.service';
import { Harness, type Client } from './support/harness';

const TZ = 'Europe/Vienna';
const today = DateTime.now().setZone(TZ).toISODate()!;
const at = (date: string, time: string) =>
  DateTime.fromISO(`${date}T${time}`, { zone: TZ }).toUTC().toJSDate();
let n = 0;
const mid = () => `mut-${Date.now().toString(36)}-${n++}`;

describe('Heute und Klassenbuch', () => {
  let h: Harness;
  let tenantId = '';
  let slug = '';
  let teacher: Client;
  let other: Client;
  let homeroom: Client;
  let principal: Client;
  let student: Client;
  let guardian: Client;
  const ids = {} as Record<
    | 'year'
    | 'class'
    | 'class2'
    | 'subject'
    | 'room'
    | 'teacher'
    | 'other'
    | 's1'
    | 's2'
    | 's3'
    | 'past'
    | 'now'
    | 'future'
    | 'cancelled',
    string
  >;

  /** Termin direkt anlegen (unabhängig vom Wochentag, an dem der Test läuft). */
  async function occurrence(
    date: string,
    period: number,
    opts: { classId?: string; teacherId?: string; status?: 'SCHEDULED' | 'CANCELLED' } = {},
  ) {
    const o = await h.owner.occurrence.create({
      data: {
        tenantId,
        date: new Date(`${date}T00:00:00Z`),
        periodStart: period,
        periodCount: 1,
        startsAt: at(date, `${String(7 + period).padStart(2, '0')}:00`),
        endsAt: at(date, `${String(7 + period).padStart(2, '0')}:50`),
        subjectId: ids.subject,
        classId: opts.classId ?? ids.class,
        roomId: ids.room,
        status: opts.status ?? 'SCHEDULED',
      },
    });
    await h.owner.occurrenceTeacher.create({
      data: { tenantId, occurrenceId: o.id, teacherId: opts.teacherId ?? ids.teacher },
    });
    return o.id;
  }

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.tenantWithAdmin('kb');
    tenantId = t.tenant.id;
    slug = t.tenant.slug;
    const admin = t.admin;
    ids.year = (
      await admin.post('/admin/school-years', {
        name: 'SJ',
        startsOn: addDays(today, -100),
        endsOn: addDays(today, 200),
        isCurrent: true,
      })
    ).json.id;
    ids.subject = (await admin.post('/admin/subjects', { name: 'Mathematik', code: 'M' })).json.id;
    ids.room = (await admin.post('/admin/rooms', { name: 'R1' })).json.id;
    ids.class = (
      await admin.post('/admin/classes', { schoolYearId: ids.year, name: '2A' })
    ).json.id;
    ids.class2 = (
      await admin.post('/admin/classes', { schoolYearId: ids.year, name: '2B' })
    ).json.id;

    const tUser = await h.createUser(tenantId, [{ role: 'TEACHER' }]);
    const oUser = await h.createUser(tenantId, [{ role: 'TEACHER' }]);
    const hrUser = await h.createUser(tenantId, [
      { role: 'TEACHER' },
      { role: 'HOMEROOM', classId: ids.class },
    ]);
    const pUser = await h.createUser(tenantId, [{ role: 'PRINCIPAL' }], undefined, 'STAFF');
    ids.teacher = tUser.personId;
    ids.other = oUser.personId;
    const students = [];
    for (const name of ['Zoe', 'Anna', 'Ben']) {
      const s = await h.createUser(tenantId, [{ role: 'STUDENT' }], undefined, 'STUDENT');
      await h.owner.person.update({ where: { id: s.personId }, data: { firstName: name } });
      students.push(s);
    }
    // Nachnamen bestimmen die Reihenfolge: Person<n>; s3 bekommt einen frühen Nachnamen
    ids.s1 = students[0]!.personId;
    ids.s2 = students[1]!.personId;
    ids.s3 = students[2]!.personId;
    await h.owner.person.update({ where: { id: ids.s3 }, data: { lastName: 'Aaron' } });
    for (const s of students)
      await h.owner.enrollment.create({
        data: {
          tenantId,
          studentId: s.personId,
          classId: ids.class,
          fromDate: new Date(`${addDays(today, -100)}T00:00:00Z`),
        },
      });
    const gUser = await h.createUser(tenantId, [{ role: 'GUARDIAN' }], undefined, 'GUARDIAN');
    await h.owner.guardianLink.create({
      data: {
        tenantId,
        guardianId: gUser.personId,
        studentId: ids.s1,
        validFrom: new Date(`${addDays(today, -100)}T00:00:00Z`),
      },
    });

    ids.past = await occurrence(addDays(today, -1), 2);
    ids.now = await occurrence(today, 1);
    ids.future = await occurrence(addDays(today, 3), 3);
    ids.cancelled = await occurrence(today, 4, { status: 'CANCELLED' });

    teacher = (await h.loginFully(slug, tUser.email)).client;
    other = (await h.loginFully(slug, oUser.email)).client;
    homeroom = (await h.loginFully(slug, hrUser.email)).client;
    principal = (await h.loginFully(slug, pUser.email)).client;
    student = (await h.loginFully(slug, students[0]!.email)).client;
    guardian = (await h.loginFully(slug, gUser.email)).client;
  });
  afterAll(async () => h.close());

  describe('Klassenbuch-Termin', () => {
    it('Lehrkraft der Stunde sieht Schülerliste (sortiert) und darf schreiben', async () => {
      const r = await teacher.get(`/occurrences/${ids.now}`);
      expect(r.status).toBe(200);
      expect(r.json.canWrite).toBe(true);
      expect(r.json.canClose).toBe(true);
      expect(r.json.class.name).toBe('2A');
      expect(r.json.students.map((s: { id: string }) => s.id)[0]).toBe(ids.s3);
      expect(r.json.students).toHaveLength(3);
      expect(r.json.entry).toBeNull();
    });

    it('fremde Lehrkraft und Schüler:innen bekommen 403; KV liest nur; Direktion korrigiert (protokolliert)', async () => {
      expect((await other.get(`/occurrences/${ids.now}`)).status).toBe(403);
      expect((await student.get(`/occurrences/${ids.now}`)).status).toBe(403);
      expect((await guardian.get(`/occurrences/${ids.now}`)).status).toBe(403);
      const hr = await homeroom.get(`/occurrences/${ids.now}`);
      expect(hr.status).toBe(200);
      expect(hr.json.canWrite).toBe(false);
      expect(
        (
          await homeroom.put(`/occurrences/${ids.now}/attendance`, {
            items: [
              {
                studentId: ids.s1,
                status: 'ABSENT',
                clientMutationId: mid(),
                clientUpdatedAt: new Date().toISOString(),
              },
            ],
          })
        ).status,
      ).toBe(403);
      const pr = await principal.get(`/occurrences/${ids.now}`);
      expect(pr.json.canWrite).toBe(true);
      const audit = await h.owner.auditLog.findMany({
        where: { tenantId, action: 'classbook.read', entityId: ids.now },
      });
      expect(audit.length).toBeGreaterThanOrEqual(2);
    });

    it('anderer Mandant sieht den Termin nicht', async () => {
      const t2 = await h.createTenant('kx');
      const u = await h.createUser(t2.id, [{ role: 'PRINCIPAL' }], undefined, 'STAFF');
      const c = (await h.loginFully(t2.slug, u.email)).client;
      expect((await c.get(`/occurrences/${ids.now}`)).status).toBe(404);
    });

    it('Anwesenheit: idempotent, "letzte Änderung gewinnt", fremde Schüler:innen abgelehnt', async () => {
      const t0 = new Date(Date.now() - 60_000).toISOString();
      const t1 = new Date(Date.now() - 30_000).toISOString();
      const m1 = mid();
      const first = await teacher.put(`/occurrences/${ids.now}/attendance`, {
        items: [{ studentId: ids.s1, status: 'ABSENT', clientMutationId: m1, clientUpdatedAt: t1 }],
      });
      expect(first.status).toBe(200);
      expect(first.json.applied).toBe(1);
      expect(first.json.attendance[ids.s1].status).toBe('ABSENT');
      const again = await teacher.put(`/occurrences/${ids.now}/attendance`, {
        items: [{ studentId: ids.s1, status: 'ABSENT', clientMutationId: m1, clientUpdatedAt: t1 }],
      });
      expect(again.json.applied).toBe(0);
      const older = await teacher.put(`/occurrences/${ids.now}/attendance`, {
        items: [
          { studentId: ids.s1, status: 'PRESENT', clientMutationId: mid(), clientUpdatedAt: t0 },
        ],
      });
      expect(older.json.applied).toBe(0);
      expect(older.json.attendance[ids.s1].status).toBe('ABSENT');
      const late = await teacher.put(`/occurrences/${ids.now}/attendance`, {
        items: [
          {
            studentId: ids.s1,
            status: 'LATE',
            lateMinutes: 10,
            clientMutationId: mid(),
            clientUpdatedAt: new Date().toISOString(),
          },
        ],
      });
      expect(late.json.attendance[ids.s1]).toMatchObject({ status: 'LATE', lateMinutes: 10 });
      const missingMinutes = await teacher.put(`/occurrences/${ids.now}/attendance`, {
        items: [
          {
            studentId: ids.s2,
            status: 'LATE',
            clientMutationId: mid(),
            clientUpdatedAt: new Date().toISOString(),
          },
        ],
      });
      expect(missingMinutes.status).toBe(400);
      const stranger = await h.createUser(tenantId, [{ role: 'STUDENT' }], undefined, 'STUDENT');
      const foreign = await teacher.put(`/occurrences/${ids.now}/attendance`, {
        items: [
          {
            studentId: stranger.personId,
            status: 'ABSENT',
            clientMutationId: mid(),
            clientUpdatedAt: new Date().toISOString(),
          },
        ],
      });
      expect(foreign.status).toBe(422);
    });

    it('Stoff und Hausübung: Version, Wiederholung derselben Änderung, Konflikt mit aktuellem Stand', async () => {
      const m = mid();
      const due = nextWeekday(today);
      const create = await teacher.put(`/occurrences/${ids.now}/classbook`, {
        baseVersion: 0,
        topic: 'Brüche addieren',
        homework: 'S. 12, Nr. 3',
        homeworkDueOn: due,
        clientMutationId: m,
      });
      expect(create.status).toBe(200);
      expect(create.json.entry).toMatchObject({
        version: 1,
        topic: 'Brüche addieren',
        homeworkDueOn: due,
      });
      const retry = await teacher.put(`/occurrences/${ids.now}/classbook`, {
        baseVersion: 0,
        topic: 'Brüche addieren',
        homework: 'S. 12, Nr. 3',
        homeworkDueOn: due,
        clientMutationId: m,
      });
      expect(retry.status).toBe(200);
      expect(retry.json.entry.version).toBe(1);
      const stale = await principal.put(`/occurrences/${ids.now}/classbook`, {
        baseVersion: 0,
        topic: 'Anderes Thema',
        clientMutationId: mid(),
      });
      expect(stale.status).toBe(409);
      expect(stale.json.current).toMatchObject({ version: 1, topic: 'Brüche addieren' });
      const update = await principal.put(`/occurrences/${ids.now}/classbook`, {
        baseVersion: 1,
        topic: 'Brüche addieren und kürzen',
        homework: 'S. 12, Nr. 3',
        homeworkDueOn: due,
        clientMutationId: mid(),
      });
      expect(update.json.entry.version).toBe(2);
    });

    it('Hausübung erscheint in der Heute-Ansicht der Schüler:in und der Eltern', async () => {
      const s = await student.get('/today');
      expect(s.status).toBe(200);
      expect(s.json.view).toBe('student');
      expect(s.json.homework.map((x: { text: string }) => x.text)).toContain('S. 12, Nr. 3');
      expect(s.json.lessons.map((l: { id: string }) => l.id)).toEqual(
        expect.arrayContaining([ids.now, ids.cancelled]),
      );
      const g = await guardian.get('/today');
      expect(g.json.view).toBe('guardian');
      expect(g.json.studentId).toBe(ids.s1);
      expect(g.json.children).toHaveLength(1);
      expect(g.json.homework).toHaveLength(1);
      expect((await guardian.get(`/today?studentId=${ids.s2}`)).status).toBe(403);
    });

    it('Prüfungen der nächsten Tage erscheinen bei Schüler:innen', async () => {
      await h.owner.exam.create({
        data: {
          tenantId,
          classId: ids.class,
          subjectId: ids.subject,
          date: new Date(`${addDays(today, 2)}T00:00:00Z`),
          title: '1. Schularbeit',
          kind: 'Schularbeit',
          createdById: ids.teacher,
        },
      });
      const s = await student.get('/today');
      expect(s.json.exams.map((e: { title: string }) => e.title)).toEqual(['1. Schularbeit']);
    });

    it('Abschließen: fehlende Anwesenheit wird "anwesend", idempotent; Zukunft und Entfall nicht', async () => {
      const c = await teacher.post(`/occurrences/${ids.now}/close`, { clientMutationId: mid() });
      expect(c.status).toBe(200);
      expect(c.json.entry.closedAt).toBeTruthy();
      const d = await teacher.get(`/occurrences/${ids.now}`);
      expect(Object.keys(d.json.attendance)).toHaveLength(3);
      expect(d.json.attendance[ids.s2].status).toBe('PRESENT');
      expect(d.json.attendance[ids.s1].status).toBe('LATE');
      const again = await teacher.post(`/occurrences/${ids.now}/close`, {
        clientMutationId: mid(),
      });
      expect(again.json.entry.closedAt).toBe(c.json.entry.closedAt);
      expect(
        (await teacher.post(`/occurrences/${ids.future}/close`, { clientMutationId: mid() }))
          .status,
      ).toBe(422);
      expect(
        (await teacher.post(`/occurrences/${ids.cancelled}/close`, { clientMutationId: mid() }))
          .status,
      ).toBe(422);
    });
  });

  describe('Heute und offene Einträge (Lehrkraft)', () => {
    it('zeigt eigene Stunden mit Stand des Klassenbuchs und offene Einträge', async () => {
      const r = await teacher.get('/today');
      expect(r.json.view).toBe('teacher');
      const byId = Object.fromEntries(
        r.json.lessons.map((l: { id: string; classbook: string | null }) => [l.id, l.classbook]),
      );
      expect(byId[ids.now]).toBe('closed');
      expect(byId[ids.cancelled]).toBeNull();
      expect(r.json.teacher.openEntries).toBe(1); // gestern
      const open = await teacher.get('/classbook/open');
      expect(open.json.data.map((o: { id: string }) => o.id)).toEqual([ids.past]);
      expect((await student.get('/classbook/open')).status).toBe(403);
    });

    it('Supplierung für die Person erscheint im Banner', async () => {
      const sub = await occurrence(addDays(today, 1), 5, {
        classId: ids.class2,
        teacherId: ids.other,
      });
      await h.owner.occurrenceTeacher.deleteMany({ where: { occurrenceId: sub } });
      await h.owner.occurrenceTeacher.create({
        data: { tenantId, occurrenceId: sub, teacherId: ids.teacher },
      });
      await h.owner.occurrence.update({ where: { id: sub }, data: { status: 'SUBSTITUTED' } });
      await h.owner.substitution.create({
        data: {
          tenantId,
          occurrenceId: sub,
          kind: 'SUBSTITUTE',
          substituteTeacherId: ids.teacher,
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      });
      const r = await teacher.get('/today');
      expect(r.json.teacher.substitutions.map((s: { id: string }) => s.id)).toEqual([sub]);
      const d = await teacher.get(`/occurrences/${sub}`);
      expect(d.json.canWrite).toBe(true);
      expect(d.json.substitution).toEqual({ kind: 'SUBSTITUTE' });
      expect(d.json.class.name).toBe('2B');
      // die ursprüngliche Lehrkraft schreibt nicht mehr
      expect((await other.get(`/occurrences/${sub}`)).status).toBe(403);
    });

    it('Offline-Paket enthält offene und kommende Stunden mit Schülerlisten', async () => {
      const r = await teacher.get('/classbook/prefetch');
      expect(r.status).toBe(200);
      const got = r.json.data.map((d: { id: string }) => d.id);
      expect(got).toEqual(expect.arrayContaining([ids.past, ids.now, ids.future]));
      expect(got).not.toContain(ids.cancelled);
      expect(r.json.data.find((d: { id: string }) => d.id === ids.past).students).toHaveLength(3);
    });
  });

  describe('Echtzeit', () => {
    const wait = async (pred: () => boolean, ms = 3000) => {
      const end = Date.now() + ms;
      while (!pred() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
      return pred();
    };

    it('Änderung erreicht nach dem Commit nur die Lehrkräfte der Stunde; Last-Event-ID liefert nach', async () => {
      const events = h.app.get(EventsService);
      const mine: { id: string; e: ServerEvent }[] = [];
      const theirs: ServerEvent[] = [];
      const off1 = events.subscribe({
        tenantId,
        personId: ids.teacher,
        send: (id, e) => mine.push({ id, e }),
      });
      const off2 = events.subscribe({
        tenantId,
        personId: ids.other,
        send: (_, e) => theirs.push(e),
      });
      await teacher.put(`/occurrences/${ids.past}/attendance`, {
        items: [
          {
            studentId: ids.s2,
            status: 'ABSENT',
            clientMutationId: mid(),
            clientUpdatedAt: new Date().toISOString(),
          },
        ],
      });
      expect(await wait(() => mine.length > 0)).toBe(true);
      expect(mine[0]!.e).toEqual({ type: 'occurrence.updated', ids: [ids.past] });
      expect(theirs).toEqual([]);
      // abgelehnte Änderung (403) erzeugt kein Ereignis
      await other.put(`/occurrences/${ids.past}/classbook`, {
        baseVersion: 0,
        topic: 'x',
        clientMutationId: mid(),
      });
      off1();
      off2();

      const replay: ServerEvent[] = [];
      const firstId = mine[0]!.id;
      await teacher.post(`/occurrences/${ids.past}/close`, { clientMutationId: mid() });
      await new Promise((r) => setTimeout(r, 300));
      const off3 = events.subscribe(
        { tenantId, personId: ids.teacher, send: (_, e) => replay.push(e) },
        firstId,
      );
      expect(replay.map((e) => e.type)).toEqual(['occurrence.updated']);
      off3();
      const unknown: ServerEvent[] = [];
      events.subscribe(
        { tenantId, personId: ids.teacher, send: (_, e) => unknown.push(e) },
        'alt-1',
      )();
      expect(unknown.map((e) => e.type)).toEqual(['resync']);
    });

    it('GET /events liefert einen Server-Sent-Events-Stream', async () => {
      await h.app.listen(0, '127.0.0.1');
      const { port } = h.app.getHttpServer().address() as AddressInfo;
      const first = await new Promise<{ status: number; type: string; chunk: string }>(
        (resolve, reject) => {
          const req = httpRequest(
            {
              host: '127.0.0.1',
              port,
              path: '/api/v1/events',
              headers: { host: `${slug}.localhost`, cookie: `${SESSION_COOKIE}=${teacher.cookie}` },
            },
            (res) => {
              res.once('data', (d: Buffer) => {
                resolve({
                  status: res.statusCode ?? 0,
                  type: String(res.headers['content-type']),
                  chunk: d.toString(),
                });
                req.destroy();
              });
            },
          );
          req.on('error', reject);
          req.end();
        },
      );
      expect(first.status).toBe(200);
      expect(first.type).toContain('text/event-stream');
      expect(first.chunk).toContain('retry: 5000');
    });
  });
});
