import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma, withTenant, type Db } from '@sp/db';

/** Mandantentrennung auf Datenbankebene, mit der Laufzeit-Rolle sp_app und einem echten Postgres. */
describe('Row-Level-Security', () => {
  const owner: Db = createPrisma(process.env.TEST_DATABASE_URL);
  const app: Db = createPrisma(process.env.TEST_DATABASE_APP_URL);
  let a = '';
  let b = '';

  beforeAll(async () => {
    const ta = await owner.tenant.create({ data: { name: 'A', slug: `rls-a-${Date.now()}` } });
    const tb = await owner.tenant.create({ data: { name: 'B', slug: `rls-b-${Date.now()}` } });
    a = ta.id;
    b = tb.id;
    await owner.person.create({
      data: { tenantId: a, kind: 'STUDENT', firstName: 'Anna', lastName: 'A' },
    });
    await owner.person.create({
      data: { tenantId: b, kind: 'STUDENT', firstName: 'Ben', lastName: 'B' },
    });
  });
  afterAll(async () => {
    await owner.$disconnect();
    await app.$disconnect();
  });

  it('ohne gesetzten Mandanten sieht die Laufzeit-Rolle keine Zeilen', async () => {
    expect(await app.person.count()).toBe(0);
  });

  it('mit Mandant A sieht sie nur Daten von A, mit B nur von B', async () => {
    const asA = await withTenant(app, a, (tx) => tx.person.findMany());
    const asB = await withTenant(app, b, (tx) => tx.person.findMany());
    expect(asA.map((p) => p.firstName)).toEqual(['Anna']);
    expect(asB.map((p) => p.firstName)).toEqual(['Ben']);
  });

  it('Mandant A kann Zeilen von B weder lesen, ändern noch löschen', async () => {
    const victim = await owner.person.findFirstOrThrow({ where: { tenantId: b } });
    await withTenant(app, a, async (tx) => {
      expect(await tx.person.findUnique({ where: { id: victim.id } })).toBeNull();
      expect(
        (await tx.person.updateMany({ where: { id: victim.id }, data: { firstName: 'Hack' } }))
          .count,
      ).toBe(0);
      expect((await tx.person.deleteMany({ where: { id: victim.id } })).count).toBe(0);
    });
    expect((await owner.person.findUniqueOrThrow({ where: { id: victim.id } })).firstName).toBe(
      'Ben',
    );
  });

  it('Mandant A kann keine Zeile für B einfügen (WITH CHECK)', async () => {
    await expect(
      withTenant(app, a, (tx) =>
        tx.person.create({ data: { tenantId: b, kind: 'STUDENT', firstName: 'X', lastName: 'Y' } }),
      ),
    ).rejects.toThrow();
  });

  it('der Audit-Log ist nur anhängbar: INSERT ja, UPDATE und DELETE nein', async () => {
    const row = await withTenant(app, a, (tx) =>
      tx.auditLog.create({ data: { tenantId: a, action: 'test', entity: 'x' } }),
    );
    await expect(
      withTenant(app, a, (tx) =>
        tx.auditLog.update({ where: { id: row.id }, data: { action: 'edit' } }),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withTenant(app, a, (tx) => tx.auditLog.delete({ where: { id: row.id } })),
    ).rejects.toThrow(/permission denied/);
  });

  it('die Laufzeit-Rolle darf Mandanten lesen, aber nicht anlegen oder ändern', async () => {
    expect(await app.tenant.count()).toBeGreaterThanOrEqual(2);
    await expect(
      app.tenant.create({ data: { name: 'Neu', slug: `x-${Date.now()}` } }),
    ).rejects.toThrow(/permission denied/);
    await expect(app.tenant.update({ where: { id: a }, data: { name: 'Hack' } })).rejects.toThrow(
      /permission denied/,
    );
  });

  it('jede Tabelle mit tenantId hat Row-Level-Security und eine Policy', async () => {
    const rows = await owner.$queryRaw<{ table_name: string; rls: boolean; policies: bigint }[]>`
      SELECT c.table_name,
             (SELECT relrowsecurity FROM pg_class WHERE relname = c.table_name AND relnamespace = 'public'::regnamespace) AS rls,
             (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.table_name) AS policies
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.column_name = 'tenantId'`;
    expect(rows.length).toBeGreaterThan(30);
    expect(rows.filter((r) => !r.rls || Number(r.policies) < 1).map((r) => r.table_name)).toEqual(
      [],
    );
  });
});
