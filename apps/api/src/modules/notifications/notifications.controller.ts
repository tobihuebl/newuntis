import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  CHANNELS,
  DEFAULT_CHANNELS,
  MANDATORY_CHANNELS,
  NOTIFICATION_TYPES,
  TYPES_FOR_ROLE,
  preferencesInput,
  pushSubscribeInput,
  pushUnsubscribeInput,
  type NotificationItem,
  type NotificationType,
  type PreferencesResponse,
} from '@sp/shared';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Authenticated } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { QUIET } from './notifications.service';
import { PushSender } from './push.sender';

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().min(1).optional(),
});

@Controller()
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushSender,
  ) {}

  /** Liste in der App (neueste zuerst), Cursor-Paginierung. */
  @Authenticated()
  @Get('notifications')
  async list(@Actor() me: Principal, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    const tx = this.prisma.tx;
    const rows = await tx.notification.findMany({
      where: { personId: me.personId, type: { in: [...NOTIFICATION_TYPES] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    const unread = await tx.notification.count({
      where: { personId: me.personId, readAt: null, type: { in: [...NOTIFICATION_TYPES] } },
    });
    return {
      data: page.map((n): NotificationItem => {
        const p = n.payload as { params?: Record<string, string | number>; url?: string | null };
        return {
          id: n.id,
          type: n.type as NotificationType,
          params: p.params ?? {},
          url: p.url ?? null,
          readAt: n.readAt?.toISOString() ?? null,
          createdAt: n.createdAt.toISOString(),
        };
      }),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
      unread,
    };
  }

  @Authenticated()
  @Post('notifications/:id/read')
  @HttpCode(204)
  async read(@Actor() me: Principal, @Param('id') id: string) {
    await this.prisma.tx.notification.updateMany({
      where: { id, personId: me.personId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  @Authenticated()
  @Post('notifications/read-all')
  @HttpCode(204)
  async readAll(@Actor() me: Principal) {
    await this.prisma.tx.notification.updateMany({
      where: { personId: me.personId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  // ───────────── Einstellungen (Spec Abschnitt 12) ─────────────

  @Authenticated()
  @Get('me/preferences')
  async preferences(@Actor() me: Principal): Promise<PreferencesResponse> {
    const roles = [...new Set(me.roles.map((r) => r.role))];
    const types = NOTIFICATION_TYPES.filter((t) =>
      roles.some((r) => TYPES_FOR_ROLE[r]?.includes(t)),
    );
    const rows = await this.prisma.tx.notificationPreference.findMany({
      where: { personId: me.personId },
    });
    const quiet = rows.find((r) => r.type === QUIET);
    const mandatory = types.flatMap((type) =>
      (MANDATORY_CHANNELS[type] ?? []).map((channel) => ({ type, channel })),
    );
    const isMandatory = (type: string, channel: string) =>
      mandatory.some((m) => m.type === type && m.channel === channel);
    return {
      types,
      mandatory,
      channels: types.flatMap((type) =>
        CHANNELS.map((channel) => ({
          type,
          channel,
          enabled:
            isMandatory(type, channel) ||
            (rows.find((r) => r.type === type && r.channel === channel)?.enabled ??
              DEFAULT_CHANNELS[type][channel]),
        })),
      ),
      quiet:
        quiet?.enabled && quiet.quietFrom && quiet.quietTo
          ? { from: quiet.quietFrom, to: quiet.quietTo }
          : null,
      pushAvailable: this.push.available,
      vapidPublicKey: this.push.publicKey,
    };
  }

  @Authenticated()
  @Patch('me/preferences')
  async savePreferences(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(preferencesInput)) body: z.infer<typeof preferencesInput>,
  ): Promise<PreferencesResponse> {
    const tx = this.prisma.tx;
    for (const c of body.channels) {
      if (MANDATORY_CHANNELS[c.type]?.includes(c.channel)) {
        if (c.enabled) continue;
        throw new ConflictException({ title: 'Pflichtmitteilungen lassen sich nicht abschalten' });
      }
      await tx.notificationPreference.upsert({
        where: {
          personId_type_channel: { personId: me.personId, type: c.type, channel: c.channel },
        },
        create: {
          tenantId,
          personId: me.personId,
          type: c.type,
          channel: c.channel,
          enabled: c.enabled,
        },
        update: { enabled: c.enabled },
      });
    }
    if (body.quiet !== undefined)
      await tx.notificationPreference.upsert({
        where: { personId_type_channel: { personId: me.personId, type: QUIET, channel: '*' } },
        create: {
          tenantId,
          personId: me.personId,
          type: QUIET,
          channel: '*',
          enabled: body.quiet !== null,
          quietFrom: body.quiet?.from ?? null,
          quietTo: body.quiet?.to ?? null,
        },
        update: {
          enabled: body.quiet !== null,
          quietFrom: body.quiet?.from ?? null,
          quietTo: body.quiet?.to ?? null,
        },
      });
    return this.preferences(me);
  }

  // ───────────── Web-Push ─────────────

  /** Gerät für Push anmelden (ein Abo je Endpunkt; ein Gerätewechsel der Person überschreibt). */
  @Authenticated()
  @Post('push/subscribe')
  @HttpCode(204)
  async subscribe(
    @Req() req: FastifyRequest,
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(pushSubscribeInput)) body: z.infer<typeof pushSubscribeInput>,
  ) {
    const userAgent = (req.headers['user-agent'] ?? '').slice(0, 300) || null;
    await this.prisma.tx.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        tenantId,
        personId: me.personId,
        endpoint: body.endpoint,
        keys: body.keys,
        userAgent,
      },
      update: { personId: me.personId, keys: body.keys, userAgent },
    });
  }

  @Authenticated()
  @Delete('push/subscribe')
  @HttpCode(204)
  async unsubscribe(
    @Actor() me: Principal,
    @Body(new ZodPipe(pushUnsubscribeInput)) body: z.infer<typeof pushUnsubscribeInput>,
  ) {
    await this.prisma.tx.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint, personId: me.personId },
    });
  }
}
