import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

export function createAdapter(): FastifyAdapter {
  return new FastifyAdapter({
    logger: process.env.NODE_ENV !== 'test',
    // Next.js bzw. Caddy stehen davor und setzen X-Forwarded-*. Die API-Ports sind nicht öffentlich erreichbar.
    trustProxy: true,
  });
}

/** Gemeinsame Einrichtung für Betrieb und Tests. */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  });
  app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
  app.enableShutdownHooks();
}

export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createAdapter());
  await configureApp(app);
  return app;
}
