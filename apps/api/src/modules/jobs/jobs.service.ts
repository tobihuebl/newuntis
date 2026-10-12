import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { ENV, type Env } from '../../config/env';
import { OccurrencesService } from '../timetable/occurrences.service';

export const QUEUE_OCCURRENCES = 'generate-occurrences';

/**
 * Hintergrund-Jobs über pg-boss (Queue in Postgres, Schema "pgboss", Rolle sp_app).
 * In Tests aus (NODE_ENV=test), sonst abschaltbar über JOBS_ENABLED=false (z. B. für reine API-Repliken).
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private boss: PgBoss | null = null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly occurrences: OccurrencesService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test' || process.env.JOBS_ENABLED === 'false') return;
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
    await boss.createQueue(QUEUE_OCCURRENCES);
    await boss.work(QUEUE_OCCURRENCES, async () => {
      await this.occurrences.generateAllTenants();
    });
    // nächtlich um 02:15 Wiener Zeit, dazu einmal beim Start (fehlende Tage nachholen)
    await boss.schedule(QUEUE_OCCURRENCES, '15 2 * * *', null, { tz: this.env.DEFAULT_TIMEZONE });
    await boss.send(QUEUE_OCCURRENCES, {}, { singletonKey: 'startup', singletonSeconds: 300 });
    this.boss = boss;
    this.logger.log('Jobs gestartet');
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop({ graceful: true });
  }
}
