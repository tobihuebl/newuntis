import {
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { NO_TENANT } from '../../common/decorators';
import { TenantService } from './tenant.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly tenants: TenantService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(NO_TENANT, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    // req.hostname berücksichtigt X-Forwarded-Host nur, wenn trustProxy aktiv ist (Next.js/Caddy davor).
    const tenant = await this.tenants.resolve(req.hostname);
    if (!tenant) throw new NotFoundException({ title: 'Schule nicht gefunden' });
    req.tenant = tenant;
    return true;
  }
}
