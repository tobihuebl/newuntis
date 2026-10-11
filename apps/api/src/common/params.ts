import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Principal } from './request';

/** Mandant der Anfrage (aus der Subdomain, vom TenantGuard gesetzt). */
export const TenantId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<FastifyRequest>().tenant!.id;
});

/** Angemeldete Person samt Sitzung. */
export const Actor = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  return ctx.switchToHttp().getRequest<FastifyRequest>().principal!;
});
