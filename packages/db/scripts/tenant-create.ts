/**
 * Legt eine Schule an: Mandant, Unterrichtsraster (Vorlage), Administrator und Einladungslink.
 * Läuft als Eigentümer (DATABASE_URL), umgeht also Row-Level-Security. Aufruf:
 *   pnpm tenant:create --name "Mittelschule X" --slug mittelschule-x --admin-email a@b.at --admin-first Anna --admin-last Muster
 */
import { createHash, randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { DEFAULT_PERIODS, emailSchema, tenantSettingsSchema } from '@sp/shared';
import { createPrisma } from '../src/index';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname);
} catch {
  // keine .env: Variablen kommen aus der Umgebung
}

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    slug: { type: 'string' },
    'admin-email': { type: 'string' },
    'admin-first': { type: 'string' },
    'admin-last': { type: 'string' },
  },
});

async function main() {
  const { name, slug } = values;
  const first = values['admin-first'];
  const last = values['admin-last'];
  if (!name || !slug || !first || !last || !values['admin-email']) {
    throw new Error('Pflichtangaben: --name --slug --admin-email --admin-first --admin-last');
  }
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug))
    throw new Error('--slug: nur a-z, 0-9 und Bindestrich');
  const email = emailSchema.parse(values['admin-email']);

  const prisma = createPrisma();
  const token = randomBytes(32).toString('base64url');
  const tenant = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.create({
      data: { name, slug, settings: tenantSettingsSchema.parse({}) },
    });
    await tx.period.createMany({ data: DEFAULT_PERIODS.map((p) => ({ tenantId: t.id, ...p })) });
    const person = await tx.person.create({
      data: { tenantId: t.id, kind: 'STAFF', firstName: first, lastName: last },
    });
    await tx.roleAssignment.create({
      data: { tenantId: t.id, personId: person.id, role: 'ADMIN' },
    });
    await tx.invitation.create({
      data: {
        tenantId: t.id,
        personId: person.id,
        email,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 14 * 86_400_000),
      },
    });
    return t;
  });
  await prisma.$disconnect();

  const app = new URL(process.env.APP_URL ?? 'http://localhost:3000');
  const base = process.env.BASE_DOMAIN ?? 'localhost';
  console.log(`Schule "${tenant.name}" angelegt (Subdomain: ${slug}.${base}).`);
  console.log(`Einladungslink für den Administrator (14 Tage gültig):`);
  console.log(
    `${app.protocol}//${slug}.${base}${app.port ? `:${app.port}` : ''}/einladung?token=${token}`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
