import { createHash } from 'node:crypto';
import {
  Injectable,
  HttpException,
  HttpStatus,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SESSION_COOKIE } from '@sp/shared';
import type { FastifyRequest } from 'fastify';
import { RATE_LIMIT } from './decorators';

interface Limit {
  limit: number;
  windowSeconds: number;
}

/**
 * Grundlimit pro angemeldeter Sitzung für alle Routen ohne eigene Angabe (Spec Abschnitt 9: "pro IP und
 * Nutzer"). Großzügig genug für das Abarbeiten einer Offline-Warteschlange im Klassenbuch.
 */
export const SESSION_LIMITS: Record<'read' | 'write', Limit> = {
  read: { limit: 1200, windowSeconds: 300 },
  write: { limit: 300, windowSeconds: 300 },
};

/**
 * Ratenbegrenzung im Arbeitsspeicher je Prozess. Routen mit @RateLimit zählen pro IP und zusätzlich pro
 * Sitzung (wer viele IPs nutzt, bleibt trotzdem begrenzt); alle übrigen Routen pro Sitzung mit SESSION_LIMITS.
 * Bei mehreren API-Instanzen gilt das Limit pro Instanz; ein gemeinsamer Zähler käme über die Datenbank.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Tests schalten die Begrenzung ab, außer ein Test fordert sie ausdrücklich an (SP_TEST_RATELIMIT=on).
    // E2E-Läufe (viele Anmeldungen von einer IP) setzen SP_E2E_NO_RATELIMIT; nie in Betrieb setzen.
    if (
      (process.env.NODE_ENV === 'test' && process.env.SP_TEST_RATELIMIT !== 'on') ||
      process.env.SP_E2E_NO_RATELIMIT === 'true'
    )
      return true;
    const cfg = this.reflector.getAllAndOverride<Limit | undefined>(RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const route = `${req.method}|${req.routeOptions?.url ?? req.url}|${req.tenant?.id ?? ''}`;
    const session = this.sessionKey(req);
    if (cfg) {
      this.hit(`ip|${req.ip}|${route}`, cfg);
      if (session) this.hit(`s|${session}|${route}`, cfg);
    } else if (session) {
      const kind = req.method === 'GET' || req.method === 'HEAD' ? 'read' : 'write';
      this.hit(`s|${session}|${kind}`, SESSION_LIMITS[kind]);
    }
    return true;
  }

  /** Sitzung aus dem Cookie, nur als Hash im Speicher (kein Sitzungs-Token im Klartext). */
  private sessionKey(req: FastifyRequest): string | null {
    const raw = req.cookies?.[SESSION_COOKIE];
    return raw ? createHash('sha256').update(raw).digest('base64url').slice(0, 22) : null;
  }

  private hit(key: string, cfg: Limit): void {
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
    if (this.hits.size > 20_000) {
      for (const [k, v] of this.hits) if (!v.some((t) => t > now - 3600_000)) this.hits.delete(k);
    }
  }
}
