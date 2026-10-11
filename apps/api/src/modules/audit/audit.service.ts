import { Injectable } from '@nestjs/common';
import type { Prisma } from '@sp/db';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEvent {
  tenantId: string;
  actorId?: string | null;
  action: string; // z. B. "auth.login.failure"
  entity: string;
  entityId?: string | null;
  meta?: Prisma.InputJsonValue;
}

/** Nur anhängen: Die Rolle sp_app hat auf AuditLog kein UPDATE und kein DELETE. Keine Klartext-Personendaten in `meta`. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** In eigener Transaktion, damit der Eintrag auch bei fehlgeschlagener Anfrage bestehen bleibt. */
  async record(event: AuditEvent): Promise<void> {
    await this.prisma.runAsTenant(event.tenantId, (tx) =>
      tx.auditLog.create({
        data: {
          tenantId: event.tenantId,
          actorId: event.actorId ?? null,
          action: event.action,
          entity: event.entity,
          entityId: event.entityId ?? null,
          ...(event.meta !== undefined ? { meta: event.meta } : {}),
        },
      }),
    );
  }
}
