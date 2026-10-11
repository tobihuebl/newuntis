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
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
