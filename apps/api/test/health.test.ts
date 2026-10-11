import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthModule } from '../src/modules/health/health.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('Health', () => {
  let app: NestFastifyApplication;
  let dbUp = true;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HealthModule] })
      .useMocker((token) => {
        if (token === PrismaService) {
          return {
            client: {
              $queryRaw: async () => {
                if (!dbUp) throw new Error('down');
                return [{ '?column?': 1 }];
              },
            },
          };
        }
        return undefined;
      })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => app.close());

  it('GET /healthz liefert ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /readyz liefert 200 bei erreichbarer Datenbank, 503 sonst', async () => {
    expect((await app.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(200);
    dbUp = false;
    expect((await app.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(503);
  });
});
