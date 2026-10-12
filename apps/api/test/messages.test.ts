import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AnnouncementsService } from '../src/modules/messages/announcements.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { Harness, type Client } from './support/harness';
import { enroll, lesson, smallSchool } from './support/school';

describe('Nachrichten und Rundschreiben (KO-01, KO-02)', () => {
  let h: Harness;
  let tenantId = '';
  let teacher: Client;
  let colleague: Client;
  let principal: Client;
  let student: Client;
  let guardian: Client;
  let guardian2: Client;
  let otherGuardian: Client;
  const ids = {} as Record<
    | 'c1'
    | 'c2'
    | 'teacher'
    | 'colleague'
    | 'principal'
    | 'student'
    | 'student2'
    | 'otherStudent'
    | 'guardian'
    | 'guardian2'
    | 'otherGuardian',
    string
  >;

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.createTenant('msg');
    tenantId = t.id;
    const s = await smallSchool(h, t.id);
    ids.c1 = s.c1.id;
    ids.c2 = s.c2.id;
    const tu = await h.createUser(t.id, [{ role: 'TEACHER' }]);
    const cu = await h.createUser(t.id, [{ role: 'TEACHER' }]);
    const pu = await h.createUser(t.id, [{ role: 'PRINCIPAL' }]);
    ids.teacher = tu.personId;
    ids.colleague = cu.personId;
    ids.principal = pu.personId;
    // Lehrkraft unterrichtet 1A, die Kollegin 1B
    await lesson(h, t.id, s.version.id, {
      subjectId: s.math.id,
      classId: s.c1.id,
      teacherId: tu.personId,
    });
    await lesson(h, t.id, s.version.id, {
      subjectId: s.eng.id,
      classId: s.c2.id,
      teacherId: cu.personId,
    });
    const link = (guardianId: string, studentId: string) =>
      h.owner.guardianLink.create({
        data: { tenantId: t.id, guardianId, studentId, validFrom: new Date('2020-01-01') },
      });
    const st = await h.createUser(t.id, [{ role: 'STUDENT' }], undefined, 'STUDENT');
    const st2 = await h.createUser(t.id, [{ role: 'STUDENT' }], undefined, 'STUDENT');
    const ost = await h.createUser(t.id, [{ role: 'STUDENT' }], undefined, 'STUDENT');
    ids.student = st.personId;
    ids.student2 = st2.personId;
    ids.otherStudent = ost.personId;
    await enroll(h, t.id, st.personId, s.c1.id);
    await enroll(h, t.id, st2.personId, s.c1.id);
    await enroll(h, t.id, ost.personId, s.c2.id);
    const g = await h.createUser(t.id, [{ role: 'GUARDIAN' }], undefined, 'GUARDIAN');
    const g2 = await h.createUser(t.id, [{ role: 'GUARDIAN' }], undefined, 'GUARDIAN');
    const og = await h.createUser(t.id, [{ role: 'GUARDIAN' }], undefined, 'GUARDIAN');
    ids.guardian = g.personId;
    ids.guardian2 = g2.personId;
    ids.otherGuardian = og.personId;
    await link(g.personId, st.personId);
    await link(g2.personId, st2.personId);
    await link(og.personId, ost.personId);
    teacher = (await h.loginFully(t.slug, tu.email)).client;
    colleague = (await h.loginFully(t.slug, cu.email)).client;
    principal = (await h.loginFully(t.slug, pu.email)).client;
    student = (await h.loginFully(t.slug, st.email)).client;
    guardian = (await h.loginFully(t.slug, g.email)).client;
    guardian2 = (await h.loginFully(t.slug, g2.email)).client;
    otherGuardian = (await h.loginFully(t.slug, og.email)).client;
  });
  afterAll(async () => h.close());

  it('Lehrkräfte erreichen Kolleg:innen sowie Schüler:innen und Eltern der eigenen Klassen', async () => {
    const res = await teacher.get('/threads/recipients');
    expect(res.status).toBe(200);
    const got = res.json.data.map((r: { id: string }) => r.id);
    expect(got).toEqual(
      expect.arrayContaining([ids.colleague, ids.principal, ids.student, ids.guardian]),
    );
    expect(got).not.toContain(ids.otherStudent);
    expect(got).not.toContain(ids.otherGuardian);
    expect(got).not.toContain(ids.teacher);
    expect(res.json.classes.map((c: { id: string }) => c.id)).toEqual([ids.c1]);
    const g = res.json.data.find((r: { id: string }) => r.id === ids.guardian);
    expect(g.kind).toBe('guardian');
    expect(g.context).toContain('1A');
  });

  it('Eltern schreiben nur an Lehrkräfte ihrer Kinder und die Direktion', async () => {
    const res = await guardian.get('/threads/recipients');
    const got = res.json.data.map((r: { id: string }) => r.id);
    expect(got.sort()).toEqual([ids.teacher, ids.principal].sort());
    expect(
      (
        await guardian.post('/threads', {
          subject: 'Hallo',
          body: 'Test',
          to: { kind: 'persons', personIds: [ids.guardian2] },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await guardian.post('/threads', {
          subject: 'Frage',
          body: 'Test',
          to: { kind: 'persons', personIds: [ids.colleague] },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await guardian.post('/threads', {
          subject: 'Ausflug',
          body: 'Test',
          to: { kind: 'class', classId: ids.c1, audience: 'guardians' },
        })
      ).status,
    ).toBe(403);
  });

  it('Schüler:innen beginnen keine Gespräche, antworten aber in eigenen', async () => {
    expect((await student.get('/threads/recipients')).status).toBe(403);
    expect(
      (
        await student.post('/threads', {
          subject: 'x',
          body: 'y',
          to: { kind: 'persons', personIds: [ids.teacher] },
        })
      ).status,
    ).toBe(403);
    const created = await teacher.post('/threads', {
      subject: 'Referat',
      body: 'Bitte bis Freitag abgeben.',
      to: { kind: 'persons', personIds: [ids.student] },
    });
    expect(created.status).toBe(201);
    const threadId = created.json.threadIds[0];
    expect(
      (await student.post(`/threads/${threadId}/messages`, { body: 'Mache ich!' })).status,
    ).toBe(201);
    const detail = await teacher.get(`/threads/${threadId}`);
    expect(detail.json.messages.map((m: { body: string }) => m.body)).toEqual([
      'Bitte bis Freitag abgeben.',
      'Mache ich!',
    ]);
  });

  it('Nachricht an die Eltern einer Klasse: je Familie ein Gespräch, Antworten bleiben privat', async () => {
    const res = await teacher.post('/threads', {
      subject: 'Wandertag',
      body: 'Am Freitag ist Wandertag.',
      to: { kind: 'class', classId: ids.c1, audience: 'guardians' },
    });
    expect(res.status).toBe(201);
    expect(res.json.threadIds).toHaveLength(2);
    expect(res.json.skipped).toBe(0);
    // Klasse der Kollegin: nicht erlaubt
    expect(
      (
        await teacher.post('/threads', {
          subject: 'x',
          body: 'y',
          to: { kind: 'class', classId: ids.c2, audience: 'guardians' },
        })
      ).status,
    ).toBe(403);

    const inbox1 = await guardian.get('/threads');
    const mine = inbox1.json.data.find((t: { subject: string }) => t.subject === 'Wandertag');
    expect(mine.unread).toBe(1);
    expect(mine.aboutStudent.id).toBe(ids.student);
    expect(mine.className).toBe('1A');
    expect((await guardian.get('/threads/unread')).json.messages).toBeGreaterThanOrEqual(1);

    await guardian.post(`/threads/${mine.id}/messages`, { body: 'Braucht er Jause?' });
    // Andere Familie sieht die Antwort nicht
    const inbox2 = await guardian2.get('/threads');
    const theirs = inbox2.json.data.find((t: { subject: string }) => t.subject === 'Wandertag');
    expect(theirs.id).not.toBe(mine.id);
    const d2 = await guardian2.get(`/threads/${theirs.id}`);
    expect(d2.json.messages).toHaveLength(1);
    expect((await guardian2.get(`/threads/${mine.id}`)).status).toBe(404);
    expect((await guardian2.post(`/threads/${mine.id}/messages`, { body: 'x' })).status).toBe(404);

    // Gelesen markieren
    await guardian2.post(`/threads/${theirs.id}/read`);
    const after = await guardian2.get('/threads');
    expect(after.json.data.find((t: { id: string }) => t.id === theirs.id).unread).toBe(0);

    // Lehrkraft sieht die Antwort als ungelesen, die neueste Nachricht steht oben
    const tInbox = await teacher.get('/threads');
    expect(tInbox.json.data[0].id).toBe(mine.id);
    expect(tInbox.json.data[0].unread).toBe(1);
    expect(tInbox.json.data[0].lastMessage.preview).toBe('Braucht er Jause?');

    // Benachrichtigung ohne Inhalt
    const notes = await h.owner.notification.findMany({
      where: { tenantId, personId: ids.teacher, type: 'message.new' },
    });
    expect(notes.length).toBeGreaterThan(0);
    expect(JSON.stringify(notes[0]!.payload)).not.toContain('Jause');
  });

  it('Rundschreiben mit Lesebestätigung: Zielgruppe, Bestätigung, Statistik, Erinnerung', async () => {
    const audience = { roles: ['GUARDIAN'], classIds: [ids.c1], groupIds: [] };
    expect((await teacher.post('/announcements', { title: 'x', body: 'y', audience })).status).toBe(
      403,
    );
    const preview = await principal.post('/announcements/preview', { audience });
    expect(preview.json.count).toBe(2);
    const res = await principal.post('/announcements', {
      title: 'Elternabend',
      body: 'Am Dienstag um 18 Uhr.',
      audience,
      requiresRead: true,
    });
    expect(res.status).toBe(201);
    expect(res.json.recipients).toBe(2);
    const id = res.json.id;

    const inbox = await guardian.get('/announcements');
    expect(inbox.json.data[0]).toMatchObject({ id, requiresRead: true, readAt: null, stats: null });
    expect((await guardian.get('/threads/unread')).json.required).toBe(1);
    expect((await otherGuardian.get(`/announcements/${id}`)).status).toBe(404);
    expect((await otherGuardian.get('/announcements?view=sent')).status).toBe(403);

    expect((await guardian.post(`/announcements/${id}/read`)).status).toBe(200);
    expect((await guardian.get('/threads/unread')).json.required).toBe(0);

    const detail = await principal.get(`/announcements/${id}`);
    expect(detail.json.stats).toEqual({ recipients: 2, read: 1 });
    expect(detail.json.unread.map((u: { id: string }) => u.id)).toEqual([ids.guardian2]);
    const sent = await principal.get('/announcements?view=sent');
    expect(sent.json.data[0].stats).toEqual({ recipients: 2, read: 1 });

    const remind = await principal.post(`/announcements/${id}/remind`);
    expect(remind.json.reminded).toBe(1);
    expect((await principal.post(`/announcements/${id}/remind`)).status).toBe(409);
    const notes = await h.owner.notification.findMany({
      where: { tenantId, personId: ids.guardian2, type: 'announcement.required' },
    });
    expect(notes).toHaveLength(2);
  });

  it('Pflichtmitteilungen lassen sich nicht abschalten', async () => {
    const prefs = await guardian.get('/me/preferences');
    expect(prefs.json.mandatory).toEqual(
      expect.arrayContaining([{ type: 'announcement.required', channel: 'push' }]),
    );
    const res = await guardian.patch('/me/preferences', {
      channels: [{ type: 'announcement.required', channel: 'push', enabled: false }],
    });
    expect(res.status).toBe(409);
  });

  it('automatische Erinnerung nach der eingestellten Frist, einmalig', async () => {
    const res = await principal.post('/announcements', {
      title: 'Einverständnis Schikurs',
      body: 'Bitte bestätigen.',
      audience: { roles: ['GUARDIAN'], classIds: [ids.c1], groupIds: [] },
      requiresRead: true,
    });
    const svc = h.app.get(AnnouncementsService);
    const prisma = h.app.get(PrismaService);
    const later = new Date(Date.now() + 3 * 86_400_000);
    const n = await prisma.runAsTenant(tenantId, (tx) => svc.daily(tx, tenantId, later));
    expect(n).toBeGreaterThanOrEqual(1);
    const again = await prisma.runAsTenant(tenantId, (tx) => svc.daily(tx, tenantId, later));
    expect(again).toBe(0);
    const a = await h.owner.announcement.findUniqueOrThrow({ where: { id: res.json.id } });
    expect(a.remindedAt).not.toBeNull();
  });

  it('eingeschränkte Verarbeitung: keine Nachrichten, Rundschreiben oder Benachrichtigungen', async () => {
    await h.owner.person.update({
      where: { id: ids.guardian2 },
      data: { restrictedAt: new Date() },
    });
    const r = await teacher.get('/threads/recipients');
    expect(r.json.data.map((x: { id: string }) => x.id)).not.toContain(ids.guardian2);
    const preview = await principal.post('/announcements/preview', {
      audience: { roles: ['GUARDIAN'], classIds: [ids.c1], groupIds: [] },
    });
    expect(preview.json.count).toBe(1);
    await h.owner.person.update({ where: { id: ids.guardian2 }, data: { restrictedAt: null } });
  });

  it('Kollegin kann Gespräche anderer nicht lesen', async () => {
    const inbox = await teacher.get('/threads');
    const any = inbox.json.data[0].id;
    expect((await colleague.get(`/threads/${any}`)).status).toBe(404);
    expect((await colleague.post(`/threads/${any}/read`)).status).toBe(404);
  });

  it('Klassen der Lehrkraft (/klassen) mit Schülerliste, fremde Klasse verboten', async () => {
    const list = await teacher.get('/my-classes');
    expect(list.json.data).toEqual([
      { id: ids.c1, name: '1A', homeroom: false, students: 2, subjects: ['Mathematik'] },
    ]);
    const d = await teacher.get(`/my-classes/${ids.c1}`);
    expect(d.json.students.map((s: { id: string }) => s.id).sort()).toEqual(
      [ids.student, ids.student2].sort(),
    );
    expect(d.json.students[0].guardians).toBe(1);
    expect((await teacher.get(`/my-classes/${ids.c2}`)).status).toBe(403);
    expect((await guardian.get(`/my-classes/${ids.c1}`)).status).toBe(403);
    expect((await principal.get('/my-classes')).json.data).toHaveLength(2);
  });
});
