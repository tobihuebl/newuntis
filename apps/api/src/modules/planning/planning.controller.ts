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
import {
  describeConstraint,
  planningConstraintPatch,
  planningConstraintsCreate,
  planningRunInput,
  planningTranslateInput,
  translateWishes,
  type TranslateResponse,
} from '@sp/shared';
import { z } from 'zod';
import { Can } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { bad } from '../admin/util';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { translateWithAi } from './ai-translate';
import { PlanningService } from './planning.service';

const yearQuery = z.object({ schoolYearId: z.string().min(1) });

/**
 * Stundenplan-Assistent (M7, ADR 0012). Rechte wie der Editor (timetable.edit); zusätzlich muss die Schule das
 * Paket freigeschaltet haben (features.autoPlanning).
 */
@Controller('admin/planning')
export class PlanningController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: PlanningService,
    private readonly audit: AuditService,
  ) {}

  /** Für die Oberfläche: Assistent freigeschaltet? KI-Übersetzer eingerichtet? */
  @Can('timetable.edit')
  @Get('status')
  async status(@TenantId() tenantId: string) {
    const { s } = await this.planning.settings(this.prisma.tx, tenantId);
    return { enabled: s.features.autoPlanning, ai: this.planning.aiConfigured };
  }

  // ───────────── Wünsche ─────────────
  @Can('timetable.edit')
  @Get('constraints')
  async list(
    @TenantId() tenantId: string,
    @Query(new ZodPipe(yearQuery)) q: z.infer<typeof yearQuery>,
  ) {
    await this.planning.assertEnabled(this.prisma.tx, tenantId);
    return { data: await this.planning.constraintItems(this.prisma.tx, q.schoolYearId) };
  }

  @Can('timetable.edit')
  @Post('constraints')
  async create(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Body(new ZodPipe(planningConstraintsCreate)) body: z.infer<typeof planningConstraintsCreate>,
  ) {
    const tx = this.prisma.tx;
    await this.planning.assertEnabled(tx, tenantId);
    const dir = await this.planning.directory(tx, body.schoolYearId);
    const has = (list: { id: string }[], id: string | null) => !id || list.some((x) => x.id === id);
    for (const c of body.constraints) {
      if (!has(dir.teachers, c.teacherId)) bad('Lehrkraft nicht gefunden');
      if (!has(dir.classes, c.classId))
        bad('Klasse nicht gefunden oder aus einem anderen Schuljahr');
      if (!has(dir.subjects, c.subjectId)) bad('Fach nicht gefunden');
      if (!c.roomIds.every((r) => has(dir.rooms, r))) bad('Raum nicht gefunden');
      if (c.periods.some((p) => p > dir.maxPeriod)) bad('Stunde liegt außerhalb des Rasters');
    }
    await tx.planningConstraint.createMany({
      data: body.constraints.map((c) => ({
        tenantId,
        schoolYearId: body.schoolYearId,
        createdById: actor.personId,
        ...c,
      })),
    });
    await this.audit.record({
      tenantId,
      actorId: actor.personId,
      action: 'planning.constraints.create',
      entity: 'schoolYear',
      entityId: body.schoolYearId,
      meta: { count: body.constraints.length },
    });
    return { data: await this.planning.constraintItems(tx, body.schoolYearId) };
  }

  @Can('timetable.edit')
  @Patch('constraints/:id')
  async patch(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body(new ZodPipe(planningConstraintPatch)) body: z.infer<typeof planningConstraintPatch>,
  ) {
    const tx = this.prisma.tx;
    await this.planning.assertEnabled(tx, tenantId);
    const res = await tx.planningConstraint.updateMany({ where: { id }, data: body });
    if (res.count === 0) throw new NotFoundException({ title: 'Wunsch nicht gefunden' });
    return { id };
  }

  @Can('timetable.edit')
  @Delete('constraints/:id')
  @HttpCode(204)
  async remove(@TenantId() tenantId: string, @Param('id') id: string) {
    const tx = this.prisma.tx;
    await this.planning.assertEnabled(tx, tenantId);
    const res = await tx.planningConstraint.deleteMany({ where: { id } });
    if (res.count === 0) throw new NotFoundException({ title: 'Wunsch nicht gefunden' });
  }

  /** Wünsche in Worten → Vorschläge (nicht gespeichert). Erst Regeln, Ungelöstes optional an die KI. */
  @Can('timetable.edit')
  @Post('translate')
  @HttpCode(200)
  async translate(
    @TenantId() tenantId: string,
    @Body(new ZodPipe(planningTranslateInput)) body: z.infer<typeof planningTranslateInput>,
  ): Promise<TranslateResponse> {
    const tx = this.prisma.tx;
    await this.planning.assertEnabled(tx, tenantId);
    const dir = await this.planning.directory(tx, body.schoolYearId);
    const rules = translateWishes(body.text, dir);
    let proposals = rules.proposals;
    let unresolved = rules.unresolved;
    let engine: TranslateResponse['engine'] = 'rules';
    const gateway = this.planning.ai;
    if (unresolved.length && gateway) {
      const ai = await translateWithAi({
        ...gateway,
        sentences: unresolved,
        dir,
        otherNames: await this.planning.otherNames(tx),
      });
      proposals = [...proposals, ...ai.proposals];
      unresolved = ai.unresolved;
      engine = 'rules+ai';
    }
    const names = this.planning.namesOf(dir);
    return {
      proposals: proposals.map((p) => ({ ...p, summary: describeConstraint(p.constraint, names) })),
      unresolved,
      engine,
    };
  }

  // ───────────── Läufe ─────────────
  @Can('timetable.edit')
  @Post('runs')
  async start(
    @TenantId() tenantId: string,
    @Actor() actor: Principal,
    @Body(new ZodPipe(planningRunInput)) body: z.infer<typeof planningRunInput>,
  ) {
    const tx = this.prisma.tx;
    await this.planning.assertEnabled(tx, tenantId);
    const count = await tx.lessonRequirement.count({ where: { versionId: body.sourceVersionId } });
    if (count === 0)
      bad(
        'Diese Version hat keine Soll-Stunden. Lehrfächerverteilung zuerst importieren oder anlegen.',
      );
    return this.planning.start(tx, tenantId, actor.personId, body);
  }

  @Can('timetable.edit')
  @Get('runs')
  async runs(
    @TenantId() tenantId: string,
    @Query(new ZodPipe(yearQuery)) q: z.infer<typeof yearQuery>,
  ) {
    const tx = this.prisma.tx;
    await this.planning.assertEnabled(tx, tenantId);
    const rows = await tx.planningRun.findMany({
      where: { schoolYearId: q.schoolYearId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { data: rows.map((r) => this.planning.toRunItem(r)) };
  }

  @Can('timetable.edit')
  @Get('runs/:id')
  async run(@TenantId() tenantId: string, @Param('id') id: string) {
    const tx = this.prisma.tx;
    await this.planning.assertEnabled(tx, tenantId);
    const r = await tx.planningRun.findUnique({ where: { id } });
    if (!r) throw new NotFoundException({ title: 'Lauf nicht gefunden' });
    return this.planning.toRunItem(r);
  }
}
