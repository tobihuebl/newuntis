import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  announcementInput,
  announcementListQuery,
  audienceSchema,
  can,
  messageInput,
  recipientQuery,
  threadCreateInput,
  threadListQuery,
} from '@sp/shared';
import { z } from 'zod';
import { Authenticated, Can, RateLimit } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { PolicyService } from '../policy/policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnnouncementsService } from './announcements.service';
import { MessagesService } from './messages.service';

/** Gespräche (KO-01). Lesen und Antworten: Teilnehmer:innen; neue Gespräche: message.send. */
@Controller('threads')
export class ThreadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly messages: MessagesService,
  ) {}

  @Authenticated()
  @Get()
  list(
    @Actor() me: Principal,
    @Query(new ZodPipe(threadListQuery)) q: z.infer<typeof threadListQuery>,
  ) {
    return this.messages.list(this.prisma.tx, me.personId, q.limit, q.cursor);
  }

  @Authenticated()
  @Get('unread')
  unread(@Actor() me: Principal) {
    return this.messages.inboxCounts(this.prisma.tx, me.personId);
  }

  @Can('message.send')
  @Get('recipients')
  async recipients(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(recipientQuery)) q: z.infer<typeof recipientQuery>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return {
      data: await this.messages.recipients(this.prisma.tx, tenantId, user, q.q),
      classes: await this.messages.classOptions(this.prisma.tx, user),
    };
  }

  @Can('message.send')
  @RateLimit(30, 600)
  @Post()
  async create(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(threadCreateInput)) body: z.infer<typeof threadCreateInput>,
  ) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.messages.create(this.prisma.tx, tenantId, me, user, body);
  }

  @Authenticated()
  @Get(':id')
  detail(@Actor() me: Principal, @Param('id') id: string) {
    return this.messages.detail(this.prisma.tx, me.personId, id);
  }

  @Authenticated()
  @RateLimit(60, 600)
  @Post(':id/messages')
  reply(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(messageInput)) body: z.infer<typeof messageInput>,
  ) {
    return this.messages.reply(this.prisma.tx, tenantId, me, id, body.body);
  }

  @Authenticated()
  @Post(':id/read')
  @HttpCode(204)
  async read(@Actor() me: Principal, @Param('id') id: string) {
    await this.messages.markRead(this.prisma.tx, id, me.personId);
  }
}

/** Rundschreiben (KO-02). Lesen und Bestätigen: Empfänger:innen; Senden und Statistik: announcement.send. */
@Controller('announcements')
export class AnnouncementsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly announcements: AnnouncementsService,
  ) {}

  @Authenticated()
  @Get()
  async list(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Query(new ZodPipe(announcementListQuery)) q: z.infer<typeof announcementListQuery>,
  ) {
    if (q.view === 'sent' && !(await this.policy.can(tenantId, me, 'announcement.send')))
      throw new ForbiddenException({ title: 'Keine Berechtigung' });
    return this.announcements.list(this.prisma.tx, me.personId, q.view, q.limit, q.cursor);
  }

  @Can('announcement.send')
  @Post('preview')
  @HttpCode(200)
  preview(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(z.object({ audience: audienceSchema })))
    body: { audience: z.infer<typeof audienceSchema> },
  ) {
    return this.announcements.preview(this.prisma.tx, tenantId, me, body.audience);
  }

  @Can('announcement.send')
  @RateLimit(20, 3600)
  @Post()
  create(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(announcementInput)) body: z.infer<typeof announcementInput>,
  ) {
    return this.announcements.create(this.prisma.tx, tenantId, me, body);
  }

  @Authenticated()
  @Get(':id')
  async detail(@TenantId() tenantId: string, @Actor() me: Principal, @Param('id') id: string) {
    const user = await this.policy.loadUser(tenantId, me);
    return this.announcements.detail(
      this.prisma.tx,
      me.personId,
      id,
      can(user, 'announcement.send'),
    );
  }

  @Authenticated()
  @Post(':id/read')
  @HttpCode(200)
  read(@Actor() me: Principal, @Param('id') id: string) {
    return this.announcements.markRead(this.prisma.tx, me.personId, id);
  }

  @Can('announcement.send')
  @Post(':id/remind')
  @HttpCode(200)
  remind(@TenantId() tenantId: string, @Actor() me: Principal, @Param('id') id: string) {
    return this.announcements.remind(this.prisma.tx, tenantId, id, me.personId, true);
  }
}
