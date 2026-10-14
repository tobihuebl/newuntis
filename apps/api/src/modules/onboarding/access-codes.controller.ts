import { randomInt } from 'node:crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ACCESS_CODE_VALID_DAYS,
  accessCodeCheck,
  accessCodeRedeem,
  accessCodesInput,
  can,
  usernameBase,
  type AccessCodeInfo,
  type AccessLetter,
  type ClassAccessView,
} from '@sp/shared';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { Can, NoTransaction, Public, RateLimit } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { bad, today } from '../admin/util';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from '../auth/crypto.service';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';

type Tx = PrismaService['tx'];

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // ohne verwechselbare Zeichen (I, L, O, 0, 1)
const formatCode = (raw: string) => `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
const newCode = () =>
  Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const INVALID = 'Der Code ist ungültig oder abgelaufen';

/**
 * Beitritt von Schüler:innen (Onboarding, ADR 0020): Der Klassenvorstand stellt Zugangsbriefe mit persönlichem
 * Code und QR-Code aus (auf Wunsch mit Eltern-Code). Einlösen setzt das Passwort; die Anmeldung geht mit dem
 * Benutzernamen. Ein neuer Code ersetzt offene Codes und dient auch zum Zurücksetzen des Passworts.
 */
@Controller()
export class AccessCodesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  private async assertClass(tenantId: string, me: Principal, classId: string) {
    const user = await this.policy.loadUser(tenantId, me);
    if (!can(user, 'access.issue', { classId }))
      throw new ForbiddenException({ title: 'Nur für den Klassenvorstand dieser Klasse' });
    const cls = await this.prisma.tx.schoolClass.findUnique({
      where: { id: classId },
      select: { id: true, name: true },
    });
    if (!cls) throw new NotFoundException({ title: 'Klasse nicht gefunden' });
    return cls;
  }

  private current() {
    const d = today();
    return { fromDate: { lte: d }, OR: [{ toDate: null }, { toDate: { gte: d } }] };
  }

  /** Schüler:innen der Klasse mit Stand des Zugangs (aktiv, Code ausgestellt, kein Zugang). */
  @Can('access.issue')
  @Get('classes/:id/access')
  async view(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') classId: string,
  ): Promise<ClassAccessView> {
    const cls = await this.assertClass(tenantId, me, classId);
    const d = today();
    const enr = await this.prisma.tx.enrollment.findMany({
      where: { classId, ...this.current(), student: { anonymizedAt: null } },
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            user: { select: { passwordHash: true, username: true } },
            accessCodes: {
              where: { usedAt: null, expiresAt: { gt: new Date() } },
              orderBy: { expiresAt: 'desc' },
              take: 1,
              select: { expiresAt: true },
            },
            studentLinks: {
              where: { validFrom: { lte: d }, OR: [{ validTo: null }, { validTo: { gte: d } }] },
              select: { id: true },
            },
          },
        },
      },
    });
    const rows = enr
      .map(({ student: s }) => ({
        studentId: s.id,
        name: `${s.lastName} ${s.firstName}`,
        status: s.user?.passwordHash
          ? ('active' as const)
          : s.accessCodes.length
            ? ('issued' as const)
            : ('none' as const),
        username: s.user?.username ?? null,
        expiresAt: s.user?.passwordHash
          ? null
          : (s.accessCodes[0]?.expiresAt.toISOString() ?? null),
        guardians: s.studentLinks.length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return { classId: cls.id, className: cls.name, rows };
  }

  /** Zugangsbriefe ausstellen. Klartext-Codes stehen nur in dieser Antwort. */
  @Can('access.issue')
  @Post('classes/:id/access-codes')
  async issue(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') classId: string,
    @Body(new ZodPipe(accessCodesInput)) body: z.infer<typeof accessCodesInput>,
  ): Promise<{ data: AccessLetter[] }> {
    const cls = await this.assertClass(tenantId, me, classId);
    const tx = this.prisma.tx;
    const ids = [...new Set(body.studentIds)];
    const students = await tx.person.findMany({
      where: {
        id: { in: ids },
        kind: 'STUDENT',
        anonymizedAt: null,
        enrollments: { some: { classId, ...this.current() } },
      },
      select: { id: true, firstName: true, lastName: true, user: true },
    });
    if (students.length !== ids.length) bad('Mindestens eine Person ist nicht in dieser Klasse');
    const expiresAt = new Date(Date.now() + ACCESS_CODE_VALID_DAYS * 86_400_000);
    const out: AccessLetter[] = [];
    for (const s of students) {
      const username = s.user?.username ?? (await this.freeUsername(tx, s.firstName, s.lastName));
      if (!s.user) {
        await tx.user.create({ data: { tenantId, personId: s.id, username } });
      } else if (!s.user.username) {
        await tx.user.update({ where: { id: s.user.id }, data: { username } });
      }
      // Ohne Rolle gäbe es nach der Anmeldung nichts zu sehen (z. B. Personen aus älteren Importen)
      if (!(await tx.roleAssignment.count({ where: { personId: s.id, role: 'STUDENT' } })))
        await tx.roleAssignment.create({ data: { tenantId, personId: s.id, role: 'STUDENT' } });
      await tx.accessCode.deleteMany({ where: { personId: s.id, usedAt: null } });
      const raw = newCode();
      await tx.accessCode.create({
        data: {
          tenantId,
          personId: s.id,
          codeHash: this.crypto.sha256(raw),
          expiresAt,
          createdById: me.personId,
        },
      });
      let guardianCode: string | null = null;
      if (body.withGuardianCodes) {
        const g = newCode();
        await tx.guardianCode.create({
          data: {
            tenantId,
            studentId: s.id,
            codeHash: this.crypto.sha256(g),
            expiresAt,
            createdById: me.personId,
          },
        });
        guardianCode = formatCode(g);
      }
      out.push({
        personId: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        className: cls.name,
        username,
        code: formatCode(raw),
        guardianCode,
        expiresAt: expiresAt.toISOString(),
      });
    }
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'accessCode.create',
      entity: 'schoolClass',
      entityId: classId,
      meta: { count: out.length, withGuardianCodes: body.withGuardianCodes },
    });
    out.sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'de'),
    );
    return { data: out };
  }

  /** Vor dem Einlösen: zeigt Vorname und Klasse, damit das Kind sieht, dass es der eigene Brief ist. */
  @Public()
  @NoTransaction()
  @RateLimit(10, 60)
  @Post('auth/access-code/check')
  @HttpCode(200)
  async check(
    @Req() req: FastifyRequest,
    @Body(new ZodPipe(accessCodeCheck)) body: z.infer<typeof accessCodeCheck>,
  ): Promise<AccessCodeInfo> {
    const tenantId = req.tenant!.id;
    const info = await this.prisma.runAsTenant(tenantId, async (tx) => {
      const code = await this.usable(tx, body.code);
      if (!code) return null;
      const p = await tx.person.findUniqueOrThrow({
        where: { id: code.personId },
        select: {
          firstName: true,
          user: { select: { username: true, passwordHash: true } },
          enrollments: {
            where: this.current(),
            orderBy: { fromDate: 'desc' },
            take: 1,
            select: { class: { select: { name: true } } },
          },
        },
      });
      if (!p.user?.username) return null;
      return {
        firstName: p.firstName,
        className: p.enrollments[0]?.class.name ?? null,
        username: p.user.username,
        reset: p.user.passwordHash !== null,
      };
    });
    if (!info) bad(INVALID);
    return info;
  }

  /** Code einlösen: Passwort setzen, Code verbrauchen, andere Sitzungen beenden (gilt auch als Zurücksetzen). */
  @Public()
  @NoTransaction()
  @RateLimit(10, 60)
  @Post('auth/access-code/redeem')
  @HttpCode(200)
  async redeem(
    @Req() req: FastifyRequest,
    @Body(new ZodPipe(accessCodeRedeem)) body: z.infer<typeof accessCodeRedeem>,
  ): Promise<{ username: string }> {
    const tenantId = req.tenant!.id;
    const hash = await this.crypto.hashPassword(body.password);
    const r = await this.prisma.runAsTenant(tenantId, async (tx) => {
      const code = await this.usable(tx, body.code);
      if (!code) return null;
      const user = await tx.user.findUnique({ where: { personId: code.personId } });
      if (!user?.username) return null;
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: hash, failedLoginCount: 0, lockedUntil: null },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.accessCode.update({ where: { id: code.id }, data: { usedAt: new Date() } });
      return { personId: code.personId, username: user.username };
    });
    if (!r) bad(INVALID);
    await this.audit.record({
      tenantId,
      actorId: r.personId,
      action: 'accessCode.redeem',
      entity: 'person',
      entityId: r.personId,
    });
    return { username: r.username };
  }

  private async usable(tx: Tx, normalized: string) {
    const code = await tx.accessCode.findUnique({
      where: { codeHash: this.crypto.sha256(normalized) },
    });
    if (!code || code.usedAt || code.expiresAt < new Date()) return null;
    const p = await tx.person.findUnique({
      where: { id: code.personId },
      select: { anonymizedAt: true },
    });
    return p && !p.anonymizedAt ? code : null;
  }

  /** Freier Benutzername: lena.huber, sonst lena.huber2, lena.huber3 … */
  private async freeUsername(tx: Tx, firstName: string, lastName: string) {
    const base = usernameBase(firstName, lastName);
    const taken = new Set(
      (
        await tx.user.findMany({
          where: { username: { startsWith: base } },
          select: { username: true },
        })
      ).map((u) => u.username),
    );
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
  }
}
