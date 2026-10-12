import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { addDays, timetableRangeQuery, type Role } from '@sp/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Inject } from '@nestjs/common';
import type { z } from 'zod';
import { Authenticated, Can, NoTransaction, Public, RateLimit } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { tenantAppUrl } from '../../common/urls';
import { ZodPipe } from '../../common/zod.pipe';
import { ENV, type Env } from '../../config/env';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from '../auth/crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { todayIn } from './data';
import { buildIcs } from './ics';
import { PlansService, type PlanFilter } from './plans.service';

type Range = z.infer<typeof timetableRangeQuery>;
const none: PlanFilter = { classIds: [], groupIds: [], teacherIds: [], roomIds: [] };

@Controller()
export class PlansController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Eigener Stundenplan (Schüler:innen, Lehrkräfte; Eltern für ein verknüpftes Kind). */
  @Can('timetable.read.own')
  @Get('me/timetable')
  async mine(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(timetableRangeQuery)) q: Range,
  ) {
    const tx = this.prisma.tx;
    const r = await this.plans.range(tx, tenantId, q.from, q.to);
    const filter = await this.plans.ownFilter(tx, tenantId, me, r.from, q.studentId);
    return this.plans.plan(tx, tenantId, filter, r.from, r.to, r.timezone);
  }

  /** Verknüpfte Kinder für den Umschalter der Eltern (PL-04). */
  @Authenticated()
  @Get('me/children')
  async children(@TenantId() tenantId: string, @Actor() me: Principal) {
    const tz = (
      await this.prisma.tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { timezone: true },
      })
    ).timezone;
    return { data: await this.plans.children(this.prisma.tx, me.personId, todayIn(tz)) };
  }

  @Can('timetable.read.other')
  @Get('classes/:id/timetable')
  async classPlan(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Query(new ZodPipe(timetableRangeQuery)) q: Range,
  ) {
    const r = await this.plans.range(this.prisma.tx, tenantId, q.from, q.to);
    if (!(await this.prisma.tx.schoolClass.findUnique({ where: { id }, select: { id: true } })))
      throw new NotFoundException({ title: 'Klasse nicht gefunden' });
    // Klassenplan: Stunden der ganzen Klasse und ihrer Gruppen, an denen Kinder der Klasse teilnehmen
    const groups = await this.prisma.tx.groupMember.findMany({
      where: { student: { enrollments: { some: { classId: id, toDate: null } } } },
      select: { groupId: true },
      distinct: ['groupId'],
    });
    return this.plans.plan(
      this.prisma.tx,
      tenantId,
      { ...none, classIds: [id], groupIds: groups.map((g) => g.groupId) },
      r.from,
      r.to,
      r.timezone,
    );
  }

  @Can('timetable.read.other')
  @Get('teachers/:id/timetable')
  async teacherPlan(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Query(new ZodPipe(timetableRangeQuery)) q: Range,
  ) {
    const r = await this.plans.range(this.prisma.tx, tenantId, q.from, q.to);
    const t = await this.prisma.tx.person.findUnique({ where: { id }, select: { kind: true } });
    if (!t || t.kind !== 'TEACHER')
      throw new NotFoundException({ title: 'Lehrkraft nicht gefunden' });
    return this.plans.plan(
      this.prisma.tx,
      tenantId,
      { ...none, teacherIds: [id] },
      r.from,
      r.to,
      r.timezone,
    );
  }

  @Can('timetable.read.other')
  @Get('rooms/:id/timetable')
  async roomPlan(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Query(new ZodPipe(timetableRangeQuery)) q: Range,
  ) {
    const r = await this.plans.range(this.prisma.tx, tenantId, q.from, q.to);
    if (!(await this.prisma.tx.room.findUnique({ where: { id }, select: { id: true } })))
      throw new NotFoundException({ title: 'Raum nicht gefunden' });
    return this.plans.plan(
      this.prisma.tx,
      tenantId,
      { ...none, roomIds: [id] },
      r.from,
      r.to,
      r.timezone,
    );
  }

  /** Auswahllisten für fremde Pläne (Lehrkräfte, Direktion, Administration). */
  @Can('timetable.read.other')
  @Get('timetable/directory')
  async directory() {
    const tx = this.prisma.tx;
    const year = await tx.schoolYear.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    const [classes, teachers, rooms] = await Promise.all([
      year
        ? tx.schoolClass.findMany({
            where: { schoolYearId: year.id },
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      tx.person.findMany({
        where: { kind: 'TEACHER', anonymizedAt: null },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true },
      }),
      tx.room.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ]);
    return {
      classes,
      teachers: teachers.map((t) => ({ id: t.id, name: `${t.lastName} ${t.firstName}` })),
      rooms,
    };
  }

  // ───────────── Kalender-Abo (iCal) ─────────────

  /** Erzeugt (oder ersetzt) den persönlichen Kalender-Link. Der Klartext-Token steht nur in dieser Antwort. */
  @Authenticated()
  @Post('me/calendar-token')
  @HttpCode(200)
  async createToken(@Req() req: FastifyRequest, @Actor() me: Principal) {
    const tenant = req.tenant!;
    const token = this.crypto.randomToken(24);
    await this.prisma.tx.calendarToken.deleteMany({ where: { personId: me.personId } });
    await this.prisma.tx.calendarToken.create({
      data: { tenantId: tenant.id, personId: me.personId, tokenHash: this.crypto.sha256(token) },
    });
    await this.audit.record({
      tenantId: tenant.id,
      actorId: me.personId,
      action: 'calendarToken.create',
      entity: 'person',
      entityId: me.personId,
    });
    return { url: tenantAppUrl(this.env, tenant.slug, `/api/v1/calendar/${token}.ics`) };
  }

  @Authenticated()
  @Get('me/calendar-token')
  async hasToken(@Actor() me: Principal) {
    return {
      active: (await this.prisma.tx.calendarToken.count({ where: { personId: me.personId } })) > 0,
    };
  }

  @Authenticated()
  @Delete('me/calendar-token')
  @HttpCode(204)
  async deleteToken(@Actor() me: Principal) {
    await this.prisma.tx.calendarToken.deleteMany({ where: { personId: me.personId } });
  }

  /** Abo-Feed: zwei Wochen zurück, gut drei Monate voraus. Nur lesend, Zugriff über den geheimen Link. */
  @Public()
  @NoTransaction()
  @RateLimit(60, 60)
  @Get('calendar/:file')
  @Header('cache-control', 'private, max-age=300')
  async ics(
    @Req() req: FastifyRequest,
    @Param('file') file: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const tenantId = req.tenant!.id;
    const token = file.endsWith('.ics') ? file.slice(0, -4) : file;
    const body = await this.prisma.runAsTenant(tenantId, async (tx) => {
      const row = await tx.calendarToken.findUnique({
        where: { tokenHash: this.crypto.sha256(token) },
        include: { person: { include: { roles: true } } },
      });
      if (!row || row.person.anonymizedAt) return null;
      const roles = row.person.roles.map((r) => r.role as Role);
      const r = await this.plans.range(tx, tenantId);
      const today = todayIn(r.timezone);
      const from = addDays(today, -14);
      const to = addDays(today, 100);
      let filter: PlanFilter = none;
      if (roles.includes('STUDENT'))
        filter = await this.plans.studentFilter(tx, row.personId, today);
      else if (
        roles.some((x) => x === 'TEACHER' || x === 'HOMEROOM' || x === 'PRINCIPAL' || x === 'ADMIN')
      )
        filter = { ...none, teacherIds: [row.personId] };
      else if (roles.includes('GUARDIAN'))
        filter = await this.plans.childrenFilter(tx, row.personId, today);
      const plan = await this.plans.plan(tx, tenantId, filter, from, to, r.timezone);
      const teacherView = filter.teacherIds.length > 0;
      return buildIcs(
        'Stundenplan',
        plan.entries.map((e) => ({
          uid: `${e.id.replace(/[^\w:-]/g, '')}@schulplattform`,
          start: new Date(e.startsAt),
          end: new Date(e.endsAt),
          summary: teacherView
            ? `${e.subject.name} ${e.class?.name ?? e.group?.name ?? ''}`.trim()
            : e.subject.name,
          location: e.room?.name ?? null,
          description: e.teachers.map((t) => t.name).join(', ') || null,
          cancelled: e.status === 'CANCELLED',
        })),
      );
    });
    if (body === null) throw new NotFoundException({ title: 'Kalender nicht gefunden' });
    void reply.header('content-type', 'text/calendar; charset=utf-8');
    return body;
  }
}
