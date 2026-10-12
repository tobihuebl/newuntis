import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  exportQuery,
  onboardingInput,
  PRIVACY_NOTICE_VERSION,
  privacyListQuery,
  privacyRequestInput,
  privacyRequestPatch,
  type PrivacyRequestItem,
} from '@sp/shared';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import { Authenticated, Can, RateLimit } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { fullName } from '../messages/recipients';
import { PrismaService } from '../prisma/prisma.service';
import { anonymizePerson, assertCanAnonymize } from './anonymize';
import { renderExportPdf } from './export-pdf';
import { PrivacyService } from './privacy.service';

async function sendExport(
  privacy: PrivacyService,
  prisma: PrismaService,
  tenantId: string,
  personId: string,
  format: 'json' | 'pdf',
  reply: FastifyReply,
) {
  const tx = prisma.tx;
  const data = await privacy.buildExport(tx, tenantId, personId);
  const tz = (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })).timezone;
  const stamp = data.generatedAt.slice(0, 10);
  void reply.header('cache-control', 'no-store');
  if (format === 'pdf') {
    void reply.header('content-type', 'application/pdf');
    void reply.header('content-disposition', `attachment; filename="datenauskunft-${stamp}.pdf"`);
    return reply.send(await renderExportPdf(data, tz));
  }
  void reply.header('content-disposition', `attachment; filename="datenauskunft-${stamp}.json"`);
  return data;
}

/** Selbstbedienung: eigene Daten exportieren, Einführung mit Datenschutzhinweis abschließen. */
@Controller('me')
export class MePrivacyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
    private readonly audit: AuditService,
  ) {}

  @Authenticated()
  @RateLimit(10, 3600)
  @Get('export')
  async export(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(exportQuery)) q: z.infer<typeof exportQuery>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'privacy.export.self',
      entity: 'person',
      entityId: me.personId,
      meta: { format: q.format },
    });
    return sendExport(this.privacy, this.prisma, tenantId, me.personId, q.format, reply);
  }

  /** Einführung nach dem ersten Login: Kenntnisnahme des Datenschutzhinweises mit Version und Zeitpunkt. */
  @Authenticated()
  @Post('onboarding')
  @HttpCode(204)
  async onboarding(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(onboardingInput)) body: z.infer<typeof onboardingInput>,
  ) {
    const tx = this.prisma.tx;
    await tx.consent.upsert({
      where: {
        personId_kind_version: {
          personId: me.personId,
          kind: 'privacy-notice',
          version: body.privacyNoticeVersion,
        },
      },
      create: {
        tenantId,
        personId: me.personId,
        kind: 'privacy-notice',
        version: body.privacyNoticeVersion,
      },
      update: {},
    });
    await tx.user.update({ where: { id: me.userId }, data: { onboardedAt: new Date() } });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'consent.accept',
      entity: 'consent',
      meta: { kind: 'privacy-notice', version: PRIVACY_NOTICE_VERSION },
    });
  }
}

/** Datenschutz-Anfragen (Spec Abschnitt 13, /admin/datenschutz): nur Administration. */
@Controller('admin/privacy')
export class PrivacyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
    private readonly audit: AuditService,
  ) {}

  @Can('privacy.manage')
  @Get('requests')
  async list(@Query(new ZodPipe(privacyListQuery)) q: z.infer<typeof privacyListQuery>) {
    const rows = await this.prisma.tx.privacyRequest.findMany({
      where: q.status ? { status: q.status } : {},
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            kind: true,
            anonymizedAt: true,
            restrictedAt: true,
          },
        },
      },
    });
    const actorIds = [...new Set(rows.flatMap((r) => [r.createdById, r.resolvedById ?? '']))];
    const actors = new Map(
      (
        await this.prisma.tx.person.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      ).map((p) => [p.id, fullName(p)]),
    );
    return {
      data: rows.map((r): PrivacyRequestItem => ({
        id: r.id,
        person: {
          id: r.person.id,
          name: fullName(r.person),
          kind: r.person.kind,
          anonymized: r.person.anonymizedAt !== null,
          restricted: r.person.restrictedAt !== null,
        },
        kind: r.kind,
        status: r.status,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        createdBy: actors.get(r.createdById) ?? null,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        resolvedBy: r.resolvedById ? (actors.get(r.resolvedById) ?? null) : null,
      })),
    };
  }

  @Can('privacy.manage')
  @Post('requests')
  async create(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(privacyRequestInput)) body: z.infer<typeof privacyRequestInput>,
  ) {
    const tx = this.prisma.tx;
    const p = await tx.person.findUnique({ where: { id: body.personId }, select: { id: true } });
    if (!p) throw new NotFoundException({ title: 'Person nicht gefunden' });
    const r = await tx.privacyRequest.create({
      data: {
        tenantId,
        personId: body.personId,
        kind: body.kind,
        note: body.note ?? null,
        createdById: me.personId,
      },
    });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'privacy.request.create',
      entity: 'privacyRequest',
      entityId: r.id,
      meta: { kind: body.kind },
    });
    return { id: r.id };
  }

  /** Abschluss: Löschung anonymisiert, Einschränkung setzt bzw. hebt den Vermerk an der Person. */
  @Can('privacy.manage')
  @Patch('requests/:id')
  async resolve(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(privacyRequestPatch)) body: z.infer<typeof privacyRequestPatch>,
  ) {
    const tx = this.prisma.tx;
    const r = await tx.privacyRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException({ title: 'Anfrage nicht gefunden' });
    if (r.status !== 'OPEN') throw new ConflictException({ title: 'Anfrage ist bereits erledigt' });
    if (body.status === 'DONE' && r.kind === 'ERASURE') {
      await assertCanAnonymize(tx, me.personId, r.personId);
      await anonymizePerson(tx, r.personId);
    }
    if (body.status === 'DONE' && r.kind === 'RESTRICTION')
      await tx.person.update({
        where: { id: r.personId },
        data: { restrictedAt: body.lift ? null : new Date() },
      });
    await tx.privacyRequest.update({
      where: { id },
      data: {
        status: body.status,
        note: body.note === undefined ? r.note : body.note,
        resolvedById: me.personId,
        resolvedAt: new Date(),
      },
    });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: `privacy.request.${body.status.toLowerCase()}`,
      entity: 'privacyRequest',
      entityId: id,
      meta: { kind: r.kind, lift: body.lift ?? false },
    });
    return { id };
  }

  @Can('privacy.manage')
  @Get('persons/:id/export')
  async export(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') id: string,
    @Query(new ZodPipe(exportQuery)) q: z.infer<typeof exportQuery>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const p = await this.prisma.tx.person.findUnique({ where: { id }, select: { id: true } });
    if (!p) throw new NotFoundException({ title: 'Person nicht gefunden' });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'privacy.export',
      entity: 'person',
      entityId: id,
      meta: { format: q.format },
    });
    return sendExport(this.privacy, this.prisma, tenantId, id, q.format, reply);
  }
}
