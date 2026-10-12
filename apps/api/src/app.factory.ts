import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { MetricsService } from './modules/metrics/metrics.service';

export function createAdapter(): FastifyAdapter {
  return new FastifyAdapter({
    logger: process.env.NODE_ENV !== 'test',
    // Next.js bzw. Caddy stehen davor und setzen X-Forwarded-*. Die API-Ports sind nicht öffentlich erreichbar.
    trustProxy: true,
    // CSV-Import bis 5 MB (importInput.csv), dazu etwas Spielraum für JSON
    bodyLimit: 6 * 1024 * 1024,
  });
}

/** Gemeinsame Einrichtung für Betrieb und Tests. */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  });
  // Uploads (Fotos, PDF) als Rohdaten; der Typ wird später am Inhalt geprüft, nicht am Header
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(
      [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif',
        'application/pdf',
        'application/octet-stream',
      ],
      { parseAs: 'buffer', bodyLimit: 5 * 1024 * 1024 },
      (_req, body, done) => done(null, body),
    );
  // Fehlerrate für die Überwachung: nur Methode und Statusklasse, keine Pfade (Ids, Personenbezug)
  const metrics = app.get(MetricsService);
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onResponse', (req, reply, done) => {
      metrics.inc('sp_http_requests_total', 'HTTP-Anfragen je Statusklasse', {
        method: req.method,
        status: `${Math.floor(reply.statusCode / 100)}xx`,
      });
      done();
    });
  app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz', 'metrics'] });
  app.enableShutdownHooks();
}

export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createAdapter());
  await configureApp(app);
  return app;
}
