import { Controller, Get, Query } from '@nestjs/common';
import { can, SEARCH_LIMIT, searchQuery, type SearchResult } from '@sp/shared';
import type { z } from 'zod';
import { Authenticated } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { asDate, todayIn } from '../timetable/data';

/**
 * Globale Suche (PL-06). Was gefunden wird, folgt den bestehenden Rechten:
 * - fremde Pläne sehen (timetable.read.other): Klassen, Räume, Lehrkräfte; dazu Schüler:innen der eigenen Klassen
 * - Stammdaten lesen (masterdata.read, Direktion und Administration): alle Personen
 * Schüler:innen und Eltern bekommen eine leere Liste. Gefundene Personen werden protokolliert (ohne Suchtext).
 */
@Controller('search')
export class SearchController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
  ) {}

  @Authenticated()
  @Get()
  async search(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(searchQuery)) query: z.infer<typeof searchQuery>,
  ): Promise<{ data: SearchResult[] }> {
    const user = await this.policy.loadUser(tenantId, me);
    const other = can(user, 'timetable.read.other');
    const master = can(user, 'masterdata.read');
    if (!other && !master) return { data: [] };
    const tx = this.prisma.tx;
    const q = query.q;
    const words = q.split(/\s+/).filter(Boolean);
    const named = {
      anonymizedAt: null,
      AND: words.map((w) => ({
        OR: [
          { firstName: { contains: w, mode: 'insensitive' as const } },
          { lastName: { contains: w, mode: 'insensitive' as const } },
        ],
      })),
    };
    const tz = (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })).timezone;
    const today = asDate(todayIn(tz));
    const current = {
      fromDate: { lte: today },
      OR: [{ toDate: null }, { toDate: { gte: today } }],
    };
    const year = await tx.schoolYear.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    const out: SearchResult[] = [];

    if (master) {
      const people = await tx.person.findMany({
        where: named,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: SEARCH_LIMIT,
        select: {
          id: true,
          kind: true,
          firstName: true,
          lastName: true,
          enrollments: { where: current, select: { class: { select: { name: true } } }, take: 1 },
        },
      });
      out.push(
        ...people.map((p) => ({
          kind: 'person' as const,
          id: p.id,
          label: `${p.lastName} ${p.firstName}`.trim(),
          detail: p.enrollments[0]?.class.name ?? null,
          personKind: p.kind,
          href: `/admin/personen/${p.id}`,
        })),
      );
    } else {
      const classIds = [
        ...new Set([...(user.teachesClassIds ?? []), ...(user.homeroomClassIds ?? [])]),
      ];
      const [teachers, students] = await Promise.all([
        tx.person.findMany({
          where: { ...named, kind: 'TEACHER' },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          take: SEARCH_LIMIT,
          select: { id: true, firstName: true, lastName: true },
        }),
        classIds.length
          ? tx.enrollment.findMany({
              where: { ...current, classId: { in: classIds }, student: named },
              orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
              take: SEARCH_LIMIT,
              select: {
                classId: true,
                class: { select: { name: true } },
                student: { select: { id: true, firstName: true, lastName: true } },
              },
            })
          : Promise.resolve([]),
      ]);
      out.push(
        ...teachers.map((t) => ({
          kind: 'teacher' as const,
          id: t.id,
          label: `${t.lastName} ${t.firstName}`.trim(),
          detail: null,
          href: `/plan?teacher=${t.id}`,
        })),
        ...students.map((e) => ({
          kind: 'student' as const,
          id: e.student.id,
          label: `${e.student.lastName} ${e.student.firstName}`.trim(),
          detail: e.class.name,
          href: `/klassen/${e.classId}`,
        })),
      );
    }

    if (other) {
      const [classes, rooms] = await Promise.all([
        year
          ? tx.schoolClass.findMany({
              where: { schoolYearId: year.id, name: { contains: q, mode: 'insensitive' } },
              orderBy: { name: 'asc' },
              take: SEARCH_LIMIT,
              select: { id: true, name: true },
            })
          : Promise.resolve([]),
        tx.room.findMany({
          where: { name: { contains: q, mode: 'insensitive' } },
          orderBy: { name: 'asc' },
          take: SEARCH_LIMIT,
          select: { id: true, name: true },
        }),
      ]);
      out.push(
        ...classes.map((c) => ({
          kind: 'class' as const,
          id: c.id,
          label: c.name,
          detail: null,
          href: `/plan?class=${c.id}`,
        })),
        ...rooms.map((r) => ({
          kind: 'room' as const,
          id: r.id,
          label: r.name,
          detail: null,
          href: `/plan?room=${r.id}`,
        })),
      );
    }

    const people = out.filter((r) => r.kind === 'person' || r.kind === 'student').length;
    if (people > 0)
      await this.audit.record({
        tenantId,
        actorId: me.personId,
        action: 'person.search',
        entity: 'person',
        meta: { count: people },
      });
    return { data: out };
  }
}
