import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import {
  avatarInput,
  stepUpdateInput,
  type OnboardingFlowStats,
  type OnboardingState,
} from '@sp/shared';
import type { z } from 'zod';
import { Authenticated, Can } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingService } from './onboarding.service';

/** Onboarding (ADR 0020): Stand und Fortschritt der eigenen Flows, Auswertung für die Schule. */
@Controller()
export class OnboardingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly onboarding: OnboardingService,
  ) {}

  @Authenticated()
  @Get('me/onboarding')
  state(@TenantId() tenantId: string, @Actor() me: Principal): Promise<OnboardingState> {
    return this.onboarding.state(this.prisma.tx, tenantId, me);
  }

  @Authenticated()
  @Post('me/onboarding/steps')
  @HttpCode(204)
  async step(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(stepUpdateInput)) body: z.infer<typeof stepUpdateInput>,
  ) {
    await this.onboarding.update(this.prisma.tx, tenantId, me, body);
  }

  /** Avatar aus Symbol und Farbe (kein Foto). */
  @Authenticated()
  @Put('me/avatar')
  @HttpCode(204)
  async avatar(
    @Actor() me: Principal,
    @Body(new ZodPipe(avatarInput)) body: z.infer<typeof avatarInput>,
  ) {
    await this.prisma.tx.user.update({
      where: { id: me.userId },
      data: { avatar: `${body.symbol}:${body.color}` },
    });
  }

  /** Wo Nutzer:innen abspringen: nur Zahlen je Flow und Schritt, keine Namen. */
  @Can('masterdata.read')
  @Get('admin/onboarding/stats')
  async stats(): Promise<{ data: OnboardingFlowStats[] }> {
    return { data: await this.onboarding.stats(this.prisma.tx) };
  }
}
