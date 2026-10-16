import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Tx } from '@sp/db';
import {
  addDays,
  can,
  examInput,
  examListQuery,
  examPatchInput,
  examWarnings,
  mondayOf,
  tenantSettingsSchema,
  type ExamItem,
  type PolicyUser,
} from '@sp/shared';
import { DateTime } from 'luxon';
import type { z } from 'zod';
import { Can } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { asDate, iso, todayIn } from '../timetable/data';
import { applyExamDisplacement, restore } from '../timetable/exam-displacement';

const subjectSelect = { id: true, name: true, code: true, color: true } as const;

/**
 * Prüfungskalender (PN-01): Lehrkräfte tragen für eigene Fächer ein, die Direktion für alle.
 * Kollisionswarnung nach Grenzwerten der Schule; mit `force` trotzdem eintragen.
 */
@Controller('exams')
export class ExamsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async limits(tx: Tx, tenantId: string) {
    const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    return { exams: tenantSettingsSchema.parse(t.settings).exams, tz: t.timezone };
  }

  private async currentClassIds(tx: Tx, studentIds: string[], today: string) {
    return (
      await tx.enrollment.findMany({
        where: {
          studentId: { in: studentIds },
          fromDate: { lte: asDate(today) },
          OR: [{ toDate: null }, { toDate: { gte: asDate(today) } }],
        },
        select: { classId: true },
      })
    ).map((e) => e.classId);
  }

  @Can('exam.read')
  @Get()
  async list(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(examListQuery)) q: z.infer<typeof examListQuery>,
  ) {
    const tx = this.prisma.tx;
    const user = await this.policy.loadUser(tenantId, me);
    const { tz } = await this.limits(tx, tenantId);
    const today = todayIn(tz);
    let classIds: string[] | null;
    if (q.classId) {
      if (!can(user, 'exam.read', { classId: q.classId }))
        throw new ForbiddenException({ title: 'Keine Berechtigung für diese Klasse' });
      classIds = [q.classId];
    } else if (q.studentId) {
      if (!can(user, 'exam.read', { studentId: q.studentId }))
        throw new ForbiddenException({ title: 'Keine Berechtigung' });
      classIds = await this.currentClassIds(tx, [q.studentId], today);
    } else if (user.roles.some((r) => r === 'PRINCIPAL' || r === 'ADMIN')) {
      classIds = null;
    } else {
      // eigene Sicht: Schüler:in, Kinder, unterrichtete Klassen, eigene Klasse
      classIds = [
        ...(user.roles.includes('STUDENT')
          ? await this.currentClassIds(tx, [me.personId], today)
          : []),
        ...(await this.currentClassIds(tx, [...(user.guardianOfStudentIds ?? [])], today)),
        ...(user.teachesClassIds ?? []),
        ...(user.homeroomClassIds ?? []),
      ];
    }
    const rows = await tx.exam.findMany({
      where: {
        ...(classIds ? { classId: { in: classIds } } : {}),
        date: { gte: asDate(q.from ?? today), lte: asDate(q.to ?? addDays(today, 120)) },
      },
      include: { subject: { select: subjectSelect }, class: { select: { id: true, name: true } } },
      orderBy: [{ date: 'asc' }, { title: 'asc' }],
      take: 500,
    });
    return {
      data: rows.map((x): ExamItem => ({
        id: x.id,
        date: iso(x.date),
        title: x.title,
        kind: x.kind,
        subject: x.subject,
        class: x.class,
        periodStart: x.periodStart,
        periodCount: x.periodCount,
        canEdit: this.mayEdit(user, me, x),
      })),
    };
  }

  /** Auswahl für das Formular: Klassen mit Fächern, für die die Person Prüfungen eintragen darf. */
  @Can('exam.write')
  @Get('options')
  async options(@TenantId() tenantId: string, @Actor() me: Principal) {
    const tx = this.prisma.tx;
    const user = await this.policy.loadUser(tenantId, me);
    const all = user.roles.includes('PRINCIPAL');
    const lessons = await tx.lesson.findMany({
      where: {
        timetable: { status: 'PUBLISHED' },
        classId: { not: null },
        ...(all ? {} : { teachers: { some: { teacherId: me.personId } } }),
      },
      select: {
        class: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
      },
    });
    const byClass = new Map<string, { id: string; name: string; subjects: Map<string, string> }>();
    for (const l of lessons) {
      if (!l.class) continue;
      const c = byClass.get(l.class.id) ?? { ...l.class, subjects: new Map<string, string>() };
      c.subjects.set(l.subject.id, l.subject.name);
      byClass.set(l.class.id, c);
    }
    const periods = await tx.period.findMany({
      orderBy: { number: 'asc' },
      select: { number: true, startTime: true, endTime: true },
    });
    return {
      periods,
      classes: [...byClass.values()]
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
        .map((c) => ({
          id: c.id,
          name: c.name,
          subjects: [...c.subjects]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'de')),
        })),
    };
  }

  private mayEdit(
    user: PolicyUser,
    me: Principal,
    x: { classId: string | null; subjectId: string; createdById: string },
  ): boolean {
    return (
      can(user, 'exam.write', { classId: x.classId ?? undefined, subjectId: x.subjectId }) &&
      (x.createdById === me.personId || user.roles.includes('PRINCIPAL'))
    );
  }

  /** Von/bis Stunde prüfen (müssen im Raster stehen) und als Beginn und Anzahl speichern. */
  private async periods(tx: Tx, start: number | null, end: number | null) {
    if (start === null || end === null) return { periodStart: null, periodCount: 1 };
    const known = new Set(
      (await tx.period.findMany({ select: { number: true } })).map((p) => p.number),
    );
    for (let n = start; n <= end; n++)
      if (!known.has(n))
        throw new BadRequestException({ title: `Die ${n}. Stunde gibt es im Raster nicht` });
    return { periodStart: start, periodCount: end - start + 1 };
  }

  /** Verdrängung neu setzen und betroffene Lehrkräfte informieren (Entfall bzw. wieder Unterricht). */
  private async displace(tx: Tx, tenantId: string, examId: string, tz: string) {
    const r = await applyExamDisplacement(tx, examId);
    const x = await tx.exam.findUniqueOrThrow({ where: { id: examId }, select: { date: true } });
    const changed = [...new Set([...r.restored, ...r.displaced])].filter(
      (id) => !(r.restored.includes(id) && r.displaced.includes(id)),
    );
    await this.notifyTeachers(tx, tenantId, changed, iso(x.date), tz);
  }

  private async notifyTeachers(
    tx: Tx,
    tenantId: string,
    occurrenceIds: string[],
    date: string,
    tz: string,
  ) {
    if (occurrenceIds.length === 0) return;
    const teachers = await tx.occurrenceTeacher.findMany({
      where: { occurrenceId: { in: occurrenceIds } },
      select: { teacherId: true },
    });
    const weekday = DateTime.fromISO(date, { zone: tz }).setLocale('de-AT').toFormat('cccc');
    await this.notifications.emit(
      tx,
      tenantId,
      'substitution.published',
      [...new Set(teachers.map((t) => t.teacherId))],
      { params: { day: weekday }, url: `/plan?from=${mondayOf(date)}` },
    );
  }

  private async checkCollisions(
    tx: Tx,
    tenantId: string,
    classId: string,
    date: string,
    force: boolean,
    excludeId?: string,
  ) {
    const { exams } = await this.limits(tx, tenantId);
    const others = await tx.exam.findMany({
      where: {
        classId,
        id: excludeId ? { not: excludeId } : undefined,
        date: { gte: asDate(addDays(date, -7)), lte: asDate(addDays(date, 7)) },
      },
      select: { date: true },
    });
    const warnings = examWarnings(
      date,
      others.map((o) => iso(o.date)),
      exams,
    );
    if (warnings.length && !force)
      throw new ConflictException({ title: 'Prüfungen überschneiden sich', warnings });
    return warnings;
  }

  @Can('exam.write')
  @Post()
  async create(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(examInput)) body: z.infer<typeof examInput>,
  ) {
    const tx = this.prisma.tx;
    const user = await this.policy.loadUser(tenantId, me);
    if (!can(user, 'exam.write', { classId: body.classId, subjectId: body.subjectId }))
      throw new ForbiddenException({ title: 'Nur für eigene Fächer und Klassen' });
    const { tz } = await this.limits(tx, tenantId);
    if (body.date < todayIn(tz))
      throw new ConflictException({ title: 'Das Datum liegt in der Vergangenheit' });
    const warnings = await this.checkCollisions(tx, tenantId, body.classId, body.date, body.force);
    const periods = await this.periods(tx, body.periodStart, body.periodEnd);
    const exam = await tx.exam.create({
      data: {
        tenantId,
        classId: body.classId,
        subjectId: body.subjectId,
        date: asDate(body.date),
        title: body.title,
        kind: body.kind,
        ...periods,
        createdById: me.personId,
      },
      include: { subject: { select: subjectSelect }, class: { select: { id: true, name: true } } },
    });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'exam.create',
      entity: 'exam',
      entityId: exam.id,
      meta: { warnings: warnings.length },
    });
    await this.displace(tx, tenantId, exam.id, tz);
    // exam.created an Schüler:innen und Eltern der Klasse (In-App, Spec Abschnitt 12)
    const day = asDate(body.date);
    const students = (
      await tx.enrollment.findMany({
        where: {
          classId: body.classId,
          fromDate: { lte: day },
          OR: [{ toDate: null }, { toDate: { gte: day } }],
        },
        select: { studentId: true },
      })
    ).map((e) => e.studentId);
    const guardians = (
      await tx.guardianLink.findMany({
        where: { studentId: { in: students }, OR: [{ validTo: null }, { validTo: { gte: day } }] },
        select: { guardianId: true },
      })
    ).map((g) => g.guardianId);
    await this.notifications.emit(tx, tenantId, 'exam.created', [...students, ...guardians], {
      url: '/heute',
    });
    return {
      exam: {
        id: exam.id,
        date: iso(exam.date),
        title: exam.title,
        kind: exam.kind,
        subject: exam.subject,
        class: exam.class,
        periodStart: exam.periodStart,
        periodCount: exam.periodCount,
        canEdit: true,
      } satisfies ExamItem,
      warnings,
    };
  }

  @Can('exam.write')
  @Patch(':id')
  async update(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(examPatchInput)) body: z.infer<typeof examPatchInput>,
  ) {
    const tx = this.prisma.tx;
    const user = await this.policy.loadUser(tenantId, me);
    const x = await tx.exam.findUnique({ where: { id } });
    if (!x) throw new NotFoundException({ title: 'Prüfung nicht gefunden' });
    if (!this.mayEdit(user, me, x)) throw new ForbiddenException({ title: 'Keine Berechtigung' });
    const warnings =
      body.date && x.classId
        ? await this.checkCollisions(tx, tenantId, x.classId, body.date, body.force, x.id)
        : [];
    await tx.exam.update({
      where: { id },
      data: {
        ...(body.date ? { date: asDate(body.date) } : {}),
        ...(body.title ? { title: body.title } : {}),
        ...(body.kind ? { kind: body.kind } : {}),
        ...(body.periodStart !== undefined
          ? await this.periods(tx, body.periodStart, body.periodEnd ?? null)
          : {}),
      },
    });
    if (body.date || body.periodStart !== undefined)
      await this.displace(tx, tenantId, id, (await this.limits(tx, tenantId)).tz);
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'exam.update',
      entity: 'exam',
      entityId: id,
    });
    return { warnings };
  }

  @Can('exam.write')
  @Delete(':id')
  @HttpCode(204)
  async remove(@TenantId() tenantId: string, @Actor() me: Principal, @Param('id') id: string) {
    const tx = this.prisma.tx;
    const user = await this.policy.loadUser(tenantId, me);
    const x = await tx.exam.findUnique({ where: { id } });
    if (!x) throw new NotFoundException({ title: 'Prüfung nicht gefunden' });
    if (!this.mayEdit(user, me, x)) throw new ForbiddenException({ title: 'Keine Berechtigung' });
    // Verdrängte Stunden kommen zurück (ADR 0024)
    const restored = await restore(tx, id);
    await tx.exam.delete({ where: { id } });
    await this.notifyTeachers(
      tx,
      tenantId,
      restored,
      iso(x.date),
      (await this.limits(tx, tenantId)).tz,
    );
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'exam.delete',
      entity: 'exam',
      entityId: id,
    });
  }
}
