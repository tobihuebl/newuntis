import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CSRF_HEADER, SESSION_COOKIE, type Action, type SessionStageName } from '@sp/shared';
import type { FastifyRequest } from 'fastify';
import { ALLOW_STAGES, AUTHENTICATED, CAN, NO_TENANT, PUBLIC } from '../../common/decorators';
import { AuditService } from '../audit/audit.service';
import { PolicyService } from '../policy/policy.service';
import { CryptoService } from './crypto.service';
import { SessionService } from './session.service';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Eine Instanz für alle Routen. Standard ist Verbot: Jede Route muss @Public(), @Authenticated() oder @Can(...) deklarieren.
 * Schreibende Anfragen: Origin-Prüfung für alle, CSRF-Token zusätzlich für angemeldete Sitzungen.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly policy: PolicyService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(NO_TENANT, targets)) return true;
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const tenant = req.tenant;
    if (!tenant) throw new ForbiddenException({ title: 'Kein Mandant' });

    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC, targets) === true;
    const isAuthenticated =
      this.reflector.getAllAndOverride<boolean>(AUTHENTICATED, targets) === true;
    const action = this.reflector.getAllAndOverride<Action | undefined>(CAN, targets);
    if (!isPublic && !isAuthenticated && !action) {
      throw new ForbiddenException({ title: 'Route ohne Rechte-Deklaration' }); // Standard: verboten
    }

    const unsafe = UNSAFE.has(req.method);
    if (unsafe) this.assertSameOrigin(req);

    const cookie = req.cookies?.[SESSION_COOKIE];
    const principal = cookie ? await this.sessions.resolve(tenant, cookie) : null;
    if (principal) req.principal = principal;
    if (isPublic) return true;
    if (!principal) throw new UnauthorizedException({ title: 'Nicht angemeldet' });

    const stages = this.reflector.getAllAndOverride<SessionStageName[] | undefined>(
      ALLOW_STAGES,
      targets,
    ) ?? ['ACTIVE'];
    if (!stages.includes(principal.stage)) {
      throw new ForbiddenException({
        title: 'Zweiter Faktor erforderlich',
        stage: principal.stage,
      });
    }
    if (unsafe) {
      const sent = req.headers[CSRF_HEADER];
      if (typeof sent !== 'string' || !this.crypto.safeEqual(sent, principal.csrfToken)) {
        throw new ForbiddenException({ title: 'CSRF-Token fehlt oder ist ungültig' });
      }
    }
    if (action && !(await this.policy.can(tenant.id, principal, action))) {
      await this.audit.record({
        tenantId: tenant.id,
        actorId: principal.personId,
        action: 'access.denied',
        entity: 'route',
        meta: { action },
      });
      throw new ForbiddenException({ title: 'Keine Berechtigung' });
    }
    return true;
  }

  /** Browser senden bei schreibenden Anfragen `Origin`; es muss zum Host der Anfrage passen. Clients ohne Origin (Tools) sind kein CSRF-Risiko. */
  private assertSameOrigin(req: FastifyRequest): void {
    const origin = req.headers.origin;
    const fetchSite = req.headers['sec-fetch-site'];
    if (typeof fetchSite === 'string' && fetchSite === 'cross-site')
      throw new ForbiddenException({ title: 'Anfrage von fremder Herkunft' });
    if (typeof origin === 'string') {
      let host: string;
      try {
        host = new URL(origin).host;
      } catch {
        throw new ForbiddenException({ title: 'Ungültiger Origin' });
      }
      // req.host berücksichtigt X-Forwarded-Host nur bei aktivem trustProxy
      if (host !== req.host)
        throw new ForbiddenException({ title: 'Anfrage von fremder Herkunft' });
    }
  }
}
