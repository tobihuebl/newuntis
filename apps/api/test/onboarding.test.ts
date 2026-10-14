import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PRIVACY_NOTICE_VERSION } from '@sp/shared';
import { Harness, type Client } from './support/harness';
import { enroll, lesson, occurrence, smallSchool, today } from './support/school';

/**
 * Onboarding (ADR 0020): Flows je Rolle, Pflichtschritte als Guard, datengetriebene Schritte, Zugangsbriefe mit
 * persönlichem Code für Schüler:innen und Auswertung ohne Personenbezug.
 */
describe('Onboarding', () => {
  let h: Harness;
  let tenantId = '';
  let slug = '';
  let admin: Client;
  let kv: Client;
  let other: Client;
  const ids = {} as Record<'c1' | 'c2' | 'kv' | 's1' | 's2' | 'sx' | 'math', string>;

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.tenantWithAdmin('ob');
    tenantId = t.tenant.id;
    slug = t.tenant.slug;
    admin = t.admin;
    const s = await smallSchool(h, tenantId);
    ids.c1 = s.c1.id;
    ids.c2 = s.c2.id;
    ids.math = s.math.id;
    const k = await h.createUser(tenantId, [
      { role: 'TEACHER' },
      { role: 'HOMEROOM', classId: s.c1.id },
    ]);
    ids.kv = k.personId;
    await h.owner.person.update({
      where: { id: k.personId },
      data: { employmentHours: 20, teachingHours: 10 },
    });
    await h.owner.teacherSubject.create({
      data: { tenantId, teacherId: k.personId, subjectId: s.math.id },
    });
    await lesson(h, tenantId, s.version.id, {
      subjectId: s.math.id,
      classId: s.c1.id,
      teacherId: k.personId,
    });
    const o = await h.createUser(tenantId, [{ role: 'TEACHER' }]);
    // Schüler:innen ohne Konto (wie nach dem CSV-Import)
    for (const [key, classId, first] of [
      ['s1', s.c1.id, 'Lena'],
      ['s2', s.c1.id, 'Lena'],
      ['sx', s.c2.id, 'Max'],
    ] as const) {
      const p = await h.owner.person.create({
        data: { tenantId, kind: 'STUDENT', firstName: first, lastName: 'Huber' },
      });
      ids[key] = p.id;
      await enroll(h, tenantId, p.id, classId);
    }
    kv = (await h.loginFully(slug, k.email)).client;
    other = (await h.loginFully(slug, o.email)).client;
  });
  afterAll(async () => h.close());

  it('Lehrkraft (KV): Flow mit Pflichtschritten, Kontext und Zielen der eigenen Klasse', async () => {
    const r = await kv.get('/me/onboarding');
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ flows: ['teacher'], primary: 'teacher', needsFlow: true });
    const byId = Object.fromEntries(r.json.steps.map((s: { id: string }) => [s.id, s])) as Record<
      string,
      { status: string; required: boolean; href: string | null }
    >;
    expect(Object.keys(byId)).toEqual([
      'privacy',
      'push',
      'teacherData',
      'teacherTimetable',
      'teacherFirstEntry',
      'homeroomLetters',
      'homeroomApprovals',
      'teacherSubstitution',
      'teacherParentMessage',
    ]);
    expect(byId.homeroomLetters!.href).toBe(`/klasse/${ids.c1}/zugang`);
    expect(r.json.context.teacher).toMatchObject({
      subjects: ['Mathematik'],
      employmentHours: 20,
      teachingHours: 10,
      classes: ['1A'],
      homeroomClass: { id: ids.c1, name: '1A' },
    });
    // Andere Lehrkraft: ohne KV-Schritte
    const o = await other.get('/me/onboarding');
    expect(o.json.steps.some((s: { id: string }) => s.id.startsWith('homeroom'))).toBe(false);
  });

  it('Pflichtschritte steuern /me.needsOnboarding; Pflicht nicht überspringbar, Auto nicht abhakbar', async () => {
    expect((await kv.get('/me')).json.needsOnboarding).toBe(true);
    expect(
      (await kv.post('/me/onboarding/steps', { stepId: 'teacherData', status: 'SKIPPED' })).status,
    ).toBe(400);
    expect(
      (await kv.post('/me/onboarding/steps', { stepId: 'teacherFirstEntry', status: 'DONE' }))
        .status,
    ).toBe(400);
    expect(
      (await kv.post('/me/onboarding/steps', { stepId: 'studentClass', status: 'DONE' })).status,
    ).toBe(400);
    await kv.post('/me/onboarding/steps', { stepId: 'privacy', status: 'VIEWED' });
    await kv.post('/me/onboarding', { privacyNoticeVersion: PRIVACY_NOTICE_VERSION });
    await kv.post('/me/onboarding/steps', { stepId: 'push', status: 'SKIPPED' });
    await kv.post('/me/onboarding/steps', { stepId: 'teacherData', status: 'DONE' });
    expect((await kv.get('/me')).json.needsOnboarding).toBe(true);
    await kv.post('/me/onboarding/steps', { stepId: 'teacherTimetable', status: 'DONE' });
    expect((await kv.get('/me')).json.needsOnboarding).toBe(false);
    const u = await h.owner.user.findUniqueOrThrow({ where: { personId: ids.kv } });
    expect(u.onboardedAt).not.toBeNull();
  });

  it('Aha-Moment erkennt die erste Anwesenheit aus den Daten (mit deren Zeitpunkt)', async () => {
    const occ = await occurrence(h, tenantId, {
      date: today,
      period: 1,
      subjectId: ids.math,
      classId: ids.c1,
      teacherId: ids.kv,
    });
    const recorded = new Date(Date.now() - 60_000);
    await h.owner.attendance.create({
      data: {
        tenantId,
        occurrenceId: occ,
        studentId: ids.s1,
        status: 'ABSENT',
        recordedById: ids.kv,
        createdAt: recorded,
      },
    });
    const r = await kv.get('/me/onboarding');
    expect(r.json.steps.find((s: { id: string }) => s.id === 'teacherFirstEntry').status).toBe(
      'DONE',
    );
    const row = await h.owner.onboardingProgress.findFirstOrThrow({
      where: { stepId: 'teacherFirstEntry' },
    });
    expect(row.doneAt?.getTime()).toBe(recorded.getTime());
  });

  it('Checkliste ausblenden und wieder einblenden', async () => {
    await kv.post('/me/onboarding/steps', { stepId: 'checklistHidden', status: 'SKIPPED' });
    expect((await kv.get('/me/onboarding')).json.checklistHidden).toBe(true);
    await kv.post('/me/onboarding/steps', { stepId: 'checklistHidden', status: 'OPEN' });
    expect((await kv.get('/me/onboarding')).json.checklistHidden).toBe(false);
  });

  it('Zugangsbriefe: KV sieht die Klasse, stellt Codes aus (eindeutige Benutzernamen, mit Eltern-Code)', async () => {
    expect((await other.get(`/classes/${ids.c1}/access`)).status).toBe(403);
    const v = await kv.get(`/classes/${ids.c1}/access`);
    expect(v.status).toBe(200);
    expect(v.json.rows.map((r: { status: string }) => r.status)).toEqual(['none', 'none']);
    expect(
      (await kv.post(`/classes/${ids.c1}/access-codes`, { studentIds: [ids.sx] })).status,
    ).toBe(400);
    const r = await kv.post(`/classes/${ids.c1}/access-codes`, {
      studentIds: [ids.s1, ids.s2],
      withGuardianCodes: true,
    });
    expect(r.status).toBe(201);
    const letters = r.json.data as { username: string; code: string; guardianCode: string }[];
    expect(letters.map((l) => l.username).sort()).toEqual(['lena.huber', 'lena.huber2']);
    expect(letters.every((l) => /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}$/.test(l.code))).toBe(true);
    expect(letters.every((l) => l.guardianCode)).toBe(true);
    expect(await h.owner.guardianCode.count({ where: { tenantId } })).toBe(2);
    const after = await kv.get(`/classes/${ids.c1}/access`);
    expect(after.json.rows.map((r: { status: string }) => r.status)).toEqual(['issued', 'issued']);
    // KV-Checkliste: Zugangsbriefe erledigt
    const st = await kv.get('/me/onboarding');
    expect(st.json.steps.find((s: { id: string }) => s.id === 'homeroomLetters').status).toBe(
      'DONE',
    );
  });

  it('Einlösen: prüfen, Passwort setzen, mit Benutzername anmelden; neuer Code setzt zurück', async () => {
    const issued = await kv.post(`/classes/${ids.c1}/access-codes`, { studentIds: [ids.s1] });
    const { code, username } = issued.json.data[0] as { code: string; username: string };
    const pub = h.client(slug);
    expect((await pub.post('/auth/access-code/check', { code: 'AAAA-BBBB-CC' })).status).toBe(400);
    const check = await pub.post('/auth/access-code/check', { code: code.toLowerCase() });
    expect(check.json).toEqual({ firstName: 'Lena', className: '1A', username, reset: false });
    const red = await pub.post('/auth/access-code/redeem', {
      code,
      password: 'ein langes passwort',
    });
    expect(red.json).toEqual({ username });
    expect(
      (await pub.post('/auth/access-code/redeem', { code, password: 'nochmal lang genug' })).status,
    ).toBe(400);
    const login = await h.client(slug).post('/auth/login', {
      email: username,
      password: 'ein langes passwort',
    });
    expect(login.status).toBe(200);
    // Schüler:in: eigener Flow mit Klasse
    const student = h.client(slug);
    await student.post('/auth/login', { email: username, password: 'ein langes passwort' });
    const me = await student.get('/me');
    expect(me.json.user).toMatchObject({ email: null, username });
    const ob = await student.get('/me/onboarding');
    expect(ob.json.flows).toEqual(['student']);
    expect(ob.json.context.student).toMatchObject({ className: '1A', avatar: null });
    expect((await student.put('/me/avatar', { symbol: 'cat', color: 'mint' })).status).toBe(204);
    expect((await student.get('/me')).json.user.avatar).toBe('cat:mint');
    // Neuer Brief: altes Passwort bleibt bis zum Einlösen, danach gilt das neue und Sitzungen enden
    const again = await kv.post(`/classes/${ids.c1}/access-codes`, { studentIds: [ids.s1] });
    const check2 = await pub.post('/auth/access-code/check', { code: again.json.data[0].code });
    expect(check2.json.reset).toBe(true);
    await pub.post('/auth/access-code/redeem', {
      code: again.json.data[0].code,
      password: 'ganz neues passwort',
    });
    expect((await student.get('/me')).status).toBe(401);
    expect(
      (
        await h
          .client(slug)
          .post('/auth/login', { email: username, password: 'ganz neues passwort' })
      ).status,
    ).toBe(200);
  });

  it('Auswertung: Zahlen je Flow und Schritt, ohne Namen; nur Direktion und Administration', async () => {
    expect((await kv.get('/admin/onboarding/stats')).status).toBe(403);
    const r = await admin.get('/admin/onboarding/stats');
    expect(r.status).toBe(200);
    const teacher = r.json.data.find((f: { flow: string }) => f.flow === 'teacher');
    expect(teacher).toMatchObject({ started: 1, reachedAha: 1 });
    expect(teacher.medianHoursToAha).not.toBeNull();
    const data = teacher.steps.find((s: { stepId: string }) => s.stepId === 'teacherData');
    expect(data).toMatchObject({ viewed: 1, done: 1, skipped: 0 });
    expect(JSON.stringify(r.json)).not.toContain('Huber');
  });
});
