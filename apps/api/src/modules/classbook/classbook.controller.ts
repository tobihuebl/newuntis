import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { attendanceInput, classbookInput, closeInput, todayQuery } from '@sp/shared';
import type { z } from 'zod';
import { Authenticated, Can } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClassbookService } from './classbook.service';
import { TodayService } from './today.service';

@Controller()
export class ClassbookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly classbook: ClassbookService,
    private readonly todayService: TodayService,
  ) {}

  /** Rollenabhängige Zusammenfassung des Tages (Spec Abschnitt 9: GET /today). */
  @Authenticated()
  @Get('today')
  async today(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(todayQuery)) q: z.infer<typeof todayQuery>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.todayService.today(this.prisma.tx, tenantId, me, user, q.studentId);
  }

  /** Hausübungen der nächsten zwei Wochen (Seite "Aufgaben" bzw. "Termine"). */
  @Can('timetable.read.own')
  @Get('me/homework')
  async homework(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(todayQuery)) q: z.infer<typeof todayQuery>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return {
      data: await this.todayService.homework(this.prisma.tx, tenantId, me, user, q.studentId),
    };
  }

  /** KB-04: offene Einträge der eigenen Stunden. */
  @Can('classbook.write')
  @Get('classbook/open')
  async open(@TenantId() tenantId: string, @Actor() me: Principal) {
    return { data: await this.classbook.open(this.prisma.tx, tenantId, me.personId) };
  }

  /** Offline-Zwischenspeicher (Spec Abschnitt 12): Termine der nächsten Tage und offene Einträge mit Schülerlisten. */
  @Can('classbook.write')
  @Get('classbook/prefetch')
  async prefetch(@TenantId() tenantId: string, @Actor() me: Principal) {
    const user = await this.policy.loadUser(tenantId, me);
    return { data: await this.classbook.prefetch(this.prisma.tx, tenantId, me.personId, user) };
  }

  /** Termin mit Schülerliste, Anwesenheit und Eintrag. Lesen: Lehrkräfte der Stunde, KV, Direktion, Administration. */
  @Can('attendance.read')
  @Get('occurrences/:id')
  async detail(@TenantId() tenantId: string, @Actor() me: Principal, @Param('id') id: string) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.classbook.detail(this.prisma.tx, tenantId, me, user, id);
  }

  @Can('classbook.write')
  @Put('occurrences/:id/classbook')
  async saveEntry(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(classbookInput)) body: z.infer<typeof classbookInput>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.classbook.saveEntry(this.prisma.tx, tenantId, me, user, id, body);
  }

  @Can('classbook.write')
  @Put('occurrences/:id/attendance')
  async saveAttendance(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(attendanceInput)) body: z.infer<typeof attendanceInput>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.classbook.saveAttendance(this.prisma.tx, tenantId, me, user, id, body.items);
  }

  @Can('classbook.write')
  @Post('occurrences/:id/close')
  @HttpCode(200)
  async close(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') id: string,
    // clientMutationId wird nur geprüft: Abschließen ist ohnehin idempotent
    @Body(new ZodPipe(closeInput)) body: z.infer<typeof closeInput>,
  ) {
    void body;
    const user = await this.policy.loadUser(tenantId, me);
    return this.classbook.close(this.prisma.tx, tenantId, me, user, id);
  }
}
