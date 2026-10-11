import { defineConfig } from 'prisma/config';

// .env liegt im Repository-Stamm (Node >= 22: process.loadEnvFile). In CI kommt DATABASE_URL aus der Umgebung.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url).pathname);
} catch {
  // keine .env vorhanden: Variablen kommen aus der Umgebung
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
});
