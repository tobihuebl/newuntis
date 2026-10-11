/**
 * Setzt Login und Passwort der Laufzeit-Rolle `sp_app` aus DATABASE_APP_URL.
 * Läuft als Eigentümer (DATABASE_URL), nach `prisma migrate`.
 */
import { createPrisma } from '../src/index';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname);
} catch {
  // keine .env: Variablen kommen aus der Umgebung
}

async function main() {
  const appUrl = process.env.DATABASE_APP_URL;
  if (!appUrl) throw new Error('DATABASE_APP_URL fehlt');
  const { username, password } = new URL(appUrl);
  if (decodeURIComponent(username) !== 'sp_app')
    throw new Error('DATABASE_APP_URL muss die Rolle sp_app verwenden');
  const prisma = createPrisma();
  // Passwort als Literal nötig (DDL kennt keine Parameter); Quotes werden verdoppelt.
  const literal = decodeURIComponent(password).replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`ALTER ROLE sp_app WITH LOGIN PASSWORD '${literal}'`);
  await prisma.$disconnect();
  console.log('Rolle sp_app eingerichtet.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
