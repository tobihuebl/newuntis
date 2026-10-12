import { Controller, ForbiddenException, Get, Query, Res } from '@nestjs/common';
import {
  dashboardQuery,
  hasScope,
  reportQuery,
  toCsv,
  type AttendanceReport,
  type PolicyUser,
  type SubstitutionReport,
} from '@sp/shared';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import { Can } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { todayIn } from '../timetable/data';
import { ReportsService } from './reports.service';

const schoolWide = (user: PolicyUser) => hasScope(user, 'reports.read', 'ALL');

/**
 * Direktions-Lagebild und Auswertungen (Spec Abschnitt 9). Schulweit: Direktion und Administration;
 * Klassenvorstand nur für die eigene Klasse (Rechte-Matrix "Auswertungen der Schule").
 */
@Controller()
export class ReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly reports: ReportsService,
    private readonly audit: AuditService,
  ) {}

  private async tz(tenantId: string) {
    return (await this.prisma.tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })).timezone;
  }

  @Can('reports.read')
  @Get('dashboard/principal')
  async dashboard(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(dashboardQuery)) q: z.infer<typeof dashboardQuery>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    if (!schoolWide(user))
      throw new ForbiddenException({ title: 'Nur für Direktion und Administration' });
    const tz = await this.tz(tenantId);
    return this.reports.dashboard(this.prisma.tx, tz, q.date ?? todayIn(tz));
  }

  @Can('reports.read')
  @Get('reports/attendance')
  async attendance(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(reportQuery)) q: z.infer<typeof reportQuery>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    let classIds: string[] | null = null;
    if (!schoolWide(user)) {
      const own = [...(user.homeroomClassIds ?? [])];
      if (q.classId && !own.includes(q.classId))
        throw new ForbiddenException({ title: 'Nur für die eigene Klasse' });
      classIds = q.classId ? [q.classId] : own;
    } else if (q.classId) classIds = [q.classId];
    const report = await this.reports.attendance(
      this.prisma.tx,
      await this.tz(tenantId),
      q.from,
      q.to,
      classIds,
      q.classId ?? (classIds?.length === 1 ? classIds[0]! : null),
    );
    // Fehlzeiten sind Personendaten: lesender Zugriff wird protokolliert (Spec Abschnitt 9)
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'report.attendance.read',
      entity: 'report',
      entityId: q.classId ?? null,
      meta: { from: q.from, to: q.to, format: q.format },
    });
    if (q.format === 'csv')
      return this.csv(reply, `anwesenheit-${q.from}-${q.to}.csv`, attendanceCsv(report));
    return report;
  }

  @Can('reports.read')
  @Get('reports/substitutions')
  async substitutions(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(reportQuery)) q: z.infer<typeof reportQuery>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    if (!schoolWide(user))
      throw new ForbiddenException({ title: 'Nur für Direktion und Administration' });
    const report = await this.reports.substitutions(this.prisma.tx, q.from, q.to);
    if (q.format === 'csv')
      return this.csv(reply, `supplierungen-${q.from}-${q.to}.csv`, substitutionCsv(report));
    return report;
  }

  private csv(reply: FastifyReply, filename: string, body: string) {
    void reply.header('content-type', 'text/csv; charset=utf-8');
    void reply.header('content-disposition', `attachment; filename="${filename}"`);
    void reply.header('cache-control', 'no-store');
    return body;
  }
}

function attendanceCsv(r: AttendanceReport): string {
  const head = [
    'Abwesend (Stunden)',
    'Verspätet (Stunden)',
    'Offen',
    'Gemeldet',
    'Entschuldigt',
    'Abgelehnt',
    'Unentschuldigt',
  ];
  if (r.students)
    return toCsv([
      ['Schüler:in', ...head, 'Verspätung (Minuten)'],
      ...r.students.map((s) => [
        s.name,
        s.absentLessons,
        s.lateLessons,
        s.absences.open,
        s.absences.reported,
        s.absences.excused,
        s.absences.rejected,
        s.absences.unexcused,
        s.lateMinutes,
      ]),
    ]);
  return toCsv([
    ['Klasse', 'Schüler:innen', 'Erfasste Stunden', ...head],
    ...r.classes.map((c) => [
      c.className,
      c.students,
      c.lessons,
      c.absentLessons,
      c.lateLessons,
      c.absences.open,
      c.absences.reported,
      c.absences.excused,
      c.absences.rejected,
      c.absences.unexcused,
    ]),
  ]);
}

function substitutionCsv(r: SubstitutionReport): string {
  return toCsv([
    ['Lehrkraft', 'Vertretungen (Stunden)', 'Betreuungen (Stunden)', 'Ausgefallen (Stunden)'],
    ...r.teachers.map((t) => [t.name, t.substituted, t.supervised, t.missed]),
    [],
    ['Summe Vertretungen', r.totals.substitutions],
    ['Summe Betreuungen', r.totals.supervisions],
    ['Summe Entfall', r.totals.cancelled],
    ['Summe Raumwechsel', r.totals.roomChanges],
  ]);
}
