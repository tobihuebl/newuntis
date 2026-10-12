import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { absenceListQuery, absenceReportInput, absenceReviewInput } from '@sp/shared';
import type { z } from 'zod';
import { Can } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbsencesService } from './absences.service';

/** Fehlzeiten von Schüler:innen (Spec Abschnitt 9: Abwesenheit). */
@Controller('absences')
export class AbsencesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly absences: AbsencesService,
  ) {}

  /** Melden bzw. entschuldigen (Eltern, Schüler:in ab Altersgrenze, Administration für andere). */
  @Can('absence.report')
  @Post()
  async report(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(absenceReportInput)) body: z.infer<typeof absenceReportInput>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.absences.report(this.prisma.tx, tenantId, me, user, body);
  }

  /** Lesen nach Rechte-Matrix "Anwesenheit einsehen" (eigene, Kinder, Klasse, alle). */
  @Can('attendance.read')
  @Get()
  async list(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(absenceListQuery)) q: z.infer<typeof absenceListQuery>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return { data: await this.absences.list(this.prisma.tx, tenantId, me, user, q) };
  }

  @Can('absence.review')
  @Patch(':id/review')
  async review(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(absenceReviewInput)) body: z.infer<typeof absenceReviewInput>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.absences.review(
      this.prisma.tx,
      tenantId,
      me,
      user,
      id,
      body.decision,
      body.comment,
    );
  }

  /** Foto oder PDF der Bestätigung als Rohdaten (höchstens 5 MB, Virenscan). */
  @Can('absence.report')
  @Post(':id/attachments')
  async attach(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    const buf = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
    return this.absences.attach(this.prisma.tx, tenantId, me, user, id, buf);
  }

  /** Kurzlebiger, signierter Link zur Bestätigung. */
  @Can('attendance.read')
  @Get(':id/attachment')
  async attachment(@TenantId() tenantId: string, @Actor() me: Principal, @Param('id') id: string) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.absences.attachmentUrl(this.prisma.tx, tenantId, me, user, id);
  }
}
