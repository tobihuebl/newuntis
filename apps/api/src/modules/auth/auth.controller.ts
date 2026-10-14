import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  inviteAcceptSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  SESSION_COOKIE,
  twoFactorEnableSchema,
  twoFactorVerifySchema,
  type InviteAcceptInput,
} from '@sp/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AllowStages,
  Authenticated,
  NoTransaction,
  Public,
  RateLimit,
} from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import type { IssuedSession } from './session.service';

type LoginBody = z.infer<typeof loginSchema>;
type VerifyBody = z.infer<typeof twoFactorVerifySchema>;
type EnableBody = z.infer<typeof twoFactorEnableSchema>;
type ResetRequestBody = z.infer<typeof passwordResetRequestSchema>;
type ResetBody = z.infer<typeof passwordResetSchema>;

/** Auth-Endpunkte steuern ihre Transaktionen selbst (Fehlversuche und Audit müssen auch bei Fehlern gespeichert werden). */
@Controller('auth')
@NoTransaction()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @RateLimit(10, 60)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginBody,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.login(
      req.tenant!,
      body.email,
      body.password,
      req.headers['user-agent'],
    );
    this.setSessionCookie(reply, result.session);
    return { stage: result.stage, csrfToken: result.session.csrfToken };
  }

  @AllowStages('NEEDS_2FA_VERIFY')
  @Authenticated()
  @RateLimit(10, 60)
  @Post('2fa/verify')
  @HttpCode(200)
  async verify(
    @Body(new ZodPipe(twoFactorVerifySchema)) body: VerifyBody,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const session = await this.auth.verifyTwoFactor(req.tenant!, req.principal!, body.code);
    this.setSessionCookie(reply, session);
    return { stage: 'ACTIVE', csrfToken: session.csrfToken };
  }

  @AllowStages('NEEDS_2FA_SETUP', 'ACTIVE')
  @Authenticated()
  @RateLimit(10, 60)
  @Post('2fa/setup')
  @HttpCode(200)
  setup(@Req() req: FastifyRequest) {
    return this.auth.beginTwoFactorSetup(req.tenant!, req.principal!);
  }

  @AllowStages('NEEDS_2FA_SETUP', 'ACTIVE')
  @Authenticated()
  @RateLimit(10, 60)
  @Post('2fa/enable')
  @HttpCode(200)
  async enable(
    @Body(new ZodPipe(twoFactorEnableSchema)) body: EnableBody,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.enableTwoFactor(req.tenant!, req.principal!, body.code);
    this.setSessionCookie(reply, result.session);
    return {
      stage: 'ACTIVE',
      csrfToken: result.session.csrfToken,
      recoveryCodes: result.recoveryCodes,
    };
  }

  @AllowStages('ACTIVE', 'NEEDS_2FA_VERIFY', 'NEEDS_2FA_SETUP')
  @Authenticated()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logout(req.tenant!, req.principal!);
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Authenticated()
  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logoutEverywhere(req.tenant!, req.principal!);
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Public()
  @RateLimit(10, 60)
  @Post('invite/accept')
  @HttpCode(204)
  async acceptInvite(
    @Body(new ZodPipe(inviteAcceptSchema)) body: InviteAcceptInput,
    @Req() req: FastifyRequest,
  ) {
    await this.auth.acceptInvitation(req.tenant!, body.token, body.password);
  }

  @Public()
  @RateLimit(5, 60)
  @Post('password/reset-request')
  @HttpCode(204)
  async resetRequest(
    @Body(new ZodPipe(passwordResetRequestSchema)) body: ResetRequestBody,
    @Req() req: FastifyRequest,
  ) {
    await this.auth.requestPasswordReset(req.tenant!, body.email);
  }

  @Public()
  @RateLimit(10, 60)
  @Post('password/reset')
  @HttpCode(204)
  async reset(@Body(new ZodPipe(passwordResetSchema)) body: ResetBody, @Req() req: FastifyRequest) {
    await this.auth.resetPassword(req.tenant!, body.token, body.password);
  }

  private setSessionCookie(reply: FastifyReply, session: IssuedSession): void {
    void reply.setCookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: this.env.APP_URL.startsWith('https://'),
      sameSite: 'lax',
      path: '/',
    });
  }
}

@Controller('me')
export class MeController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly onboarding: OnboardingService,
  ) {}

  /** Geräteliste (Spec Abschnitt 13): angemeldete Sitzungen der Person. */
  @Authenticated()
  @Get('sessions')
  async sessions(@Req() req: FastifyRequest) {
    const p = req.principal!;
    const rows = await this.prisma.tx.session.findMany({
      where: { userId: p.userId },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, userAgent: true, lastSeenAt: true, createdAt: true },
    });
    return {
      data: rows.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        lastSeenAt: s.lastSeenAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        current: s.id === p.sessionId,
      })),
    };
  }

  /** Ein anderes Gerät abmelden. */
  @Authenticated()
  @Delete('sessions/:id')
  @HttpCode(204)
  async endSession(@Req() req: FastifyRequest, @Param('id') id: string) {
    const r = await this.prisma.tx.session.deleteMany({
      where: { id, userId: req.principal!.userId },
    });
    if (r.count === 0) throw new NotFoundException({ title: 'Sitzung nicht gefunden' });
  }

  @AllowStages('ACTIVE', 'NEEDS_2FA_VERIFY', 'NEEDS_2FA_SETUP')
  @Authenticated()
  @Get()
  async me(@Req() req: FastifyRequest) {
    const p = req.principal!;
    // Onboarding (ADR 0020): offene Pflichtschritte (Datenschutzhinweis, Einrichtung der Rolle) führen nach /willkommen
    const needsOnboarding =
      p.stage === 'ACTIVE' ? await this.onboarding.needsFlow(this.prisma.tx, p) : false;
    return this.auth.me(req.tenant!, p, needsOnboarding);
  }
}
