import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import {
  examResultInput,
  promotionsInput,
  promotionsQuery,
  transitionClassesInput,
  transitionQuery,
  transitionStudentsInput,
} from '@sp/shared';
import type { z } from 'zod';
import { Can } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransitionService } from './transition.service';

/** Schuljahreswechsel (SD-05, ADR 0019). */
@Controller()
export class TransitionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly transition: TransitionService,
  ) {}

  /** Entscheidungen am Schuljahresende für eine Klasse (KV der Klasse, Direktion, Administration). */
  @Can('promotion.decide')
  @Get('promotions')
  async view(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(promotionsQuery)) q: z.infer<typeof promotionsQuery>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.transition.view(this.prisma.tx, tenantId, me, user, q.classId);
  }

  @Can('promotion.decide')
  @Put('promotions')
  async decide(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(promotionsInput)) body: z.infer<typeof promotionsInput>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.transition.decide(this.prisma.tx, tenantId, me, user, body);
  }

  @Can('promotion.decide')
  @Get('promotions/summary')
  async summary(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(promotionsQuery)) q: z.infer<typeof promotionsQuery>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.transition.summary(this.prisma.tx, tenantId, user, q.classId);
  }

  /** Ergebnis der Wiederholungsprüfung im neuen Schuljahr (KV der neuen Klasse, Direktion, Administration). */
  @Can('promotion.decide')
  @Post('promotions/exam')
  @HttpCode(200)
  async exam(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(examResultInput)) body: z.infer<typeof examResultInput>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.transition.examResult(this.prisma.tx, tenantId, me, user, body);
  }

  // ───────────── Assistent der Administration ─────────────

  @Can('masterdata.write')
  @Get('admin/year-transition')
  async plan(
    @TenantId() tenantId: string,
    @Query(new ZodPipe(transitionQuery)) q: z.infer<typeof transitionQuery>,
  ) {
    return this.transition.plan(this.prisma.tx, tenantId, q.toYearId);
  }

  @Can('masterdata.write')
  @Post('admin/year-transition/classes')
  @HttpCode(200)
  async classes(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(transitionClassesInput)) body: z.infer<typeof transitionClassesInput>,
  ) {
    return this.transition.createClasses(this.prisma.tx, tenantId, me, body);
  }

  @Can('masterdata.write')
  @Post('admin/year-transition/students')
  @HttpCode(200)
  async students(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(transitionStudentsInput)) body: z.infer<typeof transitionStudentsInput>,
  ) {
    return this.transition.applyStudents(this.prisma.tx, tenantId, me, body);
  }
}
