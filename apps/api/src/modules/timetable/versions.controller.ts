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
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Tx } from '@sp/db';
import {
  hasHardConflicts,
  lessonInput,
  lessonPinInput,
  requirementCoverage,
  lessonPatchInput,
  mondayOf,
  publishInput,
  requirementInput,
  requirementPatchInput,
  requirementsImportInput,
  type RequirementsImportResponse,
  validateTimetable,
  versionCreateInput,
  versionPatchInput,
  type LessonRule,
} from '@sp/shared';
import { z } from 'zod';
import { Can } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { bad } from '../admin/util';
import { PrismaService } from '../prisma/prisma.service';
import {
  asDate,
  fullConflicts,
  iso,
  lessonInclude,
  loadRules,
  loadValidationContext,
  toRule,
  todayIn,
} from './data';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OccurrencesService } from './occurrences.service';
import { parseRequirementsCsv } from './requirements-csv';

const validateInput = z.object({
  /** Optional: eine geänderte oder neue Regel live prüfen (nur ihre Konflikte). */
  change: z
    .object({
      id: z.string().min(1),
      weekday: z.number().int(),
      periodStart: z.number().int(),
      periodCount: z.number().int(),
      weekPattern: z.enum(['EVERY', 'A', 'B']),
      subjectId: z.string(),
      classId: z.string().nullable(),
      groupId: z.string().nullable(),
      roomId: z.string().nullable(),
      teacherIds: z.array(z.string()),
    })
    .optional(),
});

/**
 * Stundenplan-Versionen (Spec Abschnitt 10). Bearbeiten: Administration (timetable.edit).
 * Ansehen, Prüfen und Veröffentlichen ("freigeben"): auch Direktion (timetable.publish).
 */
