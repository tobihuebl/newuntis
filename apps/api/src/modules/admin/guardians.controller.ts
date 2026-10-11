import { randomInt } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  guardianCodeRedeemAuthed,
  guardianCodeRedeemPublic,
  guardianCodesInput,
  guardianLinkInput,
} from '@sp/shared';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { Authenticated, Can, NoTransaction, Public, RateLimit } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from '../auth/crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { bad, toDate, today } from './util';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // ohne verwechselbare Zeichen (I, L, O, 0, 1)
const formatCode = (raw: string) => `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;

/** Eltern-Kind-Verknüpfung (SD-04): direkt durch die Administration oder per Einladungscode aus dem Elternbrief. */
@Controller()
export class GuardiansController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
  ) {}

  @Can('masterdata.write')
  @Post('admin/guardian-links')
  async createLink(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Body(new ZodPipe(guardianLinkInput)) body: z.infer<typeof guardianLinkInput>,
  ) {
    const tx = this.prisma.tx;
    const [guardian, student] = await Promise.all([
      tx.person.findUnique({
        where: { id: body.guardianId },
        select: { kind: true, anonymizedAt: true },
      }),
      tx.person.findUnique({
        where: { id: body.studentId },
        select: { kind: true, anonymizedAt: true },
      }),
    ]);
    if (!guardian || guardian.kind !== 'GUARDIAN' || guardian.anonymizedAt)
      bad('Der Elternteil muss eine Person der Art Eltern sein');
    if (!student || student.kind !== 'STUDENT' || student.anonymizedAt)
      bad('Das Kind muss eine Schüler:in sein');
    const validFrom = body.validFrom ? toDate(body.validFrom) : today();
    if (body.validTo && toDate(body.validTo) < validFrom) bad('Gültig bis liegt vor Gültig ab');
    const active = await tx.guardianLink.findFirst({
      where: {
        guardianId: body.guardianId,
        studentId: body.studentId,
        OR: [{ validTo: null }, { validTo: { gte: today() } }],
      },
    });
    if (active) bad('Die Verknüpfung besteht bereits');
    const row = await tx.guardianLink.create({
      data: {
        tenantId,
        guardianId: body.guardianId,
        studentId: body.studentId,
        canExcuse: body.canExcuse,
        validFrom,
        validTo: body.validTo ? toDate(body.validTo) : null,
      },
    });
    await this.audit.record({
      tenantId,
      actorId: actor.personId,
      action: 'guardianLink.create',
      entity: 'guardianLink',
      entityId: row.id,
    });
    return { id: row.id };
  }

  /** Widerruf: die Verknüpfung endet sofort (gestern), der Datensatz bleibt für die Nachvollziehbarkeit. */
  @Can('masterdata.write')
  @Delete('admin/guardian-links/:id')
  @HttpCode(204)
  async revoke(@TenantId() tenantId: string, @Actor() actor: Principal, @Param('id') id: string) {
    const yesterday = new Date(today().getTime() - 86_400_000);
    const res = await this.prisma.tx.guardianLink.updateMany({
      where: { id, OR: [{ validTo: null }, { validTo: { gt: yesterday } }] },
      data: { validTo: yesterday },
    });
    if (res.count === 0)
      throw new NotFoundException({ title: 'Aktive Verknüpfung nicht gefunden' });
    await this.audit.record({
      tenantId,
      actorId: actor.personId,
      action: 'guardianLink.revoke',
      entity: 'guardianLink',
      entityId: id,
    });
  }

  /** Erzeugt Codes für den Elternbrief. Der Klartext wird nur in dieser Antwort ausgegeben. */
  @Can('masterdata.write')
  @Post('admin/guardian-codes')
  async createCodes(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Body(new ZodPipe(guardianCodesInput)) body: z.infer<typeof guardianCodesInput>,
  ) {
    const tx = this.prisma.tx;
    const now = today();
    const students = await tx.person.findMany({
      where: { id: { in: body.studentIds }, kind: 'STUDENT', anonymizedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        enrollments: {
          where: { OR: [{ toDate: null }, { toDate: { gte: now } }] },
          select: { class: { select: { name: true } } },
        },
      },
    });
    if (students.length !== new Set(body.studentIds).size)
      bad('Mindestens eine Person ist keine (aktive) Schüler:in');
    const expiresAt = new Date(Date.now() + body.validDays * 86_400_000);
    const out: {
      studentId: string;
      firstName: string;
      lastName: string;
      className: string | null;
      code: string;
      expiresAt: string;
    }[] = [];
    for (const s of students) {
      const raw = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
      await tx.guardianCode.create({
        data: {
          tenantId,
          studentId: s.id,
          codeHash: this.crypto.sha256(raw),
          expiresAt,
          createdById: actor.personId,
        },
      });
      out.push({
        studentId: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        className: s.enrollments[0]?.class.name ?? null,
        code: formatCode(raw),
        expiresAt: expiresAt.toISOString(),
      });
    }
    await this.audit.record({
      tenantId,
      actorId: actor.personId,
      action: 'guardianCode.create',
      entity: 'guardianCode',
      meta: { count: out.length },
    });
    return { data: out };
  }

  /** Eltern ohne Konto: Code einlösen, Konto anlegen und mit dem Kind verknüpfen (ohne vorherige Anmeldung). */
  @Public()
  @NoTransaction()
  @RateLimit(10, 60)
  @Post('auth/guardian-code/redeem')
  @HttpCode(204)
  async redeemPublic(
    @Req() req: FastifyRequest,
    @Body(new ZodPipe(guardianCodeRedeemPublic)) body: z.infer<typeof guardianCodeRedeemPublic>,
  ) {
    const tenantId = req.tenant!.id;
    const hash = await this.crypto.hashPassword(body.password);
    const result = await this.prisma.runAsTenant(tenantId, async (tx) => {
      const code = await this.findUsableCode(tx, body.code);
      if (!code) return { ok: false as const, error: 'Der Code ist ungültig oder abgelaufen' };
      if (
        await tx.user.findUnique({
          where: { tenantId_email: { tenantId, email: body.email } },
          select: { id: true },
        })
      ) {
        return {
          error:
            'Für diese E-Mail-Adresse gibt es schon ein Konto. Bitte anmelden und den Code im Profil einlösen.',
        } as const;
      }
      const person = await tx.person.create({
        data: {
          tenantId,
          kind: 'GUARDIAN',
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
        },
      });
      await tx.user.create({
        data: { tenantId, personId: person.id, email: body.email, passwordHash: hash },
      });
      await tx.roleAssignment.create({ data: { tenantId, personId: person.id, role: 'GUARDIAN' } });
      await tx.guardianLink.create({
        data: { tenantId, guardianId: person.id, studentId: code.studentId, validFrom: today() },
      });
      await tx.guardianCode.update({ where: { id: code.id }, data: { uses: { increment: 1 } } });
      return { ok: true as const, personId: person.id };
    });
    if (!result.ok) bad(result.error);
    await this.audit.record({
      tenantId,
      actorId: result.personId,
      action: 'guardianCode.redeem',
      entity: 'person',
      entityId: result.personId,
    });
  }

  /** Angemeldete Eltern fügen mit einem weiteren Code ein weiteres Kind hinzu (PL-04). */
  @Authenticated()
  @NoTransaction()
  @RateLimit(10, 60)
  @Post('me/guardian-codes/redeem')
  @HttpCode(204)
  async redeemAuthed(
    @Req() req: FastifyRequest,
    @Body(new ZodPipe(guardianCodeRedeemAuthed)) body: z.infer<typeof guardianCodeRedeemAuthed>,
  ) {
    const tenantId = req.tenant!.id;
    const me = req.principal!;
    const result = await this.prisma.runAsTenant(tenantId, async (tx) => {
      const code = await this.findUsableCode(tx, body.code);
      if (!code) return 'Der Code ist ungültig oder abgelaufen';
      const exists = await tx.guardianLink.findFirst({
        where: {
          guardianId: me.personId,
          studentId: code.studentId,
          OR: [{ validTo: null }, { validTo: { gte: today() } }],
        },
      });
      if (exists) return 'Dieses Kind ist schon verknüpft';
      if (!me.roles.some((r) => r.role === 'GUARDIAN'))
        await tx.roleAssignment.create({
          data: { tenantId, personId: me.personId, role: 'GUARDIAN' },
        });
      await tx.guardianLink.create({
        data: { tenantId, guardianId: me.personId, studentId: code.studentId, validFrom: today() },
      });
      await tx.guardianCode.update({ where: { id: code.id }, data: { uses: { increment: 1 } } });
      return null;
    });
    if (result) bad(result);
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'guardianCode.redeem',
      entity: 'person',
      entityId: me.personId,
    });
  }

  private async findUsableCode(tx: PrismaService['tx'], normalized: string) {
    const code = await tx.guardianCode.findUnique({
      where: { codeHash: this.crypto.sha256(normalized) },
    });
    if (!code || code.expiresAt < new Date() || code.uses >= code.maxUses) return null;
    return code;
  }
}
