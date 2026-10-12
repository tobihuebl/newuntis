import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Harness, PASSWORD, totpCode } from './support/harness';

describe('Anmeldung, Sitzung, Zwei-Faktor', () => {
  let h: Harness;
  let slug: string;
  let tenantId: string;

  beforeAll(async () => {
    h = await Harness.create();
    ({ slug, id: tenantId } = await h.createTenant());
  });
  afterAll(async () => h.close());

  it('Schüler: Login ohne 2FA, /me liefert Rollen und CSRF-Token', async () => {
    const u = await h.createUser(tenantId, [{ role: 'STUDENT' }]);
    const c = h.client(slug);
    const login = await c.post('/auth/login', { email: u.email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.json.stage).toBe('ACTIVE');
    const me = await c.get('/me');
    expect(me.status).toBe(200);
    expect(me.json.user.roles).toEqual([{ role: 'STUDENT', classId: null }]);
    expect(me.json.tenant.slug).toBe(slug);
    expect(me.json.csrfToken).toBe(login.json.csrfToken);
  });

  it('Sitzungs-Cookie ist httpOnly, SameSite=Lax; der Klartext-Token steht nicht in der Datenbank', async () => {
    const u = await h.createUser(tenantId, [{ role: 'STUDENT' }]);
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { host: `${slug}.localhost` },
      payload: { email: u.email, password: PASSWORD },
    });
    const cookie = res.cookies.find((x) => x.name === 'sp_session')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    const stored = await h.owner.session.findMany({ where: { tenantId } });
    expect(stored.some((s) => s.tokenHash === cookie.value)).toBe(false);
  });

  it('falsches Passwort und unbekannte Adresse antworten gleich (401, keine Kontenerkennung)', async () => {
    const u = await h.createUser(tenantId, [{ role: 'STUDENT' }]);
    const c = h.client(slug);
    const wrong = await c.post('/auth/login', { email: u.email, password: 'falsch-falsch-falsch' });
    const unknown = await c.post('/auth/login', {
      email: 'niemand@example.test',
      password: 'falsch-falsch-falsch',
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.json).toEqual(unknown.json);
    expect(wrong.headers['content-type']).toContain('application/problem+json');
  });

  it('sperrt das Konto nach zu vielen Fehlversuchen, auch mit richtigem Passwort', async () => {
    const u = await h.createUser(tenantId, [{ role: 'STUDENT' }]);
    const c = h.client(slug);
    for (let i = 0; i < 5; i++)
      await c.post('/auth/login', { email: u.email, password: 'falsch-falsch-falsch' });
    expect((await c.post('/auth/login', { email: u.email, password: PASSWORD })).status).toBe(401);
    await h.owner.user.updateMany({
      where: { email: u.email, tenantId },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    expect((await c.post('/auth/login', { email: u.email, password: PASSWORD })).status).toBe(200);
  });

  it('schreibende Anfragen ohne CSRF-Token werden abgelehnt', async () => {
    const u = await h.createUser(tenantId, [{ role: 'STUDENT' }]);
    const c = h.client(slug);
    await c.post('/auth/login', { email: u.email, password: PASSWORD });
    c.csrf = undefined;
    expect((await c.post('/auth/logout')).status).toBe(403);
    c.csrf = 'falsch';
    expect((await c.post('/auth/logout')).status).toBe(403);
  });

  it('Anfragen mit fremdem Origin werden abgelehnt', async () => {
    const c = h.client(slug);
    const res = await c.post(
      '/auth/login',
      { email: 'a@example.test', password: 'x' },
      { origin: 'https://evil.example' },
    );
    expect(res.status).toBe(403);
  });

  it('Abmelden beendet die Sitzung serverseitig', async () => {
    const u = await h.createUser(tenantId, [{ role: 'STUDENT' }]);
    const c = h.client(slug);
    await c.post('/auth/login', { email: u.email, password: PASSWORD });
    const cookie = c.cookie!;
    expect((await c.post('/auth/logout')).status).toBe(204);
    c.cookie = cookie; // altes Cookie weiterverwenden
    expect((await c.get('/me')).status).toBe(401);
  });

  it('Lehrer: 2FA ist Pflicht. Einrichten, Wiederherstellungscode, Login mit Code', async () => {
    const u = await h.createUser(tenantId, [{ role: 'TEACHER' }]);
    const c = h.client(slug);
    const login = await c.post('/auth/login', { email: u.email, password: PASSWORD });
    expect(login.json.stage).toBe('NEEDS_2FA_SETUP');
    // bis zur Einrichtung sind Fachrouten gesperrt
    expect((await c.get('/t/classbook.write')).status).toBe(403);

    const setup = await c.post('/auth/2fa/setup');
    expect(setup.json.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect((await c.post('/auth/2fa/enable', { code: '000000' })).status).toBe(400);
    const enable = await c.post('/auth/2fa/enable', { code: totpCode(setup.json.secret) });
    expect(enable.status).toBe(200);
    expect(enable.json.recoveryCodes).toHaveLength(10);
    expect((await c.get('/me')).json.stage).toBe('ACTIVE');

    // das Geheimnis liegt verschlüsselt in der Datenbank
    const row = await h.owner.user.findFirstOrThrow({ where: { email: u.email, tenantId } });
    expect(row.totpSecret).not.toContain(setup.json.secret);

    // neuer Login: Passwort allein reicht nicht
    const again = h.client(slug);
    expect(
      (await again.post('/auth/login', { email: u.email, password: PASSWORD })).json.stage,
    ).toBe('NEEDS_2FA_VERIFY');
    expect((await again.get('/t/classbook.write')).status).toBe(403);
    expect((await again.post('/auth/2fa/verify', { code: '123456' })).status).toBe(401);
    const fresh = totpCode(setup.json.secret);
    expect((await again.post('/auth/2fa/verify', { code: fresh })).status).toBe(200);
    expect((await again.get('/t/classbook.write')).status).toBe(200);

    // derselbe Code gilt kein zweites Mal (abgefangen oder mitgelesen)
    const replay = h.client(slug);
    await replay.post('/auth/login', { email: u.email, password: PASSWORD });
    expect((await replay.post('/auth/2fa/verify', { code: fresh })).status).toBe(401);

    // Wiederherstellungscode gilt genau einmal
    const code: string = enable.json.recoveryCodes[0];
    const viaRecovery = h.client(slug);
    await viaRecovery.post('/auth/login', { email: u.email, password: PASSWORD });
    expect((await viaRecovery.post('/auth/2fa/verify', { code })).status).toBe(200);
    const reuse = h.client(slug);
    await reuse.post('/auth/login', { email: u.email, password: PASSWORD });
    expect((await reuse.post('/auth/2fa/verify', { code })).status).toBe(401);
  });

  it('die Session-ID rotiert beim Wechsel in den aktiven Zustand (kein Session Fixation)', async () => {
    const u = await h.createUser(tenantId, [{ role: 'PRINCIPAL' }]);
    const c = h.client(slug);
    await c.post('/auth/login', { email: u.email, password: PASSWORD });
    const before = c.cookie;
    const setup = await c.post('/auth/2fa/setup');
    await c.post('/auth/2fa/enable', { code: totpCode(setup.json.secret) });
    expect(c.cookie).toBeDefined();
    expect(c.cookie).not.toBe(before);
  });

  it('Einladung: Passwort festlegen, Link nur einmal gültig, danach Login', async () => {
    const person = await h.owner.person.create({
      data: { tenantId, kind: 'GUARDIAN', firstName: 'Eva', lastName: 'Eltern' },
    });
    await h.owner.roleAssignment.create({
      data: { tenantId, personId: person.id, role: 'GUARDIAN' },
    });
    const auth = h.app.get((await import('../src/modules/auth/auth.service')).AuthService);
    const tenant = {
      id: tenantId,
      slug,
      name: 'T',
      settings: (await import('@sp/shared')).tenantSettingsSchema.parse({}),
    };
    const token = await auth.createInvitation(tenant, person.id, 'eva@example.test');
    expect(h.mails.at(-1)?.text).toContain(`/einladung?token=${token}`);

    const c = h.client(slug);
    expect((await c.post('/auth/invite/accept', { token, password: 'zu-kurz' })).status).toBe(400);
    expect(
      (await c.post('/auth/invite/accept', { token, password: 'Neues-Passwort-123' })).status,
    ).toBe(204);
    expect(
      (await c.post('/auth/invite/accept', { token, password: 'Anderes-Passwort-123' })).status,
    ).toBe(400);
    expect(
      (await c.post('/auth/login', { email: 'eva@example.test', password: 'Neues-Passwort-123' }))
        .status,
    ).toBe(200);
  });

  it('Passwort zurücksetzen: gleiche Antwort für unbekannte Adressen, Token einmalig, alle Sitzungen enden', async () => {
    const u = await h.createUser(tenantId, [{ role: 'STUDENT' }]);
    const c = h.client(slug);
    await c.post('/auth/login', { email: u.email, password: PASSWORD });
    const oldCookie = c.cookie!;

    const before = h.mails.length;
    expect(
      (
        await h
          .client(slug)
          .post('/auth/password/reset-request', { email: 'unbekannt@example.test' })
      ).status,
    ).toBe(204);
    expect(h.mails.length).toBe(before);
    expect(
      (await h.client(slug).post('/auth/password/reset-request', { email: u.email })).status,
    ).toBe(204);
    const token = /token=([\w-]+)/.exec(h.mails.at(-1)!.text)![1]!;

    const anon = h.client(slug);
    expect(
      (await anon.post('/auth/password/reset', { token, password: 'Brandneues-Passwort-1' }))
        .status,
    ).toBe(204);
    expect(
      (await anon.post('/auth/password/reset', { token, password: 'Nochmal-Passwort-123' })).status,
    ).toBe(400);
    c.cookie = oldCookie;
    expect((await c.get('/me')).status).toBe(401);
    expect(
      (
        await h
          .client(slug)
          .post('/auth/login', { email: u.email, password: 'Brandneues-Passwort-1' })
      ).status,
    ).toBe(200);
  });

  it('Mandantentrennung über HTTP: fremde Schule kennt weder Konto noch Sitzung', async () => {
    const other = await h.createTenant('andere');
    const u = await h.createUser(tenantId, [{ role: 'STUDENT' }]);
    const mine = h.client(slug);
    await mine.post('/auth/login', { email: u.email, password: PASSWORD });

    // dieselbe Adresse und dasselbe Passwort auf der anderen Schule: unbekannt
    expect(
      (await h.client(other.slug).post('/auth/login', { email: u.email, password: PASSWORD }))
        .status,
    ).toBe(401);
    // Sitzungs-Cookie von Schule A auf Schule B: ungültig
    const stolen = h.client(other.slug);
    stolen.cookie = mine.cookie;
    expect((await stolen.get('/me')).status).toBe(401);
    // unbekannte Schule
    expect((await h.client('gibt-es-nicht').get('/me')).status).toBe(404);
  });

  it('Audit-Log protokolliert Anmeldungen, Fehlversuche und Zugriff ohne Rechte', async () => {
    const u = await h.createUser(tenantId, [{ role: 'STUDENT' }]);
    const c = h.client(slug);
    await c.post('/auth/login', { email: u.email, password: 'falsch-falsch-falsch' });
    await c.post('/auth/login', { email: u.email, password: PASSWORD });
    await c.get('/t/masterdata.write');
    const actions = (await h.owner.auditLog.findMany({ where: { tenantId } })).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(['auth.login.failure', 'auth.login.success', 'access.denied']),
    );
  });
});

describe('Ratenbegrenzung', () => {
  it('Login wird pro IP begrenzt (429)', async () => {
    process.env.SP_TEST_RATELIMIT = 'on';
    const h = await Harness.create();
    try {
      const t = await h.createTenant();
      const c = h.client(t.slug);
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++)
        statuses.push(
          (await c.post('/auth/login', { email: 'x@example.test', password: 'y' })).status,
        );
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
    } finally {
      delete process.env.SP_TEST_RATELIMIT;
      await h.close();
    }
  });

  it('pro Sitzung: Route mit Limit und Grundlimit für Schreibzugriffe', async () => {
    process.env.SP_TEST_RATELIMIT = 'on';
    const h = await Harness.create();
    try {
      const t = await h.createTenant();
      const u = await h.createUser(t.id, [{ role: 'STUDENT' }], undefined, 'STUDENT');
      const { client } = await h.loginFully(t.slug, u.email);
      // Grundlimit für Schreibzugriffe einer Sitzung
      const { SESSION_LIMITS } = await import('../src/common/rate-limit.guard');
      const original = SESSION_LIMITS.write;
      SESSION_LIMITS.write = { limit: 3, windowSeconds: 60 };
      try {
        const statuses: number[] = [];
        for (let i = 0; i < 5; i++)
          statuses.push((await client.post('/notifications/read-all')).status);
        expect(statuses.slice(0, 3).every((s) => s < 400)).toBe(true);
        expect(statuses.slice(3)).toEqual([429, 429]);
        // Lesen hat ein eigenes, höheres Kontingent
        expect((await client.get('/me')).status).toBe(200);
      } finally {
        SESSION_LIMITS.write = original;
      }
    } finally {
      delete process.env.SP_TEST_RATELIMIT;
      await h.close();
    }
  });
});
