/**
 * Schaltet Pakete einer Schule frei (ADR 0012, nur Betrieb). Läuft als Eigentümer (DATABASE_URL). Aufruf:
 *   pnpm tenant:feature --slug demo --auto-planning on
 */
import { parseArgs } from 'node:util';
import { tenantSettingsSchema, type TenantSettings } from '@sp/shared';
import { createPrisma } from '../src/index';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname);
} catch {
  // keine .env: Variablen kommen aus der Umgebung
}

const { values } = parseArgs({
  options: { slug: { type: 'string' }, 'auto-planning': { type: 'string' } },
});

async function main() {
  const { slug } = values;
  const flag = values['auto-planning'];
  if (!slug || (flag !== 'on' && flag !== 'off'))
    throw new Error('Pflichtangaben: --slug <schule> --auto-planning on|off');
  const prisma = createPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Schule "${slug}" nicht gefunden`);
  const settings: TenantSettings = tenantSettingsSchema.parse(tenant.settings);
  settings.features.autoPlanning = flag === 'on';
  await prisma.tenant.update({ where: { id: tenant.id }, data: { settings } });
  await prisma.$disconnect();
  console.log(
    `${slug}: Stundenplan-Assistent ${flag === 'on' ? 'freigeschaltet' : 'abgeschaltet'}.`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
