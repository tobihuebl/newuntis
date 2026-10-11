import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseServerEnv } from '@sp/shared';
import { AppModule } from './app.module';

try {
  process.loadEnvFile(new URL('../../../.env', `file://${__dirname}/`).pathname);
} catch {
  // keine .env: Variablen kommen aus der Umgebung
}

async function bootstrap() {
  const env = parseServerEnv(process.env);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );
  app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
  app.enableShutdownHooks();
  const port = Number(new URL(env.API_URL).port || 4000);
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
