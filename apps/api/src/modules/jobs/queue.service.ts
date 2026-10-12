import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Tx } from '@sp/db';
import { PgBoss, type QueuePolicy, type SendOptions } from 'pg-boss';
import { ENV, type Env } from '../../config/env';

interface Registration {
  name: string;
  handler: (data: unknown) => Promise<void>;
  policy: QueuePolicy;
  /** Cron (Europe/Vienna) für wiederkehrende Läufe. */
  cron?: string;
  /** Beim Start einmal ausführen (Versäumtes nachholen). */
  onStartup?: boolean;
  /** Gleichzeitig verarbeitete Jobs. */
  concurrency?: number;
}

/**
 * Hintergrund-Jobs über pg-boss (Queue in Postgres, Schema "pgboss", Rolle sp_app).
 * Fachmodule melden ihre Queues in `onModuleInit` an; gestartet wird nach dem Bootstrap.
 * In Tests aus (NODE_ENV=test), sonst abschaltbar über JOBS_ENABLED=false. Ohne laufende Queue liefert
 * `send` null, der Aufrufer entscheidet dann selbst (z. B. E-Mail direkt senden).
 */
@Injectable()
export class QueueService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly registrations: Registration[] = [];
  private boss: PgBoss | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  register<T>(
    name: string,
    handler: (data: T) => Promise<void>,
    options: Omit<Registration, 'name' | 'handler' | 'policy'> & { policy?: QueuePolicy } = {},
  ): void {
    this.registrations.push({
      name,
      handler: handler as (data: unknown) => Promise<void>,
      policy: options.policy ?? 'standard',
      ...options,
    });
  }

  get running(): boolean {
    return this.boss !== null;
  }

  async onApplicationBootstrap(): Promise<void> {
    const testOn = process.env.SP_TEST_JOBS === 'on'; // einzelne Tests mit echter Queue
    if ((process.env.NODE_ENV === 'test' && !testOn) || process.env.JOBS_ENABLED === 'false')
      return;
    const boss = new PgBoss({
      connectionString: this.env.DATABASE_APP_URL,
      schema: 'pgboss',
      // Das Schema legt die Migration an; sp_app darf (absichtlich) keine Schemas in der Datenbank anlegen.
      createSchema: false,
    });
    boss.on('error', (err: unknown) =>
      this.logger.error(`pg-boss: ${err instanceof Error ? err.message : 'unbekannt'}`),
    );
    await boss.start();
    for (const r of this.registrations) {
      await boss.createQueue(r.name, { policy: r.policy });
      await boss.work(
        r.name,
        {
          batchSize: 1,
          localConcurrency: r.concurrency ?? 1,
          ...(testOn ? { pollingIntervalSeconds: 0.5 } : {}),
        },
        async ([job]) => {
          if (job) await r.handler(job.data);
        },
      );
      if (r.cron) await boss.schedule(r.name, r.cron, null, { tz: this.env.DEFAULT_TIMEZONE });
      if (r.onStartup)
        await boss.send(r.name, {}, { singletonKey: 'startup', singletonSeconds: 300 });
    }
    this.boss = boss;
    this.logger.log(`Jobs gestartet (${this.registrations.map((r) => r.name).join(', ')})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop({ graceful: true });
  }

  /**
   * Job einstellen. Mit `tx` innerhalb der laufenden Transaktion: der Job existiert erst nach dem Commit
   * (abgebrochene Änderungen erzeugen keinen Versand).
   */
  async send(
    name: string,
    data: object,
    options: SendOptions = {},
    tx?: Tx,
  ): Promise<string | null> {
    if (!this.boss) return null;
    const db = tx
      ? {
          executeSql: async (text: string, values: unknown[] = []) => ({
            rows: await tx.$queryRawUnsafe<unknown[]>(text, ...values),
          }),
        }
      : undefined;
    return this.boss.send(name, data, { ...options, ...(db ? { db } : {}) });
  }
}
