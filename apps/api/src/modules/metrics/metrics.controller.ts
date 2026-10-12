import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, Inject, NotFoundException, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { NoTenant } from '../../common/decorators';
import { ENV, type Env } from '../../config/env';
import { QueueService } from '../jobs/queue.service';
import { MetricsService } from './metrics.service';

/**
 * GET /metrics für Prometheus o. Ä. (nur mit METRICS_TOKEN als Bearer; ohne Token-Konfiguration 404).
 * Warnungen laut Runbook: Fehlerrate (5xx), Job-Rückstau, fehlgeschlagene Pushes.
 */
@NoTenant()
@Controller()
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly queue: QueueService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('metrics')
  async render(
    @Headers('authorization') auth: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const token = this.env.METRICS_TOKEN;
    const given = Buffer.from(auth?.replace(/^Bearer /, '') ?? '');
    const wanted = Buffer.from(token ?? '');
    if (!token || given.length !== wanted.length || !timingSafeEqual(given, wanted))
      throw new NotFoundException();
    const queues = await this.queue.stats();
    void reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return this.metrics.render([
      {
        name: 'sp_jobs_ready',
        help: 'Wartende Jobs je Queue (Rückstau)',
        values: queues.map((q) => [{ queue: q.name }, q.readyCount]),
      },
      {
        name: 'sp_jobs_active',
        help: 'Laufende Jobs je Queue',
        values: queues.map((q) => [{ queue: q.name }, q.activeCount]),
      },
      {
        name: 'sp_jobs_failed',
        help: 'Fehlgeschlagene Jobs je Queue (aufbewahrt)',
        values: queues.map((q) => [{ queue: q.name }, q.failedCount]),
      },
    ]);
  }
}
