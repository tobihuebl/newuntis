import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { ACTIONS, ROLES, PERMISSION_MATRIX, type Action, type Role } from '@sp/shared';
import { AUTHENTICATED, CAN, NO_TENANT, PUBLIC } from '../src/common/decorators';
import { Harness } from './support/harness';

describe('Jeder Endpunkt deklariert seine Rechte', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await Harness.create();
  });
  afterAll(async () => h.close());

  it('keine Route ohne @Public, @Authenticated, @Can oder @NoTenant', () => {
    const discovery = h.app.get(DiscoveryService);
    const scanner = new MetadataScanner();
    const reflector = h.app.get(Reflector);
    const undeclared: string[] = [];
    let routes = 0;
    for (const wrapper of discovery.getControllers()) {
      const { instance } = wrapper;
      if (!instance) continue;
      const proto = Object.getPrototypeOf(instance);
      for (const name of scanner.getAllMethodNames(proto)) {
        const handler = proto[name];
        if (reflector.get('path', handler) === undefined) continue; // kein Routen-Handler
        routes++;
        const targets = [handler, instance.constructor];
        const declared = [PUBLIC, AUTHENTICATED, CAN, NO_TENANT].some(
          (k) => reflector.getAllAndOverride(k, targets) !== undefined,
        );
        if (!declared) undeclared.push(`${instance.constructor.name}.${name}`);
      }
    }
    expect(routes).toBeGreaterThan(10);
    expect(undeclared).toEqual([]);
  });

  it('eine Route ohne Deklaration wird verweigert (Standard: Verbot)', async () => {
    // /me ist deklariert; der Gegentest sitzt im Guard (siehe auth.guard.ts). Hier: unbekannte Route -> 404, nie 200.
    const t = await h.createTenant();
    const res = await h.client(t.slug).get('/gibt-es-nicht');
    expect(res.status).toBe(404);
  });
});

describe('Rechte-Matrix End zu End (für jede Aktion und jede Rolle ein HTTP-Aufruf)', () => {
  let h: Harness;
  const clients = new Map<Role, Awaited<ReturnType<Harness['loginFully']>>['client']>();

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.createTenant();
    for (const role of ROLES) {
      const u = await h.createUser(t.id, [{ role }]);
      const { client } = await h.loginFully(t.slug, u.email);
      clients.set(role, client);
    }
  });
  afterAll(async () => h.close());

  for (const action of ACTIONS) {
    for (const role of ROLES) {
      const allowed = PERMISSION_MATRIX[action as Action][role] !== undefined;
      it(`${role} -> ${action}: ${allowed ? 'erlaubt' : 'verboten'}`, async () => {
        const res = await clients.get(role)!.get(`/t/${action}`);
        expect(res.status).toBe(allowed ? 200 : 403);
      });
    }
  }

  it('ohne Anmeldung sind alle Fachrouten 401', async () => {
    const t = await h.createTenant();
    for (const action of ACTIONS)
      expect((await h.client(t.slug).get(`/t/${action}`)).status).toBe(401);
  });
});
