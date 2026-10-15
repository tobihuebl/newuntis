import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  DEFAULT_PERIODS,
  freeDayInput,
  periodInput,
  periodPatch,
  roomInput,
  roomPatch,
  schoolYearInput,
  schoolYearPatch,
  subjectInput,
  subjectPatch,
} from '@sp/shared';
import type { z } from 'zod';
import { Can } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { semestersOf } from '../timetable/semesters';
import { bad, isoDate, list, toDate } from './util';

type Tx = PrismaService['tx'];

/** Schuljahr, Ferien, Raster, Fächer und Räume. Lesen: Direktion und Administration, Schreiben: Administration. */
@Controller('admin')
export class SchoolController {
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

  // ───────────── Schuljahr ─────────────
  @Can('masterdata.read')
  @Get('school-years')
  async schoolYears() {
    const rows = await this.prisma.tx.schoolYear.findMany({
      orderBy: { startsOn: 'desc' },
      include: { _count: { select: { classes: true, freeDays: true } } },
    });
    return list(await Promise.all(rows.map((r) => this.yearDto(r))));
  }

  @Can('masterdata.read')
  @Get('school-years/:id')
  async schoolYear(@Param('id') id: string) {
    const row = await this.prisma.tx.schoolYear.findUnique({
      where: { id },
      include: { freeDays: { orderBy: { fromDate: 'asc' } } },
    });
    if (!row) throw new NotFoundException({ title: 'Schuljahr nicht gefunden' });
    return {
      ...(await this.yearDto(row)),
      freeDays: row.freeDays.map((f) => ({
        id: f.id,
        fromDate: isoDate(f.fromDate),
        toDate: isoDate(f.toDate),
        label: f.label,
      })),
    };
  }

  @Can('masterdata.write')
  @Post('school-years')
  async createSchoolYear(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Body(new ZodPipe(schoolYearInput)) body: z.infer<typeof schoolYearInput>,
  ) {
    const tx = this.prisma.tx;
    if (body.isCurrent)
      await tx.schoolYear.updateMany({ data: { isCurrent: false }, where: { isCurrent: true } });
    const row = await tx.schoolYear.create({
      data: {
        tenantId,
        name: body.name,
        startsOn: toDate(body.startsOn),
        endsOn: toDate(body.endsOn),
        isCurrent: body.isCurrent,
        secondSemesterFrom: body.secondSemesterFrom ? toDate(body.secondSemesterFrom) : null,
      },
    });
    await this.log(tenantId, actor, 'schoolYear.create', 'schoolYear', row.id);
    return this.yearDto(row);
  }

