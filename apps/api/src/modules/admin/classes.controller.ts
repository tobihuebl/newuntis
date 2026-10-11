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
  Query,
} from '@nestjs/common';
import { classInput, classPatch, groupInput, groupMembersInput, groupPatch } from '@sp/shared';
import { z } from 'zod';
import { Can } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { bad, list, today } from './util';

const yearQuery = z.object({ schoolYearId: z.string().min(1).optional() });

@Controller('admin')
export class ClassesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private log(
    tenantId: string,
    actor: Principal,
    action: string,
    entity: string,
    entityId?: string,
  ) {
    return this.audit.record({
      tenantId,
      actorId: actor.personId,
      action,
      entity,
      entityId: entityId ?? null,
    });
  }

  private async yearId(requested?: string): Promise<string | null> {
    if (requested) return requested;
    return (
      (
        await this.prisma.tx.schoolYear.findFirst({
          where: { isCurrent: true },
          select: { id: true },
        })
      )?.id ?? null
    );
  }

  // ───────────── Klassen ─────────────
  @Can('masterdata.read')
  @Get('classes')
  async classes(@Query(new ZodPipe(yearQuery)) q: z.infer<typeof yearQuery>) {
    const schoolYearId = await this.yearId(q.schoolYearId);
    if (!schoolYearId) return list([]);
    const now = today();
    const rows = await this.prisma.tx.schoolClass.findMany({
      where: { schoolYearId },
      orderBy: { name: 'asc' },
      include: {
        homeroomTeacher: { select: { id: true, firstName: true, lastName: true } },
        enrollments: {
          where: { OR: [{ toDate: null }, { toDate: { gte: now } }] },
          select: { id: true },
        },
      },
    });
    return list(
      rows.map((c) => ({
        id: c.id,
        schoolYearId: c.schoolYearId,
        name: c.name,
        homeroomTeacher: c.homeroomTeacher,
        studentCount: c.enrollments.length,
      })),
    );
  }

  @Can('masterdata.read')
  @Get('classes/:id')
  async classDetail(@Param('id') id: string) {
    const now = today();
    const c = await this.prisma.tx.schoolClass.findUnique({
      where: { id },
      include: {
        homeroomTeacher: { select: { id: true, firstName: true, lastName: true } },
        enrollments: {
          where: { OR: [{ toDate: null }, { toDate: { gte: now } }] },
          include: {
            student: { select: { id: true, firstName: true, lastName: true, externalId: true } },
          },
        },
      },
    });
    if (!c) throw new NotFoundException({ title: 'Klasse nicht gefunden' });
    return {
      id: c.id,
      schoolYearId: c.schoolYearId,
      name: c.name,
      homeroomTeacher: c.homeroomTeacher,
      students: c.enrollments
        .map((e) => e.student)
        .sort(
          (a, b) =>
            a.lastName.localeCompare(b.lastName, 'de') ||
            a.firstName.localeCompare(b.firstName, 'de'),
        ),
    };
  }

  @Can('masterdata.write')
  @Post('classes')
  async createClass(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Body(new ZodPipe(classInput)) body: z.infer<typeof classInput>,
  ) {
    const tx = this.prisma.tx;
    if (body.homeroomTeacherId) await this.assertTeacher(body.homeroomTeacherId);
    const row = await tx.schoolClass.create({
      data: {
        tenantId,
        schoolYearId: body.schoolYearId,
        name: body.name,
        homeroomTeacherId: body.homeroomTeacherId,
      },
    });
    if (body.homeroomTeacherId) await this.syncHomeroom(tenantId, row.id, body.homeroomTeacherId);
    await this.log(tenantId, actor, 'class.create', 'class', row.id);
    return { id: row.id, name: row.name };
  }

  @Can('masterdata.write')
  @Patch('classes/:id')
  async patchClass(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(classPatch)) body: z.infer<typeof classPatch>,
  ) {
    const tx = this.prisma.tx;
    if (body.homeroomTeacherId) await this.assertTeacher(body.homeroomTeacherId);
    const row = await tx.schoolClass.update({ where: { id }, data: body });
    if (body.homeroomTeacherId !== undefined)
      await this.syncHomeroom(tenantId, id, body.homeroomTeacherId);
    await this.log(tenantId, actor, 'class.update', 'class', id);
    return { id: row.id, name: row.name };
  }

  @Can('masterdata.write')
  @Delete('classes/:id')
  @HttpCode(204)
  async deleteClass(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
  ) {
    const tx = this.prisma.tx;
    if ((await tx.enrollment.count({ where: { classId: id } })) > 0)
      bad('Die Klasse hat noch Schüler:innen (Einschreibungen)');
    await tx.roleAssignment.deleteMany({ where: { classId: id } });
    await tx.schoolClass.delete({ where: { id } });
    await this.log(tenantId, actor, 'class.delete', 'class', id);
  }

  private async assertTeacher(personId: string) {
    const p = await this.prisma.tx.person.findUnique({
      where: { id: personId },
      select: { kind: true, anonymizedAt: true },
    });
    if (!p || p.kind !== 'TEACHER' || p.anonymizedAt)
      bad('Der Klassenvorstand muss eine Lehrkraft sein');
  }

  /** Klassenvorstand ist als Rollenzuordnung (HOMEROOM mit classId) hinterlegt; sie folgt dem Feld der Klasse. */
  private async syncHomeroom(tenantId: string, classId: string, teacherId: string | null) {
    const tx = this.prisma.tx;
    await tx.roleAssignment.deleteMany({ where: { role: 'HOMEROOM', classId } });
    if (teacherId)
      await tx.roleAssignment.create({
        data: { tenantId, personId: teacherId, role: 'HOMEROOM', classId },
      });
  }

  // ───────────── Gruppen ─────────────
  @Can('masterdata.read')
  @Get('groups')
  async groups(@Query(new ZodPipe(yearQuery)) q: z.infer<typeof yearQuery>) {
    const schoolYearId = await this.yearId(q.schoolYearId);
    if (!schoolYearId) return list([]);
    const rows = await this.prisma.tx.group.findMany({
      where: { schoolYearId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
    return list(
      rows.map((g) => ({
        id: g.id,
        schoolYearId: g.schoolYearId,
        name: g.name,
        memberCount: g._count.members,
      })),
    );
  }

  @Can('masterdata.read')
  @Get('groups/:id')
  async groupDetail(@Param('id') id: string) {
    const g = await this.prisma.tx.group.findUnique({
      where: { id },
      include: {
        members: {
          include: { student: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!g) throw new NotFoundException({ title: 'Gruppe nicht gefunden' });
    return {
      id: g.id,
      name: g.name,
      schoolYearId: g.schoolYearId,
      members: g.members.map((m) => m.student),
    };
  }

  @Can('masterdata.write')
  @Post('groups')
  async createGroup(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Body(new ZodPipe(groupInput)) body: z.infer<typeof groupInput>,
  ) {
    const row = await this.prisma.tx.group.create({ data: { tenantId, ...body } });
    await this.log(tenantId, actor, 'group.create', 'group', row.id);
    return { id: row.id, name: row.name };
  }

  @Can('masterdata.write')
  @Patch('groups/:id')
  async patchGroup(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(groupPatch)) body: z.infer<typeof groupPatch>,
  ) {
    const row = await this.prisma.tx.group.update({ where: { id }, data: body });
    await this.log(tenantId, actor, 'group.update', 'group', id);
    return { id: row.id, name: row.name };
  }

  @Can('masterdata.write')
  @Delete('groups/:id')
  @HttpCode(204)
  async deleteGroup(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
  ) {
    await this.prisma.tx.groupMember.deleteMany({ where: { groupId: id } });
    await this.prisma.tx.group.delete({ where: { id } });
    await this.log(tenantId, actor, 'group.delete', 'group', id);
  }

  @Can('masterdata.write')
  @Post('groups/:id/members')
  async addMembers(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(groupMembersInput)) body: z.infer<typeof groupMembersInput>,
  ) {
    const tx = this.prisma.tx;
    const students = await tx.person.findMany({
      where: { id: { in: body.studentIds }, kind: 'STUDENT', anonymizedAt: null },
      select: { id: true },
    });
    if (students.length !== new Set(body.studentIds).size)
      bad('Mindestens eine Person ist keine (aktive) Schüler:in');
    const res = await tx.groupMember.createMany({
      data: students.map((s) => ({ tenantId, groupId: id, studentId: s.id })),
      skipDuplicates: true,
    });
    await this.log(tenantId, actor, 'group.members.add', 'group', id);
    return { added: res.count };
  }

  @Can('masterdata.write')
  @Delete('groups/:id/members/:studentId')
  @HttpCode(204)
  async removeMember(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
    @Param('studentId') studentId: string,
  ) {
    await this.prisma.tx.groupMember.deleteMany({ where: { groupId: id, studentId } });
    await this.log(tenantId, actor, 'group.members.remove', 'group', id);
  }
}
