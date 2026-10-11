import { execSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

/** Startet ein echtes Postgres 16, wendet alle Migrationen an und richtet die Rolle sp_app ein. */
export default async function setup() {
  const container = await new PostgreSqlContainer('postgres:16')
    .withDatabase('sptest')
    .withUsername('sp')
    .withPassword('sp')
    .start();
  const owner = container.getConnectionUri();
  const app = new URL(owner);
  app.username = 'sp_app';
  app.password = 'sp_app';
  process.env.TEST_DATABASE_URL = owner;
  process.env.TEST_DATABASE_APP_URL = app.toString();
  execSync('pnpm --filter @sp/db migrate:deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: owner, DATABASE_APP_URL: app.toString() },
  });
  return async () => {
    await container.stop();
  };
}
