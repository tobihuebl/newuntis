import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  consentAnswerInput,
  consentFormInput,
  consentPaperInput,
  type ConsentFormDetail,
  type ConsentFormItem,
  type ConsentFormOptions,
  type MyConsentForm,
} from '@sp/shared';
import type { z } from 'zod';
import { Can } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentFormsService } from './consent-forms.service';

/** Einverständniserklärungen (KO-05, ADR 0021). */
@Controller()
export class ConsentFormsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly forms: ConsentFormsService,
  ) {}

  /** Klassen und Schüler:innen, an deren Eltern die Person eine Erklärung schicken darf. */
  @Can('consentForm.manage')
  @Get('consent-forms/options')
  async options(@TenantId() t: string, @Actor() me: Principal): Promise<ConsentFormOptions> {
    return this.forms.options(this.prisma.tx, t, await this.policy.loadUser(t, me));
  }

  @Can('consentForm.manage')
  @Get('consent-forms')
  async list(@TenantId() t: string, @Actor() me: Principal): Promise<{ data: ConsentFormItem[] }> {
    return { data: await this.forms.list(this.prisma.tx, me, await this.policy.loadUser(t, me)) };
  }

  @Can('consentForm.manage')
  @Post('consent-forms')
  async create(
    @TenantId() t: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(consentFormInput)) body: z.infer<typeof consentFormInput>,
  ) {
    return this.forms.create(this.prisma.tx, t, me, await this.policy.loadUser(t, me), body);
  }

  @Can('consentForm.manage')
  @Get('consent-forms/:id')
  async detail(
    @TenantId() t: string,
    @Actor() me: Principal,
    @Param('id') id: string,
  ): Promise<ConsentFormDetail> {
    return this.forms.detail(this.prisma.tx, t, me, await this.policy.loadUser(t, me), id);
  }

  @Can('consentForm.manage')
  @Post('consent-forms/:id/remind')
  @HttpCode(200)
  async remind(@TenantId() t: string, @Actor() me: Principal, @Param('id') id: string) {
    const user = await this.policy.loadUser(t, me);
    return this.forms.remind(this.prisma.tx, t, id, { me, user });
  }

  @Can('consentForm.manage')
  @Post('consent-forms/:id/close')
  @HttpCode(204)
  async close(@TenantId() t: string, @Actor() me: Principal, @Param('id') id: string) {
    await this.forms.close(this.prisma.tx, t, me, await this.policy.loadUser(t, me), id);
  }

  /** Antwort auf Papier nachtragen. */
  @Can('consentForm.manage')
  @Put('consent-forms/:id/answers/:studentId')
  @HttpCode(204)
  async paper(
    @TenantId() t: string,
    @Actor() me: Principal,
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @Body(new ZodPipe(consentPaperInput)) body: z.infer<typeof consentPaperInput>,
  ) {
    const user = await this.policy.loadUser(t, me);
    await this.forms.paper(this.prisma.tx, t, me, user, id, studentId, body.answer);
  }

  /** Eltern: Erklärungen für die eigenen Kinder. */
  @Can('consentForm.answer')
  @Get('me/consent-forms')
  async mine(@TenantId() t: string, @Actor() me: Principal): Promise<{ data: MyConsentForm[] }> {
    return { data: await this.forms.mine(this.prisma.tx, t, await this.policy.loadUser(t, me)) };
  }

  @Can('consentForm.answer')
  @Put('me/consent-forms/:id/answers/:studentId')
  @HttpCode(204)
  async answer(
    @TenantId() t: string,
    @Actor() me: Principal,
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @Body(new ZodPipe(consentAnswerInput)) body: z.infer<typeof consentAnswerInput>,
  ) {
    const user = await this.policy.loadUser(t, me);
    await this.forms.answer(this.prisma.tx, t, me, user, id, studentId, body);
  }
}
