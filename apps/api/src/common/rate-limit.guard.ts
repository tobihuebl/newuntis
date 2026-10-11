import {
  Injectable,
  HttpException,
  HttpStatus,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { RATE_LIMIT } from './decorators';

interface Limit {
  limit: number;
  windowSeconds: number;
}

/**
 * Ratenbegrenzung im Arbeitsspeicher je Prozess (Schlüssel: IP, Route, Mandant).
 * Bei mehreren API-Instanzen gilt das Limit pro Instanz; ein gemeinsamer Zähler käme über die Datenbank.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const cfg = this.reflector.getAllAndOverride<Limit | undefined>(RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Tests schalten die Begrenzung ab, außer ein Test fordert sie ausdrücklich an (SP_TEST_RATELIMIT=on).
    if (!cfg || (process.env.NODE_ENV === 'test' && process.env.SP_TEST_RATELIMIT !== 'on'))
      return true;
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const key = `${req.ip}|${req.method}|${req.routeOptions?.url ?? req.url}|${req.tenant?.id ?? ''}`;
    const now = Date.now();
    const since = now - cfg.windowSeconds * 1000;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= cfg.limit) {
      this.hits.set(key, recent);
      throw new HttpException(
        { title: 'Zu viele Anfragen', retryAfterSeconds: cfg.windowSeconds },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (!v.some((t) => t > since)) this.hits.delete(k);
    }
    return true;
  }
}
