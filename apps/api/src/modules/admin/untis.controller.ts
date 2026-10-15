import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { untisImportInput, type UntisPreview, type UntisResult } from '@sp/shared';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { Can, NoTransaction } from '../../common/decorators';
import { TenantId } from '../../common/params';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UntisService } from './untis.service';

/** Untis-Import (SD-06, ADR 0023): Vorschau prüft und schreibt nichts, Übernehmen legt einen neuen Entwurf an. */
@Controller('admin/import/untis')
export class UntisController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly untis: UntisService,
    private readonly audit: AuditService,
  ) {}

  @Can('timetable.edit')
  @Post()
  @HttpCode(200)
  async preview(
    @TenantId() tenantId: string,
    @Body(new ZodPipe(untisImportInput)) body: z.infer<typeof untisImportInput>,
  ): Promise<UntisPreview> {
    return (await this.untis.analyze(this.prisma.tx, tenantId, body)).preview;
  }

  @Can('timetable.edit')
  @NoTransaction()
  @Post('commit')
  async commit(
    @Req() req: FastifyRequest,
    @Body(new ZodPipe(untisImportInput)) body: z.infer<typeof untisImportInput>,
  ): Promise<UntisResult> {
    const tenantId = req.tenant!.id;
    const result = await this.prisma.runAsTenant(
      tenantId,
      (tx) => this.untis.apply(tx, tenantId, body),
      { timeoutMs: 120_000 },
    );
    await this.audit.record({
      tenantId,
      actorId: req.principal!.personId,
      action: 'import.untis',
      entity: 'timetableVersion',
      entityId: result.versionId,
      meta: { lessons: result.lessons, requirements: result.requirements, ...result.created },
    });
    return result;
  }
}