@Controller('admin/timetable-versions')
export class VersionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly occurrences: OccurrencesService,
    private readonly events: EventsService,
    private readonly notifications: NotificationsService,
  ) {}

  private log(
    tenantId: string,
    actor: Principal,
    action: string,
    entityId: string,
    meta?: Record<string, string | number | null>,
  ) {
    return this.audit.record({
      tenantId,
      actorId: actor.personId,
      action,
      entity: 'timetableVersion',
      entityId,
      ...(meta ? { meta } : {}),
    });
  }

  @Can('timetable.publish')
  @Get()
  async list() {
    const rows = await this.prisma.tx.timetableVersion.findMany({
      orderBy: [{ createdAt: 'desc' }],
      include: {
        schoolYear: { select: { id: true, name: true } },
        _count: { select: { lessons: true } },
      },
    });
    return {
      data: rows.map((v) => ({
        id: v.id,
        name: v.name,
        status: v.status,
        validFrom: iso(v.validFrom),
        publishedAt: v.publishedAt,
        schoolYear: v.schoolYear,
        lessonCount: v._count.lessons,
      })),
      nextCursor: null,
    };
  }

  /** Entwurf anlegen, optional als Kopie einer bestehenden Version (Regeln und Soll-Stunden). */
  @Can('timetable.edit')
  @Post()
  async create(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Body(new ZodPipe(versionCreateInput)) body: z.infer<typeof versionCreateInput>,
  ) {
    const tx = this.prisma.tx;
    const year = await tx.schoolYear.findUnique({ where: { id: body.schoolYearId } });
    if (!year) bad('Schuljahr nicht gefunden');
    const tz = (
      await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })
    ).timezone;
    const today = todayIn(tz);
    const validFrom = iso(year.startsOn) > today ? iso(year.startsOn) : today;
    const version = await tx.timetableVersion.create({
      data: { tenantId, schoolYearId: year.id, name: body.name, validFrom: asDate(validFrom) },
    });
    if (body.copyFromVersionId) {
      const source = await tx.timetableVersion.findUnique({
        where: { id: body.copyFromVersionId },
        include: { lessons: { include: lessonInclude }, requirements: true },
      });
      if (!source) bad('Vorlage nicht gefunden');
      for (const l of source.lessons) {
        const copy = await tx.lesson.create({
          data: {
            tenantId,
            versionId: version.id,
            subjectId: l.subjectId,
            classId: l.classId,
            groupId: l.groupId,
            roomId: l.roomId,
            weekday: l.weekday,
            periodStart: l.periodStart,
            periodCount: l.periodCount,
            weekPattern: l.weekPattern,
            pinned: l.pinned,
          },
        });
        if (l.teachers.length)
          await tx.lessonTeacher.createMany({
            data: l.teachers.map((t) => ({ tenantId, lessonId: copy.id, teacherId: t.teacherId })),
          });
      }
      if (source.requirements.length) {
        await tx.lessonRequirement.createMany({
          data: source.requirements.map((r) => ({
            tenantId,
            versionId: version.id,
            subjectId: r.subjectId,
            classId: r.classId,
            groupId: r.groupId,
            teacherId: r.teacherId,
            hoursPerWeek: r.hoursPerWeek,
            preferDouble: r.preferDouble,
          })),
        });
      }
    }
    await this.log(tenantId, actor, 'timetableVersion.create', version.id);
    return { id: version.id };
  }

  /** Alles, was der Editor braucht: Regeln, Soll-Stunden, Raster, Namen und Prüfkontext. */
  @Can('timetable.publish')
  @Get(':id')
  async detail(@TenantId() tenantId: string, @Param('id') id: string) {
    const tx = this.prisma.tx;
    const v = await tx.timetableVersion.findUnique({
      where: { id },
      include: { schoolYear: true, requirements: true },
    });
    if (!v) throw new NotFoundException({ title: 'Version nicht gefunden' });
    const tz = (
      await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })
    ).timezone;
    const [lessons, context, subjects, classes, groups, rooms, teachers] = await Promise.all([
      loadRules(tx, id),
      loadValidationContext(tx, v.schoolYearId, todayIn(tz)),
      tx.subject.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true, color: true },
      }),
      tx.schoolClass.findMany({
        where: { schoolYearId: v.schoolYearId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      tx.group.findMany({
        where: { schoolYearId: v.schoolYearId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      tx.room.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, capacity: true },
      }),
      tx.person.findMany({
        where: { kind: 'TEACHER', anonymizedAt: null },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    return {
      version: {
        id: v.id,
        name: v.name,
        status: v.status,
        validFrom: iso(v.validFrom),
        publishedAt: v.publishedAt,
        schoolYear: {
          id: v.schoolYear.id,
          name: v.schoolYear.name,
          startsOn: iso(v.schoolYear.startsOn),
          endsOn: iso(v.schoolYear.endsOn),
        },
      },
      lessons,
      requirements: v.requirements.map((r) => ({
        id: r.id,
        subjectId: r.subjectId,
        classId: r.classId,
        groupId: r.groupId,
        teacherId: r.teacherId,
        hoursPerWeek: r.hoursPerWeek,
        preferDouble: r.preferDouble,
      })),
      periods: context.periods,
      context,
      subjects,
      classes,
      groups,
      rooms,
      teachers,
      conflicts: await fullConflicts(tx, tenantId, v.schoolYearId, lessons, context),
      coverage: requirementCoverage(v.requirements, lessons),
    };
  }

  @Can('timetable.edit')
  @Patch(':id')
  async patch(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(versionPatchInput)) body: z.infer<typeof versionPatchInput>,
  ) {
    await this.draft(id);
    await this.prisma.tx.timetableVersion.update({ where: { id }, data: { name: body.name } });
    await this.log(tenantId, actor, 'timetableVersion.update', id);
    return { id };
  }

  /** Nur Entwürfe sind löschbar; veröffentlichte und archivierte Versionen tragen erzeugte Termine. */
  @Can('timetable.edit')
  @Delete(':id')
  @HttpCode(204)
  async remove(@TenantId() tenantId: string, @Actor() actor: Principal, @Param('id') id: string) {
    await this.draft(id);
    await this.prisma.tx.timetableVersion.delete({ where: { id } }); // Regeln und Soll-Stunden per Cascade
    await this.log(tenantId, actor, 'timetableVersion.delete', id);
  }

  // ───────────── Regeln ─────────────
  @Can('timetable.edit')
  @Post(':id/lessons')
  async createLesson(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body(new ZodPipe(lessonInput)) body: z.infer<typeof lessonInput>,
  ) {
    const tx = this.prisma.tx;
    const v = await this.draft(id);
    await this.assertRefs(tx, v.schoolYearId, body);
    const row = await tx.lesson.create({
      data: {
        tenantId,
        versionId: id,
        subjectId: body.subjectId,
        classId: body.classId,
        groupId: body.groupId,
        roomId: body.roomId,
        weekday: body.weekday,
        periodStart: body.periodStart,
        periodCount: body.periodCount,
        weekPattern: body.weekPattern,
      },
    });
    if (body.teacherIds.length)
      await tx.lessonTeacher.createMany({
        data: [...new Set(body.teacherIds)].map((teacherId) => ({
          tenantId,
          lessonId: row.id,
          teacherId,
        })),
      });
    return this.withConflicts(tx, tenantId, v.schoolYearId, id, row.id);
  }

  /** Optimistische Sperre: Weicht `version` vom gespeicherten Stand ab, kommt 409 mit dem aktuellen Stand statt stillem Überschreiben. */
  @Can('timetable.edit')
  @Patch(':id/lessons/:lessonId')
  async patchLesson(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @Body(new ZodPipe(lessonPatchInput)) body: z.infer<typeof lessonPatchInput>,
  ) {
    const tx = this.prisma.tx;
    const v = await this.draft(id);
    const cur = await tx.lesson.findFirst({
      where: { id: lessonId, versionId: id },
      include: lessonInclude,
    });
    if (!cur) throw new NotFoundException({ title: 'Regel nicht gefunden' });
    if (cur.version !== body.version)
      throw new ConflictException({
        title: 'Die Regel wurde inzwischen geändert',
        current: toRule(cur),
      });
    const next = {
      subjectId: body.subjectId ?? cur.subjectId,
      classId: body.classId !== undefined ? body.classId : cur.classId,
      groupId: body.groupId !== undefined ? body.groupId : cur.groupId,
      roomId: body.roomId !== undefined ? body.roomId : cur.roomId,
      teacherIds: body.teacherIds ?? cur.teachers.map((t) => t.teacherId),
    };
    if (!next.classId === !next.groupId) bad('Genau eine Klasse oder Gruppe angeben');
    await this.assertRefs(tx, v.schoolYearId, next);
    // updateMany mit Versionsbedingung: auch gleichzeitige Anfragen können sich nicht überschreiben
    const res = await tx.lesson.updateMany({
      where: { id: lessonId, version: body.version },
      data: {
        subjectId: next.subjectId,
        classId: next.classId,
        groupId: next.groupId,
        roomId: next.roomId,
        weekday: body.weekday,
        periodStart: body.periodStart,
        periodCount: body.periodCount,
        weekPattern: body.weekPattern,
        version: { increment: 1 },
      },
    });
    if (res.count === 0)
      throw new ConflictException({ title: 'Die Regel wurde inzwischen geändert' });
    if (body.teacherIds) {
      await tx.lessonTeacher.deleteMany({ where: { lessonId } });
      if (body.teacherIds.length)
        await tx.lessonTeacher.createMany({
          data: [...new Set(body.teacherIds)].map((teacherId) => ({
            tenantId,
            lessonId,
            teacherId,
          })),
        });
    }
    return this.withConflicts(tx, tenantId, v.schoolYearId, id, lessonId);
  }

  /** Festpinnen (M7, Teilplanung): Der Assistent lässt diese Stunde bei einem Lauf unverändert. */
  @Can('timetable.edit')
  @Patch(':id/lessons/:lessonId/pin')
  async pinLesson(
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @Body(new ZodPipe(lessonPinInput)) body: z.infer<typeof lessonPinInput>,
  ) {
    await this.draft(id);
    const res = await this.prisma.tx.lesson.updateMany({
      where: { id: lessonId, versionId: id },
      data: { pinned: body.pinned },
    });
    if (res.count === 0) throw new NotFoundException({ title: 'Regel nicht gefunden' });
    return { id: lessonId, pinned: body.pinned };
  }

  @Can('timetable.edit')
  @Delete(':id/lessons/:lessonId')
  @HttpCode(204)
  async deleteLesson(@Param('id') id: string, @Param('lessonId') lessonId: string) {
    await this.draft(id);
    const res = await this.prisma.tx.lesson.deleteMany({ where: { id: lessonId, versionId: id } });
    if (res.count === 0) throw new NotFoundException({ title: 'Regel nicht gefunden' });
  }

  // ───────────── Soll-Stunden ─────────────
  @Can('timetable.edit')
  @Post(':id/requirements')
  async createRequirement(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body(new ZodPipe(requirementInput)) body: z.infer<typeof requirementInput>,
  ) {
    const tx = this.prisma.tx;
    const v = await this.draft(id);
    await this.assertRefs(tx, v.schoolYearId, {
      ...body,
      roomId: null,
      teacherIds: [body.teacherId],
    });
    const row = await tx.lessonRequirement.create({ data: { tenantId, versionId: id, ...body } });
    return { id: row.id };
  }

  /**
   * Lehrfächerverteilung als CSV (M7): Vorschau mit Fehlern je Zeile; Übernehmen nur ohne Fehler und ersetzt alle
   * Soll-Stunden dieses Entwurfs.
   */
  @Can('timetable.edit')
  @Post(':id/requirements/import')
  @HttpCode(200)
  async importRequirements(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(requirementsImportInput)) body: z.infer<typeof requirementsImportInput>,
  ): Promise<RequirementsImportResponse> {
    const tx = this.prisma.tx;
    const v = await this.draft(id);
    const [teachers, subjects, classes, groups] = await Promise.all([
      tx.person.findMany({
        where: { kind: 'TEACHER', anonymizedAt: null },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
      tx.subject.findMany({ select: { id: true, name: true, code: true } }),
      tx.schoolClass.findMany({
        where: { schoolYearId: v.schoolYearId },
        select: { id: true, name: true },
      }),
      tx.group.findMany({
        where: { schoolYearId: v.schoolYearId },
        select: { id: true, name: true },
      }),
    ]);
    const { rows, missingColumns } = parseRequirementsCsv(body.csv, {
      teachers,
      subjects,
      classes,
      groups,
    });
    const invalid = rows.filter((r) => r.errors.length).length;
    const commit = body.commit && !missingColumns.length && invalid === 0 && rows.length > 0;
    if (commit) {
      await tx.lessonRequirement.deleteMany({ where: { versionId: id } });
      await tx.lessonRequirement.createMany({
        data: rows.map((r) => ({
          tenantId,
          versionId: id,
          subjectId: r.subjectId!,
          classId: r.classId,
          groupId: r.groupId,
          teacherId: r.teacherId!,
          hoursPerWeek: r.hoursPerWeek!,
          preferDouble: r.preferDouble,
        })),
      });
      await this.log(tenantId, actor, 'timetableVersion.requirements.import', id, {
        rows: rows.length,
      });
    }
    return {
      missingColumns,
      rows: rows.map((r) => ({
        line: r.line,
        raw: r.raw,
        preferDouble: r.preferDouble,
        errors: r.errors,
      })),
      valid: rows.length - invalid,
      invalid,
      committed: commit,
    };
  }

  @Can('timetable.edit')
  @Patch(':id/requirements/:reqId')
  async patchRequirement(
    @Param('id') id: string,
    @Param('reqId') reqId: string,
    @Body(new ZodPipe(requirementPatchInput)) body: z.infer<typeof requirementPatchInput>,
  ) {
    const v = await this.draft(id);
    if (body.teacherId)
      await this.assertRefs(this.prisma.tx, v.schoolYearId, {
        subjectId: null,
        classId: null,
        groupId: null,
        roomId: null,
        teacherIds: [body.teacherId],
      });
    const res = await this.prisma.tx.lessonRequirement.updateMany({
      where: { id: reqId, versionId: id },
      data: body,
    });
    if (res.count === 0) throw new NotFoundException({ title: 'Soll-Stunde nicht gefunden' });
    return { id: reqId };
  }

  @Can('timetable.edit')
  @Delete(':id/requirements/:reqId')
  @HttpCode(204)
  async deleteRequirement(@Param('id') id: string, @Param('reqId') reqId: string) {
    await this.draft(id);
    const res = await this.prisma.tx.lessonRequirement.deleteMany({
      where: { id: reqId, versionId: id },
    });
    if (res.count === 0) throw new NotFoundException({ title: 'Soll-Stunde nicht gefunden' });
  }

  // ───────────── Prüfen und Veröffentlichen ─────────────
  @Can('timetable.publish')
  @Post(':id/validate')
  @HttpCode(200)
  async validate(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body(new ZodPipe(validateInput)) body: z.infer<typeof validateInput>,
  ) {
    const tx = this.prisma.tx;
    const v = await tx.timetableVersion.findUnique({ where: { id } });
    if (!v) throw new NotFoundException({ title: 'Version nicht gefunden' });
    const tz = (
      await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })
    ).timezone;
    const [lessons, ctx] = await Promise.all([
      loadRules(tx, id),
      loadValidationContext(tx, v.schoolYearId, todayIn(tz)),
    ]);
    const conflicts = await fullConflicts(
      tx,
      tenantId,
      v.schoolYearId,
      lessons,
      ctx,
      body.change ? { lesson: body.change as LessonRule } : undefined,
    );
    return {
      conflicts,
      hard: conflicts.filter((c) => c.severity === 'hard').length,
      soft: conflicts.filter((c) => c.severity === 'soft').length,
    };
  }

  /**
   * Veröffentlichen (Spec Abschnitt 10): Vollprüfung, harte Konflikte blockieren. Gültig ab frühestens heute und
   * im Schuljahr. Die bisher veröffentlichte Version wird archiviert (gilt weiter für die Tage davor), danach werden
   * die Termine des gleitenden Fensters erzeugt. Alles in einer Transaktion.
   */
  @Can('timetable.publish')
  @Post(':id/publish')
  @HttpCode(200)
  async publish(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(publishInput)) body: z.infer<typeof publishInput>,
  ) {
    const tx = this.prisma.tx;
    const v = await this.draft(id);
    const year = await tx.schoolYear.findUniqueOrThrow({ where: { id: v.schoolYearId } });
    const tz = (
      await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })
    ).timezone;
    if (body.validFrom < todayIn(tz)) bad('"Gültig ab" darf nicht in der Vergangenheit liegen');
    if (body.validFrom > iso(year.endsOn)) bad('"Gültig ab" liegt nach dem Ende des Schuljahres');
    const [lessons, ctx] = await Promise.all([
      loadRules(tx, id),
      loadValidationContext(tx, v.schoolYearId, todayIn(tz)),
    ]);
    if (lessons.length === 0) bad('Die Version enthält keine Regeln');
    const conflicts = validateTimetable(lessons, ctx);
    if (hasHardConflicts(conflicts))
      throw new UnprocessableEntityException({
        title: 'Harte Konflikte verhindern die Veröffentlichung',
        conflicts: conflicts.filter((c) => c.severity === 'hard'),
      });
    // Soll gegen Ist (M7): zu wenige oder zu viele Stunden nur mit ausdrücklicher Bestätigung
    const requirements = await tx.lessonRequirement.findMany({ where: { versionId: id } });
    const coverage = requirementCoverage(requirements, lessons).filter((c) => c.diff !== 0);
    if (coverage.length && !body.acceptCoverage)
      throw new UnprocessableEntityException({
        title: 'Soll und Ist stimmen nicht überein',
        code: 'COVERAGE',
        coverage,
      });

    await tx.timetableVersion.updateMany({
      where: { status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    });
    await tx.timetableVersion.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        validFrom: asDate(body.validFrom),
        publishedAt: new Date(),
        publishedById: actor.personId,
      },
    });
    const generated = await this.occurrences.generateWindow(tx, tenantId);
    await this.events.emit(tx, tenantId, 'timetable.published', [id]);
    // "Stundenplan geändert ab <Datum>" an alle Personen der Schule mit Konto (Spec Abschnitt 10, Schritt 5)
    const people = await tx.user.findMany({
      where: { person: { anonymizedAt: null } },
      select: { personId: true },
    });
    const [y, m, d] = body.validFrom.split('-');
    await this.notifications.emit(
      tx,
      tenantId,
      'timetable.published',
      people.map((p) => p.personId),
      { params: { date: `${d}.${m}.${y}` }, url: `/plan?from=${mondayOf(body.validFrom)}` },
    );
    await this.log(tenantId, actor, 'timetableVersion.publish', id, {
      validFrom: body.validFrom,
      created: generated.created,
      deleted: generated.deleted,
    });
    return {
      id,
      status: 'PUBLISHED',
      validFrom: body.validFrom,
      warnings: conflicts.filter((c) => c.severity === 'soft').length,
      generated,
    };
  }

  // ───────────── Hilfen ─────────────
  private async draft(id: string) {
    const v = await this.prisma.tx.timetableVersion.findUnique({ where: { id } });
    if (!v) throw new NotFoundException({ title: 'Version nicht gefunden' });
    if (v.status !== 'DRAFT')
      throw new ConflictException({
        title: 'Veröffentlichte Versionen sind schreibgeschützt. Lege einen Entwurf als Kopie an.',
      });
    return v;
  }

  /** Fach, Klasse/Gruppe (im Schuljahr der Version), Raum und Lehrkräfte müssen existieren und passen. */
  private async assertRefs(
    tx: Tx,
    schoolYearId: string,
    r: {
      subjectId: string | null;
      classId: string | null;
      groupId: string | null;
      roomId: string | null;
      teacherIds: string[];
    },
  ) {
    const [subject, cls, group, room, teachers] = await Promise.all([
      r.subjectId
        ? tx.subject.findUnique({ where: { id: r.subjectId }, select: { id: true } })
        : Promise.resolve({ id: '' }),
      r.classId
        ? tx.schoolClass.findUnique({ where: { id: r.classId }, select: { schoolYearId: true } })
        : Promise.resolve(null),
      r.groupId
        ? tx.group.findUnique({ where: { id: r.groupId }, select: { schoolYearId: true } })
        : Promise.resolve(null),
      r.roomId
        ? tx.room.findUnique({ where: { id: r.roomId }, select: { id: true } })
        : Promise.resolve({ id: '' }),
      r.teacherIds.length
        ? tx.person.findMany({
            where: { id: { in: r.teacherIds }, kind: 'TEACHER', anonymizedAt: null },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);
    if (!subject) bad('Fach nicht gefunden');
    if (r.classId && cls?.schoolYearId !== schoolYearId)
      bad('Klasse nicht gefunden oder aus einem anderen Schuljahr');
    if (r.groupId && group?.schoolYearId !== schoolYearId)
      bad('Gruppe nicht gefunden oder aus einem anderen Schuljahr');
    if (!room) bad('Raum nicht gefunden');
    if (teachers.length !== new Set(r.teacherIds).size)
      bad('Mindestens eine Person ist keine (aktive) Lehrkraft');
  }

  private async withConflicts(
    tx: Tx,
    tenantId: string,
    schoolYearId: string,
    versionId: string,
    lessonId: string,
  ) {
    const tz = (
      await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })
    ).timezone;
    const [lessons, ctx] = await Promise.all([
      loadRules(tx, versionId),
      loadValidationContext(tx, schoolYearId, todayIn(tz)),
    ]);
    const lesson = lessons.find((l) => l.id === lessonId)!;
    return {
      lesson,
      conflicts: (await fullConflicts(tx, tenantId, schoolYearId, lessons, ctx)).filter((c) =>
        c.lessonIds.includes(lessonId),
      ),
    };
  }
}
