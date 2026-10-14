import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  absenceListQuery,
  absenceReportInput,
  absenceReviewInput,
  can,
  hasScope,
} from '@sp/shared';
import { z } from 'zod';
import { Can } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbsencesService } from './absences.service';
import { AbsenceWarningsService } from './warnings.service';

const warningsQuery = z.object({ classId: z.string().min(1).max(64).optional() });

/** Fehlzeiten von Schüler:innen (Spec Abschnitt 9: Abwesenheit). */
@Controller('absences')
export class AbsencesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly absences: AbsencesService,
    private readonly warnings: AbsenceWarningsService,
  ) {}

  /**
   * Frühwarnung (AB-05): mit `classId` für den Klassenvorstand der Klasse, ohne für die ganze Schule (Direktion,
   * Administration). Rechte wie beim Prüfen von Entschuldigungen.
   */
  @Can('absence.review')
  @Get('warnings')
  async warningList(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(warningsQuery)) q: z.infer<typeof warningsQuery>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    const allowed = q.classId
      ? can(user, 'absence.review', { classId: q.classId })
      : hasScope(user, 'absence.review', 'ALL');
    if (!allowed) throw new ForbiddenException({ title: 'Keine Berechtigung für diese Klasse' });
    const r = await this.warnings.list(this.prisma.tx, tenantId, q.classId ? [q.classId] : null);
    return { data: r.data };
  }

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
