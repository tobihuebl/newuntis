import { Controller, Get } from '@nestjs/common';
import type { Role } from '@sp/shared';
import { Can } from '../../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Rollen-Übersicht (AD-01, /admin/rollen): wer hat Verwaltungs-, Direktions- und Klassenvorstandsrollen.
 * Vergeben werden Rollen an der Person (PATCH /admin/persons/:id) bzw. an der Klasse (Klassenvorstand).
 */
@Controller('admin/roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Can('roles.manage')
  @Get()
  async holders() {
    const rows = await this.prisma.tx.roleAssignment.findMany({
      where: { role: { in: ['ADMIN', 'PRINCIPAL', 'HOMEROOM'] }, person: { anonymizedAt: null } },
      select: {
        role: true,
        class: { select: { id: true, name: true } },
        person: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ role: 'asc' }, { person: { lastName: 'asc' } }],
    });
    const counts = await this.prisma.tx.roleAssignment.groupBy({
      by: ['role'],
      where: { person: { anonymizedAt: null } },
      _count: { _all: true },
    });
    return {
      holders: rows.map((r) => ({
        role: r.role as Role,
        person: { id: r.person.id, name: `${r.person.lastName} ${r.person.firstName}`.trim() },
        class: r.class,
      })),
      counts: Object.fromEntries(counts.map((c) => [c.role, c._count._all])) as Partial<
        Record<Role, number>
      >,
    };
  }
}