  @Can('masterdata.write')
  @Patch('school-years/:id')
  async patchSchoolYear(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(schoolYearPatch)) body: z.infer<typeof schoolYearPatch>,
  ) {
    const tx = this.prisma.tx;
    const current = await tx.schoolYear.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ title: 'Schuljahr nicht gefunden' });
    const startsOn = body.startsOn ?? isoDate(current.startsOn)!;
    const endsOn = body.endsOn ?? isoDate(current.endsOn)!;
    if (startsOn >= endsOn) bad('Beginn muss vor dem Ende liegen');
    const second =
      body.secondSemesterFrom !== undefined
        ? body.secondSemesterFrom
        : isoDate(current.secondSemesterFrom);
    if (second !== null && (second <= startsOn || second > endsOn))
      bad('Das 2. Semester muss im Schuljahr beginnen');
    if (body.isCurrent)
      await tx.schoolYear.updateMany({
        data: { isCurrent: false },
        where: { isCurrent: true, NOT: { id } },
      });
    // Schuljahreswechsel (SD-05): Klassenvorstand-Rollen gelten nur für Klassen des aktuellen Schuljahres
    if (body.isCurrent && !current.isCurrent)
      await tx.roleAssignment.deleteMany({
        where: { role: 'HOMEROOM', class: { schoolYearId: { not: id } } },
      });
    const row = await tx.schoolYear.update({
      where: { id },
      data: {
        name: body.name,
        startsOn: toDate(startsOn),
        endsOn: toDate(endsOn),
        isCurrent: body.isCurrent,
        secondSemesterFrom: second ? toDate(second) : null,
      },
    });
    await this.log(tenantId, actor, 'schoolYear.update', 'schoolYear', id);
    return this.yearDto(row);
  }

  @Can('masterdata.write')
  @Delete('school-years/:id')
  @HttpCode(204)
  async deleteSchoolYear(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
  ) {
    await this.prisma.tx.schoolFreeDay.deleteMany({ where: { schoolYearId: id } });
    await this.prisma.tx.schoolYear.delete({ where: { id } });
    await this.log(tenantId, actor, 'schoolYear.delete', 'schoolYear', id);
  }

  @Can('masterdata.write')
  @Post('school-years/:id/free-days')
  async addFreeDay(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(freeDayInput)) body: z.infer<typeof freeDayInput>,
  ) {
    const row = await this.prisma.tx.schoolFreeDay.create({
      data: {
        tenantId,
        schoolYearId: id,
        fromDate: toDate(body.fromDate),
        toDate: toDate(body.toDate),
        label: body.label,
      },
    });
    await this.log(tenantId, actor, 'schoolFreeDay.create', 'schoolFreeDay', row.id);
    return { id: row.id, fromDate: body.fromDate, toDate: body.toDate, label: row.label };
  }

  @Can('masterdata.write')
  @Delete('school-years/:yearId/free-days/:id')
  @HttpCode(204)
  async deleteFreeDay(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('yearId') yearId: string,
    @Param('id') id: string,
  ) {
    const res = await this.prisma.tx.schoolFreeDay.deleteMany({
      where: { id, schoolYearId: yearId },
    });
    if (res.count === 0) throw new NotFoundException({ title: 'Eintrag nicht gefunden' });
    await this.log(tenantId, actor, 'schoolFreeDay.delete', 'schoolFreeDay', id);
  }

  /** Mit eingetragenem und wirksamem Beginn des 2. Semesters (sonst aus den Semesterferien, ADR 0022). */
  private async yearDto(r: {
    id: string;
    name: string;
    startsOn: Date;
    endsOn: Date;
    isCurrent: boolean;
    secondSemesterFrom: Date | null;
    _count?: { classes: number; freeDays: number };
  }) {
    const semesters = await semestersOf(this.prisma.tx, r);
    return {
      id: r.id,
      name: r.name,
      startsOn: isoDate(r.startsOn),
      endsOn: isoDate(r.endsOn),
      isCurrent: r.isCurrent,
      secondSemesterFrom: isoDate(r.secondSemesterFrom),
      semesters,
      classCount: r._count?.classes,
      freeDayCount: r._count?.freeDays,
    };
  }

  // ───────────── Raster ─────────────
  @Can('masterdata.read')
  @Get('periods')
  async periods() {
    return list(
      await this.prisma.tx.period.findMany({
        orderBy: { number: 'asc' },
        select: { id: true, number: true, startTime: true, endTime: true, blocksDouble: true },
      }),
    );
  }

  @Can('masterdata.write')
  @Post('periods')
  async createPeriod(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Body(new ZodPipe(periodInput)) body: z.infer<typeof periodInput>,
  ) {
    const tx = this.prisma.tx;
    await this.assertGrid(tx, { ...body, id: undefined });
    const row = await tx.period.create({ data: { tenantId, ...body } });
    await this.log(tenantId, actor, 'period.create', 'period', row.id);
    return row;
  }

  @Can('masterdata.write')
  @Patch('periods/:id')
  async patchPeriod(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(periodPatch)) body: z.infer<typeof periodPatch>,
  ) {
    const tx = this.prisma.tx;
    const cur = await tx.period.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException({ title: 'Stunde nicht gefunden' });
    await this.assertGrid(tx, {
      id,
      number: body.number ?? cur.number,
      startTime: body.startTime ?? cur.startTime,
      endTime: body.endTime ?? cur.endTime,
    });
    const row = await tx.period.update({ where: { id }, data: body });
    await this.log(tenantId, actor, 'period.update', 'period', id);
    return row;
  }

  @Can('masterdata.write')
  @Delete('periods/:id')
  @HttpCode(204)
  async deletePeriod(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
  ) {
    await this.prisma.tx.period.delete({ where: { id } });
    await this.log(tenantId, actor, 'period.delete', 'period', id);
  }

  /** Legt das Standardraster an, solange noch keine Stunden existieren. */
  @Can('masterdata.write')
  @Post('periods/default-template')
  async defaultTemplate(@TenantId() tenantId: string, @Actor() actor: Principal) {
    const tx = this.prisma.tx;
    if ((await tx.period.count()) > 0) bad('Es gibt bereits ein Raster');
    await tx.period.createMany({ data: DEFAULT_PERIODS.map((p) => ({ tenantId, ...p })) });
    await this.log(tenantId, actor, 'period.template', 'period');
    return list(await tx.period.findMany({ orderBy: { number: 'asc' } }));
  }

  /** Die Stunden müssen mit steigender Nummer zeitlich aufeinander folgen und dürfen sich nicht überlappen. */
  private async assertGrid(
    tx: Tx,
    change: { id?: string | undefined; number: number; startTime: string; endTime: string },
  ) {
    const others = (
      await tx.period.findMany({
        select: { id: true, number: true, startTime: true, endTime: true },
      })
    ).filter((p) => p.id !== change.id);
    if (others.some((p) => p.number === change.number))
      throw new ConflictException({ title: `Stunde ${change.number} gibt es schon` });
    const all = [...others, change].sort((a, b) => a.number - b.number);
    for (let i = 1; i < all.length; i++) {
      if (all[i - 1]!.endTime > all[i]!.startTime)
        bad(`Stunde ${all[i]!.number} beginnt vor dem Ende von Stunde ${all[i - 1]!.number}`);
    }
  }

  // ───────────── Fächer ─────────────
  @Can('masterdata.read')
  @Get('subjects')
  async subjects() {
    return list(
      await this.prisma.tx.subject.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true, color: true },
      }),
    );
  }

  @Can('masterdata.write')
  @Post('subjects')
  async createSubject(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Body(new ZodPipe(subjectInput)) body: z.infer<typeof subjectInput>,
  ) {
    const row = await this.prisma.tx.subject.create({ data: { tenantId, ...body } });
    await this.log(tenantId, actor, 'subject.create', 'subject', row.id);
    return { id: row.id, name: row.name, code: row.code, color: row.color };
  }

  @Can('masterdata.write')
  @Patch('subjects/:id')
  async patchSubject(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(subjectPatch)) body: z.infer<typeof subjectPatch>,
  ) {
    const row = await this.prisma.tx.subject.update({ where: { id }, data: body });
    await this.log(tenantId, actor, 'subject.update', 'subject', id);
    return { id: row.id, name: row.name, code: row.code, color: row.color };
  }

  @Can('masterdata.write')
  @Delete('subjects/:id')
  @HttpCode(204)
  async deleteSubject(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
  ) {
    await this.prisma.tx.subject.delete({ where: { id } });
    await this.log(tenantId, actor, 'subject.delete', 'subject', id);
  }

  // ───────────── Räume ─────────────
  @Can('masterdata.read')
  @Get('rooms')
  async rooms() {
    return list(
      await this.prisma.tx.room.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, capacity: true, kind: true },
      }),
    );
  }

  @Can('masterdata.write')
  @Post('rooms')
  async createRoom(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Body(new ZodPipe(roomInput)) body: z.infer<typeof roomInput>,
  ) {
    const row = await this.prisma.tx.room.create({ data: { tenantId, ...body } });
    await this.log(tenantId, actor, 'room.create', 'room', row.id);
    return { id: row.id, name: row.name, capacity: row.capacity, kind: row.kind };
  }

  @Can('masterdata.write')
  @Patch('rooms/:id')
  async patchRoom(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(roomPatch)) body: z.infer<typeof roomPatch>,
  ) {
    const row = await this.prisma.tx.room.update({ where: { id }, data: body });
    await this.log(tenantId, actor, 'room.update', 'room', id);
    return { id: row.id, name: row.name, capacity: row.capacity, kind: row.kind };
  }

  @Can('masterdata.write')
  @Delete('rooms/:id')
  @HttpCode(204)
  async deleteRoom(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
  ) {
    await this.prisma.tx.room.delete({ where: { id } });
    await this.log(tenantId, actor, 'room.delete', 'room', id);
  }
}
