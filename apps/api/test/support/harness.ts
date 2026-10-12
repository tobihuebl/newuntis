import 'reflect-metadata';
import { Controller, Get } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createPrisma, type Db, type Role } from '@sp/db';
import { ACTIONS, CSRF_HEADER, SESSION_COOKIE, type Action } from '@sp/shared';
import { hash } from '@node-rs/argon2';
import * as OTPAuth from 'otpauth';
import { AppModule } from '../../src/app.module';
import { configureApp, createAdapter } from '../../src/app.factory';
import { Can } from '../../src/common/decorators';
import { MailService, type Mail } from '../../src/modules/mail/mail.service';

export const PASSWORD = 'Test-Passwort-12345';

/** Ein Controller mit je einer Route pro Aktion der Rechte-Matrix (@Can), für den automatischen End-zu-Ende-Test. */
function buildMatrixController() {
  @Controller('t')
  class MatrixController {}
  for (const action of ACTIONS) {
    const name = `route_${action.replace(/\./g, '_')}`;
    const fn = function () {
      return { ok: true };
    };
    Object.defineProperty(MatrixController.prototype, name, {
      value: fn,
      writable: true,
      configurable: true,
    });
    const desc = Object.getOwnPropertyDescriptor(MatrixController.prototype, name)!;
    Get(action)(MatrixController.prototype, name, desc);
    Can(action)(MatrixController.prototype, name, desc);
  }
  return MatrixController;
}

export interface Response {
  status: number;
  json: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- Testhilfe: beliebige JSON-Antwort
  headers: Record<string, unknown>;
}

export class Client {
  cookie?: string;
  csrf?: string;
  constructor(
    private readonly app: NestFastifyApplication,
    readonly slug: string,
  ) {}

  async request(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: unknown,
    extra: Record<string, string> = {},
  ): Promise<Response> {
    const res = await this.app.inject({
      method,
      url: `/api/v1${url}`,
      payload: payload as object | undefined,
      headers: {
        host: `${this.slug}.localhost`,
        ...(this.cookie ? { cookie: `${SESSION_COOKIE}=${this.cookie}` } : {}),
        ...(this.csrf && method !== 'GET' ? { [CSRF_HEADER]: this.csrf } : {}),
        ...extra,
      },
    });
    const set = res.cookies.find((c) => c.name === SESSION_COOKIE);
    if (set) this.cookie = set.value || undefined;
    let json: unknown = undefined;
    try {
      json = res.json();
    } catch {
      /* leere Antwort */
    }
    const body = json as { csrfToken?: string } | undefined;
    if (body && typeof body.csrfToken === 'string') this.csrf = body.csrfToken;
    return { status: res.statusCode, json, headers: res.headers };
  }

  get = (url: string, extra?: Record<string, string>) => this.request('GET', url, undefined, extra);
  patch = (url: string, payload?: unknown, extra?: Record<string, string>) =>
    this.request('PATCH', url, payload, extra);
  del = (url: string, extra?: Record<string, string>) =>
    this.request('DELETE', url, undefined, extra);
  post = (url: string, payload?: unknown, extra?: Record<string, string>) =>
    this.request('POST', url, payload, extra);
  put = (url: string, payload?: unknown, extra?: Record<string, string>) =>
    this.request('PUT', url, payload, extra);
}

const usedSteps = new Map<string, number>();

/**
 * Gültiger, noch nicht benutzter Code: Der Server lässt jede 30-s-Scheibe nur einmal zu und akzeptiert
 * eine Scheibe Abweichung. Daher die kleinste noch freie Scheibe aus jetzt-1 bis jetzt+1 nehmen.
 */
export function totpCode(secret: string): string {
  const totp = new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const now = Math.floor(Date.now() / 30_000);
  const last = usedSteps.get(secret) ?? -Infinity;
  const step = [now - 1, now, now + 1].find((s) => s > last);
  if (step === undefined) throw new Error('Alle TOTP-Scheiben verbraucht; im Test kurz warten');
  usedSteps.set(secret, step);
  return totp.generate({ timestamp: step * 30_000 + 1 });
}

