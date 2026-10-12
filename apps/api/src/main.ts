import 'reflect-metadata';
import { parseServerEnv } from '@sp/shared';
import { createApp } from './app.factory';

try {
  process.loadEnvFile(new URL('../../../.env', `file://${__dirname}/`).pathname);
} catch {
  // keine .env: Variablen kommen aus der Umgebung
}

async function bootstrap() {
  const env = parseServerEnv(process.env);
  const app = await createApp();
  const port = Number(new URL(env.API_URL).port || 4000);
  // Standard nur lokal: die API vertraut X-Forwarded-Host und darf nur hinter Next.js/Caddy erreichbar sein.
  // In Containern API_HOST=0.0.0.0 setzen (Netz nur zwischen Proxy und API).
  await app.listen(port, process.env.API_HOST ?? '127.0.0.1');
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
