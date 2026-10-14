import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  personInput,
  personListQuery,
  personPatch,
  teacherProfileInput,
  weeklyHours,
  type Role,
  type TeacherProfile,
} from '@sp/shared';
import type { z } from 'zod';
import { Can } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { anonymizePerson, assertCanAnonymize } from '../privacy/anonymize';
import { PrismaService } from '../prisma/prisma.service';
import { bad, isoDate, toDate, today, yesterday } from './util';

type Tx = PrismaService['tx'];
const BASE_ROLE = { STUDENT: 'STUDENT', TEACHER: 'TEACHER', GUARDIAN: 'GUARDIAN' } as const;

@Controller('admin/persons')
export class PersonsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Lesende Zugriffe auf Personendaten werden protokolliert (Spec Abschnitt 9). */
  @Can('masterdata.read')
  @Get()
  async list(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Query(new ZodPipe(personListQuery)) q: z.infer<typeof personListQuery>,
  ) {
    const now = today();
    const words = (q.q ?? '').split(/\s+/).filter(Boolean);
    const rows = await this.prisma.tx.person.findMany({
      where: {
        anonymizedAt: null,
        ...(q.kind ? { kind: q.kind } : {}),
        ...(q.classId
          ? {
              enrollments: {
                some: { classId: q.classId, OR: [{ toDate: null }, { toDate: { gte: now } }] },
              },
            }
          : {}),
        AND: words.map((w) => ({
          OR: [
            { firstName: { contains: w, mode: 'insensitive' as const } },
            { lastName: { contains: w, mode: 'insensitive' as const } },
            { email: { contains: w, mode: 'insensitive' as const } },
            { externalId: { contains: w, mode: 'insensitive' as const } },
          ],
        })),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        roles: { select: { role: true, classId: true } },
        user: { select: { id: true, passwordHash: true, totpEnabled: true } },
        invitations: {
          where: { usedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true },
        },
        enrollments: {
          where: { OR: [{ toDate: null }, { toDate: { gte: now } }] },
          select: { class: { select: { id: true, name: true } } },
        },
      },
    });
    const page = rows.slice(0, q.limit);
    await this.audit.record({
      tenantId,
      actorId: actor.personId,
      action: 'person.read',
      entity: 'person',
      meta: { count: page.length, kind: q.kind ?? null, hasQuery: Boolean(q.q) },
    });
    return {
      data: page.map((p) => ({
        id: p.id,
        kind: p.kind,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        externalId: p.externalId,
        className: p.enrollments[0]?.class.name ?? null,
        roles: p.roles.map((r) => r.role),
        account: p.user?.passwordHash ? 'active' : p.invitations.length > 0 ? 'invited' : 'none',
      })),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
    };
  }

  @Can('masterdata.read')
  @Get(':id')
  async detail(@TenantId() tenantId: string, @Actor() actor: Principal, @Param('id') id: string) {
    const p = await this.prisma.tx.person.findUnique({
      where: { id },
      include: {
        roles: { select: { id: true, role: true, classId: true } },
        user: { select: { email: true, passwordHash: true, totpEnabled: true, lastLoginAt: true } },
        invitations: {
          where: { usedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true, expiresAt: true },
        },
        enrollments: {
          orderBy: { fromDate: 'desc' },
          include: { class: { select: { id: true, name: true } } },
        },
        guardianLinks: {
          include: { student: { select: { id: true, firstName: true, lastName: true } } },
        },
        studentLinks: {
          include: {
            guardian: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        teacherSubjects: {
          select: { subject: { select: { id: true, code: true, name: true } } },
          orderBy: { subject: { name: 'asc' } },
        },
      },
    });
    if (!p) throw new NotFoundException({ title: 'Person nicht gefunden' });
    await this.audit.record({
      tenantId,
      actorId: actor.personId,
      action: 'person.read',
      entity: 'person',
      entityId: id,
    });
    const link = (l: {
      id: string;
      canExcuse: boolean;
      validFrom: Date;
      validTo: Date | null;
    }) => ({
      id: l.id,
      canExcuse: l.canExcuse,
      validFrom: isoDate(l.validFrom),
      validTo: isoDate(l.validTo),
    });
    return {
      id: p.id,
      kind: p.kind,
      firstName: p.firstName,
      lastName: p.lastName,
      birthDate: isoDate(p.birthDate),
      email: p.email,
      externalId: p.externalId,
      anonymized: p.anonymizedAt !== null,
      roles: p.roles,
      account: p.user
        ? {
            email: p.user.email,
            active: Boolean(p.user.passwordHash),
            twoFactor: p.user.totpEnabled,
            lastLoginAt: p.user.lastLoginAt,
          }
        : null,
      pendingInvitation: p.invitations[0] ?? null,
      enrollments: p.enrollments.map((e) => ({
        id: e.id,
        class: e.class,
        fromDate: isoDate(e.fromDate),
        toDate: isoDate(e.toDate),
      })),
      children: p.guardianLinks.map((l) => ({ ...link(l), student: l.student })),
      guardians: p.studentLinks.map((l) => ({ ...link(l), guardian: l.guardian })),
      teaching:
        p.kind === 'TEACHER'
          ? ({
              subjects: p.teacherSubjects.map((t) => t.subject),
              employmentHours: p.employmentHours,
              teachingHours: p.teachingHours,
              plannedHours: await this.plannedHours(id),
            } satisfies TeacherProfile)
          : null,
    };
  }

  /**
   * Fächer und Stundenausmaß einer Lehrkraft: Beschäftigungsausmaß (Vertrag) und davon Unterricht (Soll). Ersetzt
   * die Fächerliste vollständig.
   */
  @Can('masterdata.write')
  @Put(':id/teaching')
  async setTeaching(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(teacherProfileInput)) body: z.infer<typeof teacherProfileInput>,
  ) {
    const tx = this.prisma.tx;
    const cur = await tx.person.findUnique({
      where: { id },
      select: { kind: true, anonymizedAt: true },
    });
    if (!cur || cur.anonymizedAt) throw new NotFoundException({ title: 'Person nicht gefunden' });
    if (cur.kind !== 'TEACHER') bad('Fächer und Stundenausmaß gibt es nur für Lehrkräfte');
    const known = await tx.subject.count({ where: { id: { in: body.subjectIds } } });
    if (known !== body.subjectIds.length) bad('Fach nicht gefunden');
    await tx.person.update({
      where: { id },
      data: { employmentHours: body.employmentHours, teachingHours: body.teachingHours },
    });
    await tx.teacherSubject.deleteMany({ where: { teacherId: id } });
    if (body.subjectIds.length)
      await tx.teacherSubject.createMany({
        data: body.subjectIds.map((subjectId) => ({ tenantId, teacherId: id, subjectId })),
      });
    await this.audit.record({
      tenantId,
      actorId: actor.personId,
      action: 'person.teaching',
      entity: 'person',
      entityId: id,
      meta: { subjects: body.subjectIds.length },
    });
    return { id };
  }

  @Can('masterdata.write')
  @Post()
  async create(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Body(new ZodPipe(personInput)) body: z.infer<typeof personInput>,
  ) {
    const tx = this.prisma.tx;
    this.assertKindRules(body.kind, body.extraRoles, body.classId);
    await this.assertUnique(tx, null, body.externalId);
    const person = await tx.person.create({
      data: {
        tenantId,
        kind: body.kind,
        firstName: body.firstName,
        lastName: body.lastName,
        birthDate: body.birthDate ? toDate(body.birthDate) : null,
        externalId: body.externalId,
        email: body.email,
      },
    });
    const roles: Role[] = [
      ...(body.kind === 'STAFF' ? [] : [BASE_ROLE[body.kind]]),
      ...body.extraRoles,
    ];
    if (roles.length)
      await tx.roleAssignment.createMany({
        data: roles.map((role) => ({ tenantId, personId: person.id, role })),
      });
    if (body.classId) await this.enroll(tx, tenantId, person.id, body.classId);
    await this.audit.record({
      tenantId,
      actorId: actor.personId,
      action: 'person.create',
      entity: 'person',
      entityId: person.id,
    });
    return { id: person.id };
  }

  @Can('masterdata.write')
  @Patch(':id')
  async patch(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(personPatch)) body: z.infer<typeof personPatch>,
  ) {
    const tx = this.prisma.tx;
    const cur = await tx.person.findUnique({ where: { id }, include: { roles: true } });
    if (!cur || cur.anonymizedAt) throw new NotFoundException({ title: 'Person nicht gefunden' });
    if (body.classId !== undefined && body.classId !== null && cur.kind !== 'STUDENT')
      bad('Nur Schüler:innen haben eine Stammklasse');
    if (body.externalId !== undefined) await this.assertUnique(tx, id, body.externalId || null);
    await tx.person.update({
      where: { id },
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        birthDate:
          body.birthDate === undefined ? undefined : body.birthDate ? toDate(body.birthDate) : null,
        externalId: body.externalId === undefined ? undefined : body.externalId || null,
        email: body.email,
      },
    });
    if (body.extraRoles)
      await this.setExtraRoles(
        tx,
        tenantId,
        actor,
        cur.id,
        cur.roles.map((r) => r.role),
        body.extraRoles,
      );
    if (body.classId !== undefined) {
      await tx.enrollment.updateMany({
        where: { studentId: id, OR: [{ toDate: null }, { toDate: { gte: today() } }] },
        data: { toDate: yesterday() },
      });
      if (body.classId) await this.enroll(tx, tenantId, id, body.classId);
    }
    await this.audit.record({
      tenantId,
      actorId: actor.personId,
      action: 'person.update',
      entity: 'person',
      entityId: id,
    });
    return { id };
  }

  /** "Löschen" ist Anonymisieren (Spec Abschnitt 8): Klassenbuch-Einträge bleiben gültig, der Personenbezug verschwindet. */
  @Can('masterdata.write')
  @Delete(':id')
  @HttpCode(204)
  async anonymize(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
  ) {
    const tx = this.prisma.tx;
    await assertCanAnonymize(tx, actor.personId, id);
    await anonymizePerson(tx, id);
    await this.audit.record({
      tenantId,
      actorId: actor.personId,
      action: 'person.anonymize',
      entity: 'person',
      entityId: id,
    });
  }

  /** Wochenstunden der Lehrkraft im veröffentlichten Stundenplan (A/B-Wochen zählen halb). */
  private async plannedHours(teacherId: string) {
    const lessons = await this.prisma.tx.lesson.findMany({
      where: { timetable: { status: 'PUBLISHED' }, teachers: { some: { teacherId } } },
      select: { periodCount: true, weekPattern: true },
    });
    return lessons.reduce((sum, l) => sum + weeklyHours(l), 0);
  }

  private assertKindRules(kind: string, extraRoles: readonly string[], classId: string | null) {
    if (kind !== 'STUDENT' && classId) bad('Nur Schüler:innen haben eine Stammklasse');
    if ((kind === 'STUDENT' || kind === 'GUARDIAN') && extraRoles.length > 0)
      bad('Schüler:innen und Eltern können keine Verwaltungsrolle haben');
  }

  private async assertUnique(tx: Tx, selfId: string | null, externalId: string | null) {
    if (!externalId) return;
    const dup = await tx.person.findFirst({
      where: { externalId, ...(selfId ? { NOT: { id: selfId } } : {}) },
      select: { id: true },
    });
    if (dup) bad(`Die Schülernummer ${externalId} ist schon vergeben`);
  }

  private async enroll(tx: Tx, tenantId: string, studentId: string, classId: string) {
    if (!(await tx.schoolClass.findUnique({ where: { id: classId }, select: { id: true } })))
      bad('Klasse nicht gefunden');
    await tx.enrollment.create({ data: { tenantId, studentId, classId, fromDate: today() } });
  }

  /** Setzt PRINCIPAL/ADMIN genau auf `wanted`. Der letzte Admin und der eigene Admin-Zugang bleiben geschützt. */
  private async setExtraRoles(
    tx: Tx,
    tenantId: string,
    actor: Principal,
    personId: string,
    have: Role[],
    wanted: readonly ('PRINCIPAL' | 'ADMIN')[],
  ) {
    for (const role of ['PRINCIPAL', 'ADMIN'] as const) {
      const has = have.includes(role);
      const want = wanted.includes(role);
      if (want && !has) await tx.roleAssignment.create({ data: { tenantId, personId, role } });
      if (!want && has) {
        if (role === 'ADMIN' && personId === actor.personId)
          bad('Den eigenen Admin-Zugang kann man sich nicht entziehen');
        if (
          role === 'ADMIN' &&
          (await tx.roleAssignment.count({ where: { role: 'ADMIN', NOT: { personId } } })) === 0
        )
          bad('Es muss mindestens eine Administration bleiben');
        await tx.roleAssignment.deleteMany({ where: { personId, role } });
      }
    }
  }
}