export class Harness {
  readonly owner: Db = createPrisma(process.env.TEST_DATABASE_URL);
  private passwordHash?: string;
  private counter = 0;

  constructor(
    readonly app: NestFastifyApplication,
    readonly mails: Mail[],
  ) {}

  /** `overrides`: weitere Dienste durch Testdoubles ersetzen (z. B. Web-Push). */
  static async create(
    options: { overrides?: [abstract new (...args: never[]) => unknown, unknown][] } = {},
  ): Promise<Harness> {
    const mails: Mail[] = [];
    let builder = Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
      controllers: [buildMatrixController()],
    })
      .overrideProvider(MailService)
      .useValue({ send: async (m: Mail) => void mails.push(m) });
    for (const [token, value] of options.overrides ?? [])
      builder = builder.overrideProvider(token).useValue(value);
    const moduleRef = await builder.compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(createAdapter());
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return new Harness(app, mails);
  }

  client(slug: string): Client {
    return new Client(this.app, slug);
  }

  async createTenant(prefix = 't'): Promise<{ id: string; slug: string }> {
    const slug = `${prefix}${Date.now().toString(36)}${this.counter++}`;
    const t = await this.owner.tenant.create({ data: { name: `Schule ${slug}`, slug } });
    return { id: t.id, slug };
  }

  /** Legt Person, Benutzer (mit Passwort) und Rollen an. */
  async createUser(
    tenantId: string,
    roles: { role: Role; classId?: string }[],
    email?: string,
    kind: 'STUDENT' | 'TEACHER' | 'GUARDIAN' | 'STAFF' = 'TEACHER',
  ) {
    this.passwordHash ??= await hash(PASSWORD, { algorithm: 2 });
    const n = this.counter++;
    const address = email ?? `user${n}@example.test`;
    const person = await this.owner.person.create({
      data: { tenantId, kind, firstName: 'Test', lastName: `Person${n}` },
    });
    await this.owner.user.create({
      data: { tenantId, personId: person.id, email: address, passwordHash: this.passwordHash },
    });
    for (const r of roles) {
      await this.owner.roleAssignment.create({
        data: { tenantId, personId: person.id, role: r.role, classId: r.classId ?? null },
      });
    }
    return { personId: person.id, email: address };
  }

  /** Meldet an und führt die nötigen 2FA-Schritte durch. `secret` ist das TOTP-Geheimnis, falls schon eingerichtet. */
  async loginFully(
    slug: string,
    email: string,
    secret?: string,
  ): Promise<{ client: Client; secret?: string; recoveryCodes?: string[] }> {
    const c = this.client(slug);
    const login = await c.post('/auth/login', { email, password: PASSWORD });
    if (login.status !== 200) throw new Error(`Login fehlgeschlagen: ${login.status}`);
    if (login.json.stage === 'NEEDS_2FA_SETUP') {
      const setup = await c.post('/auth/2fa/setup');
      const enable = await c.post('/auth/2fa/enable', { code: totpCode(setup.json.secret) });
      return { client: c, secret: setup.json.secret, recoveryCodes: enable.json.recoveryCodes };
    }
    if (login.json.stage === 'NEEDS_2FA_VERIFY') {
      if (!secret) throw new Error('TOTP-Geheimnis nötig');
      await c.post('/auth/2fa/verify', { code: totpCode(secret) });
    }
    return { client: c, secret };
  }

  /** Neue Schule mit angemeldeter Administration (inkl. 2FA-Einrichtung). */
  async tenantWithAdmin(prefix = 'm') {
    const t = await this.createTenant(prefix);
    const u = await this.createUser(t.id, [{ role: 'ADMIN' }]);
    const { client } = await this.loginFully(t.slug, u.email);
    return { tenant: t, admin: client, adminPersonId: u.personId, adminEmail: u.email };
  }

  async close(): Promise<void> {
    await this.app.close();
    await this.owner.$disconnect();
  }
}

export type { Action };
