import { Injectable } from '@nestjs/common';
import type { SessionStage } from '@sp/db';
import type { Role } from '@sp/shared';
import type { Principal, TenantInfo } from '../../common/request';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from './crypto.service';

const ABSOLUTE_DAYS = 30;
const TOUCH_AFTER_MS = 60_000;

export interface IssuedSession {
  token: string;
  csrfToken: string;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async create(
    tenantId: string,
    userId: string,
    stage: SessionStage,
    userAgent?: string,
  ): Promise<IssuedSession> {
    const token = this.crypto.randomToken();
    const csrfToken = this.crypto.randomToken(24);
    await this.prisma.runAsTenant(tenantId, (tx) =>
      tx.session.create({
        data: {
          tenantId,
          userId,
          tokenHash: this.crypto.sha256(token),
          csrfToken,
          stage,
          userAgent: userAgent?.slice(0, 200) ?? null,
          absoluteExpiresAt: new Date(Date.now() + ABSOLUTE_DAYS * 86_400_000),
        },
      }),
    );
    return { token, csrfToken };
  }

  /** Neue Session-ID und neues CSRF-Token bei Statuswechsel (Anmeldung, 2FA): verhindert Session Fixation. */
  async rotate(tenantId: string, sessionId: string, stage: SessionStage): Promise<IssuedSession> {
    const token = this.crypto.randomToken();
    const csrfToken = this.crypto.randomToken(24);
    await this.prisma.runAsTenant(tenantId, (tx) =>
      tx.session.update({
        where: { id: sessionId },
        data: { tokenHash: this.crypto.sha256(token), csrfToken, stage, lastSeenAt: new Date() },
      }),
    );
    return { token, csrfToken };
  }

  /** Liefert die Sitzung samt Person und Rollen, oder null bei unbekannt/abgelaufen (Inaktivität oder absolut). */
  /** `touch: false` prüft nur (z. B. für den Echtzeit-Stream), ohne die Sitzung als aktiv zu markieren. */
  async resolve(
    tenant: TenantInfo,
    token: string,
    { touch = true }: { touch?: boolean } = {},
  ): Promise<Principal | null> {
    const now = new Date();
    return this.prisma.runAsTenant(tenant.id, async (tx) => {
      const s = await tx.session.findUnique({
        where: { tokenHash: this.crypto.sha256(token) },
        include: { user: { include: { person: { include: { roles: true } } } } },
      });
      if (!s) return null;
      const idleMs = tenant.settings.security.sessionIdleMinutes * 60_000;
      if (
        now.getTime() - s.lastSeenAt.getTime() > idleMs ||
        now > s.absoluteExpiresAt ||
        s.user.person.anonymizedAt
      ) {
        await tx.session.delete({ where: { id: s.id } });
        return null;
      }
      if (touch && now.getTime() - s.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
        await tx.session.update({ where: { id: s.id }, data: { lastSeenAt: now } });
      }
      return {
        sessionId: s.id,
        stage: s.stage,
        csrfToken: s.csrfToken,
        userId: s.userId,
        personId: s.user.personId,
        email: s.user.email,
        username: s.user.username,
        avatar: s.user.avatar,
        firstName: s.user.person.firstName,
        lastName: s.user.person.lastName,
        roles: s.user.person.roles.map((r) => ({ role: r.role as Role, classId: r.classId })),
        totpEnabled: s.user.totpEnabled,
      };
    });
  }

  async destroy(tenantId: string, sessionId: string): Promise<void> {
    await this.prisma.runAsTenant(tenantId, (tx) =>
      tx.session.deleteMany({ where: { id: sessionId } }),
    );
  }

  async destroyAllForUser(tenantId: string, userId: string): Promise<void> {
    await this.prisma.runAsTenant(tenantId, (tx) => tx.session.deleteMany({ where: { userId } }));
  }
}
