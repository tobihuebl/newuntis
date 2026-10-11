import { Injectable } from '@nestjs/common';
import { can, type Action, type PolicyResource, type PolicyUser } from '@sp/shared';
import type { Principal } from '../../common/request';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Das policy-Modul beantwortet `can(user, action, resource)`. Controller prüfen nie selbst Rollen.
 * Die Beziehungen (Kinder, Klassen, Fächer) lädt es aus der Datenbank, die Regeln liegen in @sp/shared.
 */
@Injectable()
export class PolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async loadUser(tenantId: string, principal: Principal): Promise<PolicyUser> {
    const roles = [...new Set(principal.roles.map((r) => r.role))];
    const today = new Date(new Date().toISOString().slice(0, 10));
    return this.prisma.runAsTenant(tenantId, async (tx) => {
      const links = roles.includes('GUARDIAN')
        ? await tx.guardianLink.findMany({
            where: {
              guardianId: principal.personId,
              validFrom: { lte: today },
              OR: [{ validTo: null }, { validTo: { gte: today } }],
            },
            select: { studentId: true },
          })
        : [];
      const lessons =
        roles.includes('TEACHER') || roles.includes('HOMEROOM')
          ? await tx.lesson.findMany({
              where: {
                teachers: { some: { teacherId: principal.personId } },
                timetable: { status: 'PUBLISHED' },
              },
              select: { classId: true, subjectId: true },
            })
          : [];
      return {
        personId: principal.personId,
        roles,
        guardianOfStudentIds: links.map((l) => l.studentId),
        teachesClassIds: [...new Set(lessons.flatMap((l) => (l.classId ? [l.classId] : [])))],
        homeroomClassIds: principal.roles.flatMap((r) =>
          r.role === 'HOMEROOM' && r.classId ? [r.classId] : [],
        ),
        teachingPairs: lessons.flatMap((l) => (l.classId ? [`${l.classId}:${l.subjectId}`] : [])),
      };
    });
  }

  async can(
    tenantId: string,
    principal: Principal,
    action: Action,
    resource?: PolicyResource,
  ): Promise<boolean> {
    return can(await this.loadUser(tenantId, principal), action, resource);
  }
}
