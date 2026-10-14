import { Inject, Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import type { SessionStage, Tx } from '@sp/db';
import { TWO_FACTOR_REQUIRED_ROLES, formalAddress, type MeResponse, type Role } from '@sp/shared';
import { ENV, type Env } from '../../config/env';
import { tenantAppUrl } from '../../common/urls';
import type { Principal, TenantInfo } from '../../common/request';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from './crypto.service';
import { MailQueue } from '../mail/mail-queue.service';
import { SessionService, type IssuedSession } from './session.service';
import { TotpService } from './totp.service';

const GENERIC_LOGIN_ERROR = 'Anmeldung fehlgeschlagen';
const INVITE_VALID_DAYS = 14;
const RESET_VALID_MINUTES = 60;
const RECOVERY_CODE_COUNT = 10;

export interface LoginResult {
  stage: SessionStage;
  session: IssuedSession;
}

@Injectable()
export class AuthService {
  /** Fester Hash, gegen den bei unbekannter E-Mail geprüft wird, damit die Antwortzeit nichts verrät. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly sessions: SessionService,
    private readonly totp: TotpService,
    private readonly mail: MailQueue,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ───────────────────────── Anmeldung ─────────────────────────

  async login(
    tenant: TenantInfo,
    email: string,
    password: string,
    userAgent?: string,
  ): Promise<LoginResult> {
    const now = new Date();
    const user = await this.prisma.runAsTenant(tenant.id, (tx) =>
      tx.user.findUnique({
        // Anmeldung mit E-Mail-Adresse oder Benutzername (Zugangscode, ADR 0020)
        where: email.includes('@')
          ? { tenantId_email: { tenantId: tenant.id, email } }
          : { tenantId_username: { tenantId: tenant.id, username: email } },
        include: { person: { include: { roles: true } } },
      }),
    );
    const locked =
      user?.lockedUntil !== null && user?.lockedUntil !== undefined && user.lockedUntil > now;
    const hash =
      user?.passwordHash ??
      (await (this.dummyHash ??= this.crypto.hashPassword(
        'dummy-passwort-fuer-gleiche-antwortzeit',
      )));
    const ok = await this.crypto.verifyPassword(hash, password);

    if (!user || !user.passwordHash || !ok || locked || user.person.anonymizedAt) {
      if (user && !locked) await this.registerFailure(tenant, user.id, 'auth.login.failure');
      else
        await this.audit.record({
          tenantId: tenant.id,
          actorId: user?.personId ?? null,
          action: 'auth.login.failure',
          entity: 'user',
          entityId: user?.id ?? null,
          meta: { reason: locked ? 'locked' : 'unknown' },
        });
      throw new UnauthorizedException({ title: GENERIC_LOGIN_ERROR });
    }

    const roles = user.person.roles.map((r) => r.role as Role);
    const needsTwoFactor = roles.some((r) => TWO_FACTOR_REQUIRED_ROLES.includes(r));
    const stage: SessionStage = user.totpEnabled
      ? 'NEEDS_2FA_VERIFY'
      : needsTwoFactor
        ? 'NEEDS_2FA_SETUP'
        : 'ACTIVE';
    const session = await this.sessions.create(tenant.id, user.id, stage, userAgent);
    if (stage === 'ACTIVE') await this.markLoggedIn(tenant, user.id);
    await this.audit.record({
      tenantId: tenant.id,
      actorId: user.personId,
      action: 'auth.login.success',
      entity: 'user',
      entityId: user.id,
      meta: { stage },
    });
    return { stage, session };
  }

  private async registerFailure(tenant: TenantInfo, userId: string, action: string): Promise<void> {
    const { maxFailedLogins, lockoutMinutes } = tenant.settings.security;
    const lockedNow = await this.prisma.runAsTenant(tenant.id, async (tx) => {
      const u = await tx.user.update({
        where: { id: userId },
        data: { failedLoginCount: { increment: 1 } },
      });
      if (u.failedLoginCount >= maxFailedLogins) {
        await tx.user.update({
          where: { id: userId },
          data: {
            failedLoginCount: 0,
            lockedUntil: new Date(Date.now() + lockoutMinutes * 60_000),
          },
        });
        return true;
      }
      return false;
    });
    await this.audit.record({
      tenantId: tenant.id,
      action,
      entity: 'user',
      entityId: userId,
      meta: { locked: lockedNow },
    });
  }

  private async markLoggedIn(tenant: TenantInfo, userId: string): Promise<void> {
    await this.prisma.runAsTenant(tenant.id, (tx) =>
      tx.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
      }),
    );
  }

  // ───────────────────────── Zwei-Faktor ─────────────────────────

  /** TOTP-Code oder Wiederherstellungscode prüfen; bei Erfolg wird die Sitzung ACTIVE und rotiert. */
  async verifyTwoFactor(
    tenant: TenantInfo,
    principal: Principal,
    code: string,
  ): Promise<IssuedSession> {
    const valid = await this.prisma.runAsTenant(tenant.id, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: principal.userId } });
      if (user.lockedUntil && user.lockedUntil > new Date()) return false;
      if (/^\d{6}$/.test(code)) {
        if (user.totpSecret === null) return false;
        return this.useTotp(tx, user.id, this.crypto.decrypt(user.totpSecret), code);
      }
      const hash = this.crypto.sha256(this.crypto.normalizeRecoveryCode(code));
      const rc = await tx.recoveryCode.findFirst({
        where: { userId: user.id, codeHash: hash, usedAt: null },
      });
      if (!rc) return false;
      await tx.recoveryCode.update({ where: { id: rc.id }, data: { usedAt: new Date() } });
      return true;
    });
    if (!valid) {
      await this.registerFailure(tenant, principal.userId, 'auth.2fa.failure');
      throw new UnauthorizedException({ title: 'Code ungültig' });
    }
    await this.markLoggedIn(tenant, principal.userId);
    await this.audit.record({
      tenantId: tenant.id,
      actorId: principal.personId,
      action: 'auth.2fa.verified',
      entity: 'user',
      entityId: principal.userId,
    });
    return this.sessions.rotate(tenant.id, principal.sessionId, 'ACTIVE');
  }

  /** Prüft den Code und verbraucht seine Zeitscheibe (atomar): derselbe Code gilt kein zweites Mal. */
  private async useTotp(tx: Tx, userId: string, secret: string, code: string): Promise<boolean> {
    const counter = this.totp.counter(secret, code);
    if (counter === null) return false;
    const r = await tx.user.updateMany({
      where: {
        id: userId,
        OR: [{ totpLastCounter: null }, { totpLastCounter: { lt: counter } }],
      },
      data: { totpLastCounter: counter },
    });
    return r.count === 1;
  }

  /** Beginnt die Einrichtung: erzeugt ein Geheimnis (verschlüsselt gespeichert, noch nicht aktiv). */
  async beginTwoFactorSetup(
    tenant: TenantInfo,
    principal: Principal,
  ): Promise<{ secret: string; otpauthUri: string }> {
    if (principal.totpEnabled)
      throw new BadRequestException({ title: 'Zwei-Faktor ist bereits eingerichtet' });
    const secret = this.totp.generateSecret();
    await this.prisma.runAsTenant(tenant.id, (tx) =>
      tx.user.update({
        where: { id: principal.userId },
        data: {
          totpSecret: this.crypto.encrypt(secret),
          totpEnabled: false,
          totpLastCounter: null,
        },
      }),
    );
    return {
      secret,
      otpauthUri: this.totp.uri(
        secret,
        principal.email ?? principal.username ?? principal.personId,
        tenant.name,
      ),
    };
  }

  /** Schließt die Einrichtung ab, erzeugt Wiederherstellungscodes (Klartext nur jetzt) und aktiviert die Sitzung. */
  async enableTwoFactor(
    tenant: TenantInfo,
    principal: Principal,
    code: string,
  ): Promise<{ recoveryCodes: string[]; session: IssuedSession }> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => this.crypto.recoveryCode());
    const ok = await this.prisma.runAsTenant(tenant.id, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: principal.userId } });
      if (
        !user.totpSecret ||
        user.totpEnabled ||
        !(await this.useTotp(tx, user.id, this.crypto.decrypt(user.totpSecret), code))
      )
        return false;
      await tx.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
      await tx.recoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.recoveryCode.createMany({
        data: codes.map((c) => ({
          tenantId: tenant.id,
          userId: user.id,
          codeHash: this.crypto.sha256(c),
        })),
      });
      return true;
    });
    if (!ok) throw new BadRequestException({ title: 'Code ungültig' });
    await this.markLoggedIn(tenant, principal.userId);
    await this.audit.record({
      tenantId: tenant.id,
      actorId: principal.personId,
      action: 'auth.2fa.enabled',
      entity: 'user',
      entityId: principal.userId,
    });
    return {
      recoveryCodes: codes,
      session: await this.sessions.rotate(tenant.id, principal.sessionId, 'ACTIVE'),
    };
  }

  // ───────────────────────── Abmelden ─────────────────────────

  async logout(tenant: TenantInfo, principal: Principal): Promise<void> {
    await this.sessions.destroy(tenant.id, principal.sessionId);
    await this.audit.record({
      tenantId: tenant.id,
      actorId: principal.personId,
      action: 'auth.logout',
      entity: 'session',
      entityId: principal.sessionId,
    });
  }

  async logoutEverywhere(tenant: TenantInfo, principal: Principal): Promise<void> {
    await this.sessions.destroyAllForUser(tenant.id, principal.userId);
    await this.audit.record({
      tenantId: tenant.id,
      actorId: principal.personId,
      action: 'auth.logout.all',
      entity: 'user',
      entityId: principal.userId,
    });
  }

  // ───────────────────────── Einladung ─────────────────────────

  /** Legt eine Einladung an und verschickt den Link. Gibt den Klartext-Token zurück (für Skripte und Tests). */
  async createInvitation(
    tenant: TenantInfo,
    personId: string,
    email: string,
    createdById?: string,
  ): Promise<string> {
    const token = this.crypto.randomToken();
    const roles = await this.prisma.runAsTenant(tenant.id, async (tx) => {
      await tx.invitation.create({
        data: {
          tenantId: tenant.id,
          personId,
          email,
          tokenHash: this.crypto.sha256(token),
          expiresAt: new Date(Date.now() + INVITE_VALID_DAYS * 86_400_000),
          createdById: createdById ?? null,
        },
      });
      return tx.roleAssignment.findMany({ where: { personId }, select: { role: true } });
    });
    await this.mail.send(email, {
      kind: 'invitation',
      school: tenant.name,
      url: this.appUrl(tenant, `/einladung?token=${token}`),
      validDays: INVITE_VALID_DAYS,
      formal: formalAddress(roles.map((r) => r.role as Role)),
    });
    return token;
  }

  async acceptInvitation(tenant: TenantInfo, token: string, password: string): Promise<void> {
    const hash = await this.crypto.hashPassword(password);
    const ok = await this.prisma.runAsTenant(tenant.id, async (tx) => {
      const inv = await tx.invitation.findUnique({
        where: { tokenHash: this.crypto.sha256(token) },
      });
      if (!inv || inv.usedAt || inv.expiresAt < new Date()) return null;
      const existing = await tx.user.findUnique({ where: { personId: inv.personId } });
      if (existing) {
        await tx.user.update({
          where: { id: existing.id },
          data: { passwordHash: hash, email: inv.email },
        });
      } else {
        await tx.user.create({
          data: {
            tenantId: tenant.id,
            personId: inv.personId,
            email: inv.email,
            passwordHash: hash,
          },
        });
      }
      await tx.invitation.update({ where: { id: inv.id }, data: { usedAt: new Date() } });
      return inv.personId;
    });
    if (!ok) throw new BadRequestException({ title: 'Einladung ungültig oder abgelaufen' });
    await this.audit.record({
      tenantId: tenant.id,
      actorId: ok,
      action: 'auth.invite.accepted',
      entity: 'person',
      entityId: ok,
    });
  }

  // ───────────────────────── Passwort zurücksetzen ─────────────────────────

  /** Antwortet immer gleich, egal ob die Adresse existiert (keine Kontenerkennung). */
  async requestPasswordReset(tenant: TenantInfo, email: string): Promise<void> {
    const user = await this.prisma.runAsTenant(tenant.id, (tx) =>
      tx.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email } } }),
    );
    if (!user || !user.passwordHash) return;
    const token = this.crypto.randomToken();
    const roles = await this.prisma.runAsTenant(tenant.id, async (tx) => {
      await tx.passwordResetToken.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          tokenHash: this.crypto.sha256(token),
          expiresAt: new Date(Date.now() + RESET_VALID_MINUTES * 60_000),
        },
      });
      return tx.roleAssignment.findMany({
        where: { personId: user.personId },
        select: { role: true },
      });
    });
    await this.audit.record({
      tenantId: tenant.id,
      actorId: user.personId,
      action: 'auth.password.reset-requested',
      entity: 'user',
      entityId: user.id,
    });
    await this.mail.send(email, {
      kind: 'passwordReset',
      school: tenant.name,
      url: this.appUrl(tenant, `/passwort-zuruecksetzen?token=${token}`),
      validMinutes: RESET_VALID_MINUTES,
      formal: formalAddress(roles.map((r) => r.role as Role)),
    });
  }

  async resetPassword(tenant: TenantInfo, token: string, password: string): Promise<void> {
    const hash = await this.crypto.hashPassword(password);
    const userId = await this.prisma.runAsTenant(tenant.id, async (tx) => {
      const t = await tx.passwordResetToken.findUnique({
        where: { tokenHash: this.crypto.sha256(token) },
      });
      if (!t || t.usedAt || t.expiresAt < new Date()) return null;
      await tx.passwordResetToken.update({ where: { id: t.id }, data: { usedAt: new Date() } });
      await tx.user.update({
        where: { id: t.userId },
        data: { passwordHash: hash, failedLoginCount: 0, lockedUntil: null },
      });
      await tx.session.deleteMany({ where: { userId: t.userId } }); // alle Geräte abmelden
      return t.userId;
    });
    if (!userId) throw new BadRequestException({ title: 'Link ungültig oder abgelaufen' });
    await this.audit.record({
      tenantId: tenant.id,
      action: 'auth.password.reset',
      entity: 'user',
      entityId: userId,
    });
  }

  // ───────────────────────── Profil ─────────────────────────

  me(tenant: TenantInfo, p: Principal, needsOnboarding = false): MeResponse {
    return {
      needsOnboarding,
      stage: p.stage,
      csrfToken: p.csrfToken,
      user: {
        id: p.userId,
        personId: p.personId,
        email: p.email,
        username: p.username,
        avatar: p.avatar,
        firstName: p.firstName,
        lastName: p.lastName,
        roles: p.roles,
        twoFactorEnabled: p.totpEnabled,
      },
      tenant: {
        slug: tenant.slug,
        name: tenant.name,
        offlineClearAfterIdleDays: tenant.settings.offline.clearAfterIdleDays,
        privacyNoticeUrl: tenant.settings.privacy.noticeUrl ?? null,
      },
    };
  }

  private appUrl(tenant: TenantInfo, path: string): string {
    return tenantAppUrl(this.env, tenant.slug, path);
  }
}
