import { Controller, Get, Req, Res } from '@nestjs/common';
import { SESSION_COOKIE, type ServerEvent } from '@sp/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Authenticated, NoTransaction } from '../../common/decorators';
import { SessionService } from '../auth/session.service';
import { EventsService } from './events.service';

const HEARTBEAT_MS = 25_000;
/** Sitzung regelmäßig prüfen: nach Abmelden oder Ablauf endet der Stream. */
const RECHECK_MS = 60_000;

@Controller()
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly sessions: SessionService,
  ) {}

  /** Server-Sent Events: Hinweise mit Ids, der Client lädt die betroffenen Daten selbst neu. */
  @Authenticated()
  @NoTransaction()
  @Get('events')
  stream(@Req() req: FastifyRequest, @Res() reply: FastifyReply): void {
    const tenant = req.tenant!;
    const principal = req.principal!;
    const cookie = req.cookies?.[SESSION_COOKIE] ?? '';
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      // no-transform: keine Komprimierung durch Proxys, die den Stream puffern würde
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    raw.write('retry: 5000\n\n');

    const send = (id: string, event: ServerEvent) => {
      raw.write(`id: ${id}\nevent: ${event.type}\ndata: ${JSON.stringify({ ids: event.ids })}\n\n`);
    };
    const lastEventId = req.headers['last-event-id'];
    const unsubscribe = this.events.subscribe(
      { tenantId: tenant.id, personId: principal.personId, send },
      typeof lastEventId === 'string' ? lastEventId : undefined,
    );
    let checks = 0;
    const heartbeat = setInterval(() => {
      raw.write(': ping\n\n');
      checks += HEARTBEAT_MS;
      if (checks < RECHECK_MS) return;
      checks = 0;
      void this.sessions
        .resolve(tenant, cookie, { touch: false })
        .then((p) => {
          if (!p) raw.end();
        })
        .catch(() => undefined);
    }, HEARTBEAT_MS);
    const close = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    raw.on('close', close);
    raw.on('error', close);
  }
}
