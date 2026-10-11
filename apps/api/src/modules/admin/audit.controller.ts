import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Can } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

const auditQuery = z.object({
  action: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).optional(),
});

@Controller('admin')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /** Audit-Log lesen (Direktion und Administration). Neueste Einträge zuerst, Cursor-Paginierung. */
  @Can('audit.read')
  @Get('audit')
  async audit(@Query(new ZodPipe(auditQuery)) q: z.infer<typeof auditQuery>) {
    const rows = await this.prisma.tx.auditLog.findMany({
      where: q.action ? { action: { startsWith: q.action } } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    const actors = await this.prisma.tx.person.findMany({
      where: { id: { in: [...new Set(page.flatMap((r) => (r.actorId ? [r.actorId] : [])))] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const name = new Map(actors.map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()]));
    return {
      data: page.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        actor: r.actorId ? (name.get(r.actorId) ?? null) : null,
        meta: r.meta,
      })),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
    };
  }
}
