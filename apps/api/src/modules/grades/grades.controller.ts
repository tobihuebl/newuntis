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
  assessmentInput,
  assessmentPatch,
  courseRef,
  gradesInput,
  myGradesQuery,
  weightingInput,
} from '@sp/shared';
import { z } from 'zod';
import { Can } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { GradesService } from './grades.service';

const coursesQuery = z.object({ classId: z.string().min(1).max(64).optional() });

/** Noten (PN-02, ADR 0018): Kurse, Gewichtung, Leistungen, Noten, Freigabe und Übersichten. */
@Controller()
export class GradesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly grades: GradesService,
  ) {}

  /** Eigene Kurse der Lehrkraft; mit classId die Fächer einer Klasse (KV, Direktion, Administration). */
  @Can('grade.read')
  @Get('grades/courses')
  async courses(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(coursesQuery)) q: z.infer<typeof coursesQuery>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return { data: await this.grades.courses(this.prisma.tx, user, q.classId) };
  }

  @Can('grade.read')
  @Get('grades/course')
  async course(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(courseRef)) q: z.infer<typeof courseRef>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.grades.detail(this.prisma.tx, tenantId, me, user, q);
  }

  @Can('grade.write')
  @Put('grades/weighting')
  async weighting(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(weightingInput)) body: z.infer<typeof weightingInput>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.grades.setWeights(this.prisma.tx, tenantId, me, user, body.course, body.weights);
  }

  @Can('grade.write')
  @Post('grades/assessments')
  async create(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(assessmentInput)) body: z.infer<typeof assessmentInput>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.grades.createAssessment(this.prisma.tx, tenantId, me, user, body);
  }

  @Can('grade.write')
  @Patch('grades/assessments/:id')
  async patch(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(assessmentPatch)) body: z.infer<typeof assessmentPatch>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.grades.patchAssessment(this.prisma.tx, tenantId, me, user, id, body);
  }

  @Can('grade.write')
  @Delete('grades/assessments/:id')
  @HttpCode(204)
  async remove(@TenantId() tenantId: string, @Actor() me: Principal, @Param('id') id: string) {
    const user = await this.policy.loadUser(tenantId, me);
    await this.grades.deleteAssessment(this.prisma.tx, tenantId, me, user, id);
  }

  @Can('grade.write')
  @Put('grades/assessments/:id/grades')
  async setGrades(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(gradesInput)) body: z.infer<typeof gradesInput>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.grades.setGrades(this.prisma.tx, tenantId, me, user, id, body.items);
  }

  @Can('grade.write')
  @Post('grades/assessments/:id/release')
  @HttpCode(200)
  async release(@TenantId() tenantId: string, @Actor() me: Principal, @Param('id') id: string) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.grades.release(this.prisma.tx, tenantId, me, user, id);
  }

  /** Notenübersicht einer Klasse: KV der Klasse, Direktion, Administration. */
  @Can('grade.read')
  @Get('grades/classes/:classId')
  async classOverview(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('classId') classId: string,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.grades.classOverview(this.prisma.tx, tenantId, me, user, classId);
  }

  /** Eigene Noten (Schüler:in) bzw. die eines Kindes (Eltern, ?studentId=). */
  @Can('grade.read')
  @Get('me/grades')
  async mine(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(myGradesQuery)) q: z.infer<typeof myGradesQuery>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.grades.forStudent(this.prisma.tx, tenantId, me, user, q.studentId ?? me.personId);
  }
}
