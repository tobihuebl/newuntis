import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  dateSchema,
  substitutionActionInput,
  substitutionCreateInput,
  substitutionListQuery,
  substitutionPublishInput,
  teacherAbsenceInput,
} from '@sp/shared';
import { z } from 'zod';
import { Can } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { todayIn } from '../timetable/data';
import { SubstitutionsService } from './substitutions.service';

const rangeQuery = z.object({ from: dateSchema.optional(), to: dateSchema.optional() });

/** Supplierung (Spec Abschnitt 9): planen und veröffentlichen Direktion und Administration. */
@Controller()
export class SubstitutionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly subs: SubstitutionsService,
  ) {}

  // ───────────── Lehrerabwesenheit ─────────────

  @Can('teacherAbsence.report')
  @Post('teacher-absences')
  async createAbsence(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(teacherAbsenceInput)) body: z.infer<typeof teacherAbsenceInput>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.subs.createAbsence(this.prisma.tx, tenantId, me, user, body);
  }

  @Can('teacherAbsence.report')
  @Get('teacher-absences')
  async listAbsences(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(rangeQuery)) q: z.infer<typeof rangeQuery>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    const tz = (await this.prisma.tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }))
      .timezone;
    const from = q.from ?? todayIn(tz);
    return { data: await this.subs.listAbsences(this.prisma.tx, me, user, from, q.to ?? from) };
  }

  @Can('teacherAbsence.report')
  @Put('teacher-absences/:id')
  async updateAbsence(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(teacherAbsenceInput)) body: z.infer<typeof teacherAbsenceInput>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.subs.updateAbsence(this.prisma.tx, tenantId, me, user, id, body);
  }

  @Can('teacherAbsence.report')
  @Delete('teacher-absences/:id')
  @HttpCode(204)
  async deleteAbsence(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') id: string,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    await this.subs.deleteAbsence(this.prisma.tx, tenantId, me, user, id);
  }

  // ───────────── Supplierungen ─────────────

  @Can('substitution.manage')
  @Get('substitutions')
  async day(
    @TenantId() tenantId: string,
    @Query(new ZodPipe(substitutionListQuery)) q: z.infer<typeof substitutionListQuery>,
  ) {
    return this.subs.day(this.prisma.tx, tenantId, q.date);
  }

  @Can('substitution.manage')
  @Get('substitutions/:id/suggestions')
  async suggestions(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.subs.suggestions(this.prisma.tx, tenantId, id);
  }

  @Can('substitution.manage')
  @Post('substitutions')
  async create(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(substitutionCreateInput)) body: z.infer<typeof substitutionCreateInput>,
  ) {
    return this.subs.createManual(this.prisma.tx, tenantId, me, body);
  }

  @Can('substitution.manage')
  @Patch('substitutions/:id')
  async setAction(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(substitutionActionInput)) body: z.infer<typeof substitutionActionInput>,
  ) {
    return this.subs.setAction(this.prisma.tx, tenantId, me, id, body);
  }

  @Can('substitution.manage')
  @Delete('substitutions/:id')
  @HttpCode(204)
  async remove(@TenantId() tenantId: string, @Actor() me: Principal, @Param('id') id: string) {
    await this.subs.remove(this.prisma.tx, tenantId, me, id);
  }

  @Can('substitution.manage')
  @Post('substitutions/publish')
  @HttpCode(200)
  async publish(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(substitutionPublishInput)) body: z.infer<typeof substitutionPublishInput>,
  ) {
    return this.subs.publish(this.prisma.tx, tenantId, me, body);
  }
}
