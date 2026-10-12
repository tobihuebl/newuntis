/**
 * E2E-Umgebung: eigenes Postgres (Testcontainers), Migrationen und Demo-Seed, API und Web als Produktions-Build
 * auf eigenen Ports. Ein laufendes `pnpm dev` (Ports 3000/4000, Verzeichnis .next) bleibt unberührt.
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';

export const WEB_PORT = 3100;
export const API_PORT = 4100;
// Playwright lädt die Datei als CommonJS: __dirname statt import.meta
const root = `${resolve(__dirname, '../../..')}/`;
export const STATE_FILE = resolve(__dirname, '.state.json');

async function waitFor(url: string, ms = 120_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // startet noch
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} nicht erreichbar`);
}

export default async function globalSetup() {
  const container = await new PostgreSqlContainer('postgres:16')
    .withDatabase('spe2e')
    .withUsername('sp')
    .withPassword('sp')
    .start();
  const owner = container.getConnectionUri();
  const appUrl = new URL(owner);
  appUrl.username = 'sp_app';
  appUrl.password = 'sp_app';

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    DATABASE_URL: owner,
    DATABASE_APP_URL: appUrl.toString(),
    SESSION_SECRET: 'e2e-session-secret-with-at-least-32-chars',
    APP_URL: `http://localhost:${WEB_PORT}`,
    API_URL: `http://localhost:${API_PORT}`,
    API_HOST: '127.0.0.1',
    SMTP_URL: 'smtp://localhost:1025',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_BUCKET: 'e2e',
    S3_ACCESS_KEY: 'e2e',
    S3_SECRET_KEY: 'e2e-secret',
    DEFAULT_TIMEZONE: 'Europe/Vienna',
    BASE_DOMAIN: 'localhost',
    ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    JOBS_ENABLED: 'false',
    NEXT_DIST_DIR: '.next-e2e',
    NEXT_TELEMETRY_DISABLED: '1',
  };
  const run = (cmd: string) => execSync(cmd, { cwd: root, env, stdio: 'inherit' });
  run('pnpm --filter @sp/shared build');
  run('pnpm --filter @sp/db build');
  run('pnpm --filter @sp/db migrate:deploy');
  run('pnpm --filter @sp/db seed');
  // Eigenes Ausgabeverzeichnis, damit ein laufendes `nest start --watch` (dist/) nicht gestört wird
  run('pnpm --filter @sp/api exec tsc -p tsconfig.json --outDir dist-e2e');
  if (!process.env.E2E_SKIP_WEB_BUILD) run('pnpm --filter @sp/web exec next build');

  // Demo-Konten für die Tests: Klassenvorstand der 3A (offene Klassenbuch-Einträge), Administration, Schüler:in 3A
  const db = new pg.Client({ connectionString: owner });
  await db.connect();
  const one = async (sql: string) => (await db.query<{ email: string }>(sql)).rows[0]!.email;
  const teacherEmail = await one(
    `SELECT u.email FROM "User" u
       JOIN "RoleAssignment" r ON r."personId" = u."personId" AND r.role = 'HOMEROOM'
       JOIN "SchoolClass" c ON c.id = r."classId" AND c.name = '3A' LIMIT 1`,
  );
  const adminEmail = await one(
    `SELECT u.email FROM "User" u JOIN "RoleAssignment" r ON r."personId" = u."personId" AND r.role = 'ADMIN' LIMIT 1`,
  );
  const studentEmail = await one(
    `SELECT u.email FROM "User" u
       JOIN "Enrollment" e ON e."studentId" = u."personId"
       JOIN "SchoolClass" c ON c.id = e."classId" AND c.name = '3A' ORDER BY u.email LIMIT 1`,
  );
  await db.end();

  // Eigene Prozessgruppen, damit beim Aufräumen auch Kindprozesse enden
  const procs: ChildProcess[] = [
    // Anfrage-Logs der API nur mit E2E_VERBOSE=1, Fehler immer
    spawn('node', ['apps/api/dist-e2e/main.js'], {
      cwd: root,
      env,
      stdio: ['ignore', process.env.E2E_VERBOSE ? 'inherit' : 'ignore', 'inherit'],
      detached: true,
    }),
    spawn('node_modules/.bin/next', ['start', '-p', String(WEB_PORT)], {
      cwd: `${root}apps/web`,
      env,
      stdio: ['ignore', process.env.E2E_VERBOSE ? 'inherit' : 'ignore', 'inherit'],
      detached: true,
    }),
  ];
  await waitFor(`http://127.0.0.1:${API_PORT}/healthz`);
  await waitFor(`http://127.0.0.1:${WEB_PORT}/offline`);
  rmSync(resolve(__dirname, '.state-totp.json'), { force: true }); // frische Datenbank: 2FA neu einrichten
  writeFileSync(
    STATE_FILE,
    JSON.stringify({ teacherEmail, adminEmail, studentEmail, databaseUrl: owner }),
  );

  return async () => {
    for (const p of procs) {
      try {
        if (p.pid) process.kill(-p.pid, 'SIGTERM');
      } catch {
        // schon beendet
      }
    }
    await container.stop();
  };
}
