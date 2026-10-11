import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Harness, PASSWORD } from './support/harness';

describe('Eltern-Kind-Verknüpfung', () => {
  let h: Harness;
  let t: Awaited<ReturnType<Harness['tenantWithAdmin']>>;
  let kidA = '';
  let kidB = '';

  beforeAll(async () => {
    h = await Harness.create();
    t = await h.tenantWithAdmin('g');
    kidA = (
      await t.admin.post('/admin/persons', { kind: 'STUDENT', firstName: 'Kind', lastName: 'Eins' })
    ).json.id;
    kidB = (
      await t.admin.post('/admin/persons', { kind: 'STUDENT', firstName: 'Kind', lastName: 'Zwei' })
    ).json.id;
  });
  afterAll(async () => h.close());

  const redeemBody = (code: string, email: string) => ({
    code,
    firstName: 'Eva',
    lastName: 'Eltern',
    email,
    password: PASSWORD,
  });
  const makeCode = async (studentId: string, validDays = 30) =>
    (await t.admin.post('/admin/guardian-codes', { studentIds: [studentId], validDays })).json
      .data[0].code as string;

  it('Administration verknüpft direkt, doppelte Verknüpfung wird abgelehnt, Widerruf beendet sie sofort', async () => {
    const g = await t.admin.post('/admin/persons', {
      kind: 'GUARDIAN',
      firstName: 'Papa',
      lastName: 'Eins',
    });
    const link = await t.admin.post('/admin/guardian-links', {
      guardianId: g.json.id,
      studentId: kidA,
    });
    expect(link.status).toBe(201);
    expect(
      (await t.admin.post('/admin/guardian-links', { guardianId: g.json.id, studentId: kidA }))
        .status,
    ).toBe(400);
    expect(
      (await t.admin.post('/admin/guardian-links', { guardianId: kidA, studentId: kidB })).status,
    ).toBe(400); // Kind ist kein Elternteil
    expect((await t.admin.get(`/admin/persons/${kidA}`)).json.guardians).toHaveLength(1);
    expect((await t.admin.del(`/admin/guardian-links/${link.json.id}`)).status).toBe(204);
    expect((await t.admin.del(`/admin/guardian-links/${link.json.id}`)).status).toBe(404); // schon widerrufen
    // nach dem Widerruf darf dieselbe Verknüpfung wieder angelegt werden
    expect(
      (await t.admin.post('/admin/guardian-links', { guardianId: g.json.id, studentId: kidA }))
        .status,
    ).toBe(201);
  });

  it('Code aus dem Elternbrief: Konto anlegen, mit dem Kind verknüpft, danach Login möglich', async () => {
    const code = await makeCode(kidA);
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{2}$/);
    // Klartext steht nicht in der Datenbank
    const rows = await h.owner.guardianCode.findMany({ where: { studentId: kidA } });
    expect(rows.every((r) => !r.codeHash.includes(code.replace(/-/g, '')))).toBe(true);

    const anon = h.client(t.tenant.slug);
    // Eingabe darf klein und ohne Striche sein
    const res = await anon.post(
      '/auth/guardian-code/redeem',
      redeemBody(code.toLowerCase().replace(/-/g, ''), 'eva@example.test'),
    );
    expect(res.status).toBe(204);
    const login = await h.loginFully(t.tenant.slug, 'eva@example.test');
    const me = await login.client.get('/me');
    expect(me.json.user.roles).toEqual([{ role: 'GUARDIAN', classId: null }]);
    const links = await h.owner.guardianLink.findMany({
      where: { guardianId: me.json.user.personId },
    });
    expect(links.map((l) => l.studentId)).toEqual([kidA]);
  });

  it('ein Code gilt höchstens zweimal, danach ungültig', async () => {
    const code = await makeCode(kidB);
    const c = h.client(t.tenant.slug);
    expect(
      (await c.post('/auth/guardian-code/redeem', redeemBody(code, 'mama@example.test'))).status,
    ).toBe(204);
    expect(
      (await c.post('/auth/guardian-code/redeem', redeemBody(code, 'papa@example.test'))).status,
    ).toBe(204);
    const third = await c.post('/auth/guardian-code/redeem', redeemBody(code, 'oma@example.test'));
    expect(third.status).toBe(400);
    expect(third.json.title).toMatch(/ungültig/);
  });

  it('falscher oder abgelaufener Code und bereits vergebene E-Mail werden abgelehnt', async () => {
    const c = h.client(t.tenant.slug);
    expect(
      (await c.post('/auth/guardian-code/redeem', redeemBody('ABCD-EFGH-JK', 'x@example.test')))
        .status,
    ).toBe(400);
    expect(
      (
        await c.post('/auth/guardian-code/redeem', {
          ...redeemBody('ABCD-EFGH-JK', 'x@example.test'),
          code: 'kurz',
        })
      ).status,
    ).toBe(400);
    const code = await makeCode(kidA);
    await h.owner.guardianCode.updateMany({
      where: { studentId: kidA },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await c.post('/auth/guardian-code/redeem', redeemBody(code, 'spaet@example.test'))).status,
    ).toBe(400);
    const fresh = await makeCode(kidA);
    const dup = await c.post('/auth/guardian-code/redeem', redeemBody(fresh, 'eva@example.test')); // existiert schon
    expect(dup.status).toBe(400);
    expect(dup.json.title).toMatch(/schon ein Konto/);
  });

  it('angemeldete Eltern fügen mit einem weiteren Code ein weiteres Kind hinzu', async () => {
    const first = await makeCode(kidA);
    const c = h.client(t.tenant.slug);
    await c.post('/auth/guardian-code/redeem', redeemBody(first, 'zwei-kinder@example.test'));
    const login = await h.loginFully(t.tenant.slug, 'zwei-kinder@example.test');
    const second = await makeCode(kidB);
    expect((await login.client.post('/me/guardian-codes/redeem', { code: second })).status).toBe(
      204,
    );
    const me = await login.client.get('/me');
    const links = await h.owner.guardianLink.findMany({
      where: { guardianId: me.json.user.personId },
    });
    expect(links.map((l) => l.studentId).sort()).toEqual([kidA, kidB].sort());
    // dasselbe Kind nicht zweimal
    const again = await makeCode(kidB);
    expect((await login.client.post('/me/guardian-codes/redeem', { code: again })).status).toBe(
      400,
    );
  });

  it('Codes erzeugen darf nur die Administration; ohne Anmeldung gibt es nichts', async () => {
    const stu = await h.loginFully(
      t.tenant.slug,
      (await h.createUser(t.tenant.id, [{ role: 'STUDENT' }])).email,
    );
    expect((await stu.client.post('/admin/guardian-codes', { studentIds: [kidA] })).status).toBe(
      403,
    );
    expect(
      (await h.client(t.tenant.slug).post('/me/guardian-codes/redeem', { code: 'ABCD-EFGH-JK' }))
        .status,
    ).toBe(401);
  });

  it('ein Code einer anderen Schule ist hier wertlos', async () => {
    const other = await h.tenantWithAdmin('g2');
    const kid = (
      await other.admin.post('/admin/persons', {
        kind: 'STUDENT',
        firstName: 'Fremd',
        lastName: 'Kind',
      })
    ).json.id;
    const code = (await other.admin.post('/admin/guardian-codes', { studentIds: [kid] })).json
      .data[0].code as string;
    const res = await h
      .client(t.tenant.slug)
      .post('/auth/guardian-code/redeem', redeemBody(code, 'fremd@example.test'));
    expect(res.status).toBe(400);
  });
});
