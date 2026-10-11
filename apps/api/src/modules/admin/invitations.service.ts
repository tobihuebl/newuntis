import { Injectable } from '@nestjs/common';
import type { TenantInfo } from '../../common/request';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /** Sendet Einladungen an die hinterlegten Adressen. Personen ohne Adresse oder mit aktivem Konto werden übersprungen. */
  async invite(tenant: TenantInfo, actorId: string, personIds: string[]) {
    const persons = await this.prisma.runAsTenant(tenant.id, (tx) =>
      tx.person.findMany({
        where: { id: { in: personIds } },
        select: {
          id: true,
          email: true,
          anonymizedAt: true,
          user: { select: { passwordHash: true } },
        },
      }),
    );
    const found = new Map(persons.map((p) => [p.id, p]));
    let sent = 0;
    const skipped: {
      personId: string;
      reason: 'unknown' | 'anonymized' | 'noEmail' | 'activeAccount';
    }[] = [];
    for (const id of personIds) {
      const p = found.get(id);
      if (!p) skipped.push({ personId: id, reason: 'unknown' });
      else if (p.anonymizedAt) skipped.push({ personId: id, reason: 'anonymized' });
      else if (!p.email) skipped.push({ personId: id, reason: 'noEmail' });
      else if (p.user?.passwordHash) skipped.push({ personId: id, reason: 'activeAccount' });
      else {
        await this.auth.createInvitation(tenant, id, p.email, actorId);
        sent++;
      }
    }
    return { sent, skipped };
  }
}
