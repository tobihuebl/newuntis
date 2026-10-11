import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { NO_TENANT, NO_TRANSACTION } from '../../common/decorators';
import { requestScope } from '../../common/als';
import { PrismaService } from './prisma.service';

/** Führt jeden Handler in einer Transaktion mit `SET LOCAL app.tenant_id` aus. Fehler rollen alles zurück. */
@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(NO_TENANT, targets) ||
      this.reflector.getAllAndOverride<boolean>(NO_TRANSACTION, targets)
    ) {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const tenant = req.tenant;
    if (!tenant) return next.handle();
    return from(
      this.prisma.runAsTenant(tenant.id, (tx) =>
        requestScope.run({ tx }, () => lastValueFrom(next.handle(), { defaultValue: undefined })),
      ),
    );
  }
}
