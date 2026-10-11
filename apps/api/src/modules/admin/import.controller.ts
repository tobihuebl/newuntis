import { Body, Controller, Post, Query, Req } from '@nestjs/common';
import { importInput } from '@sp/shared';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { Can, NoTransaction } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImportService, loadContext } from './import.service';
import { InvitationsService } from './invitations.service';

@Controller('admin')
export class ImportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imports: ImportService,
    private readonly invitations: InvitationsService,
    private readonly audit: AuditService,
  ) {}

  /** Vorschau: prüft die Datei, schreibt nichts. */
  @Can('masterdata.write')
  @Post('import/persons')
  async preview(
    @Query('dryRun') dryRun: string | undefined,
    @Body(new ZodPipe(importInput)) body: z.infer<typeof importInput>,
  ) {
    void dryRun; // die Route ist immer eine Vorschau; Übernehmen läuft über /commit
    return this.imports.preview(body, await loadContext(this.prisma.tx));
  }

  /** Übernimmt die Datei in einer Transaktion (alles oder nichts), danach optional Einladungen. */
  @Can('masterdata.write')
  @NoTransaction()
  @Post('import/persons/commit')
  async commit(
    @Req() req: FastifyRequest,
    @Body(new ZodPipe(importInput)) body: z.infer<typeof importInput>,
  ) {
    const tenant = req.tenant!;
    const actor = req.principal!;
    const { preview, result } = await this.prisma.runAsTenant(
      tenant.id,
      (tx) => this.imports.apply(tx, tenant.id, body),
      { timeoutMs: 120_000 },
    );
    await this.audit.record({
      tenantId: tenant.id,
      actorId: actor.personId,
      action: 'import.persons',
      entity: 'person',
      meta: {
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        classesCreated: result.classesCreated,
        linksCreated: result.linksCreated,
      },
    });
    const invitations = body.sendInvitations
      ? await this.invitations.invite(tenant, actor.personId, result.invitablePersonIds)
      : null;
    return {
      summary: preview.summary,
      result: {
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        classesCreated: result.classesCreated,
        linksCreated: result.linksCreated,
      },
      invitations,
    };
  }
}
