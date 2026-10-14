import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Prisma, Tx } from '@sp/db';
import {
  BUNDLE_SECONDS,
  CHANNELS,
  DEFAULT_CHANNELS,
  MANDATORY_CHANNELS,
  minutesUntilQuietEnds,
  notificationText,
  type Channel,
  type NotificationType,
  formalAddress,
  type Role,
} from '@sp/shared';
import { DateTime } from 'luxon';
import { tenantAppUrl } from '../../common/urls';
import { EventsService } from '../events/events.service';
import { QueueService } from '../jobs/queue.service';
import { MailQueue } from '../mail/mail-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { PushSender, type PushTarget } from './push.sender';
import { ENV, type Env } from '../../config/env';

export const QUEUE_NOTIFY = 'notify';
/** Bündelungsfenster; in Tests verkürzbar. */
const bundleSeconds = () => Number(process.env.NOTIFY_BUNDLE_SECONDS ?? BUNDLE_SECONDS);
/** Zeilen-Typ für die Ruhezeiten in NotificationPreference. */
export const QUIET = 'quiet';
/** Ältere, nicht zugestellte Hinweise werden nicht mehr gepusht. */
const MAX_AGE_HOURS = 48;

export interface NotifyJob {
  tenantId: string;
  personId: string;
  type: NotificationType;
  channel: Channel;
}

export interface NotifyPayload {
  params?: Record<string, string | number>;
  /** Pfad in der App, z. B. "/heute". */
  url?: string;
}

/**
 * Benachrichtigungsdienst (Spec Abschnitt 12): `emit` legt Zeilen für die Liste in der App an, meldet sie
 * über den Echtzeit-Stream und stellt pro Kanal einen Zustell-Job ein. Pro Person, Typ und Kanal wartet
 * höchstens ein Job (Queue-Policy "stately"): gleichartige Ereignisse im Bündelungsfenster werden zu einer
 * Nachricht zusammengefasst. Zustellung beachtet Einstellungen und Ruhezeiten, Wiederholung mit Abstand.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly events: EventsService,
    private readonly push: PushSender,
    private readonly mail: MailQueue,
    private readonly metrics: MetricsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.queue.register<NotifyJob>(QUEUE_NOTIFY, (job) => this.deliver(job), {
      policy: 'stately',
      concurrency: 8,
    });
  }

  /** Innerhalb der Transaktion des Fachmoduls aufrufen; Zustellung erst nach dem Commit. */
  async emit(
    tx: Tx,
    tenantId: string,
    type: NotificationType,
    personIds: string[],
    payload: NotifyPayload = {},
  ): Promise<number> {
    const wanted = [...new Set(personIds)];
    if (wanted.length === 0) return 0;
    // Anonymisierte Personen und eingeschränkte Verarbeitung (DSGVO Art. 18): keine Benachrichtigungen
    const ids = (
      await tx.person.findMany({
        where: { id: { in: wanted }, anonymizedAt: null, restrictedAt: null },
        select: { id: true },
      })
    ).map((p) => p.id);
    if (ids.length === 0) return 0;
    const data = { params: payload.params ?? {}, url: payload.url ?? null };
    await tx.notification.createMany({
      data: ids.map((personId) => ({
        tenantId,
        personId,
        type,
        payload: data as Prisma.InputJsonValue,
      })),
    });
    await this.events.emit(tx, tenantId, 'notification.new', [], ids);
    const prefs = await this.channelsFor(tx, ids, type);
    for (const personId of ids)
      for (const channel of CHANNELS) {
        if (!prefs.get(`${personId}|${channel}`)) continue;
        await this.queue.send(
          QUEUE_NOTIFY,
          { tenantId, personId, type, channel } satisfies NotifyJob,
          {
            singletonKey: `${tenantId}:${personId}:${type}:${channel}`,
            startAfter: bundleSeconds(),
            retryLimit: 6,
            retryDelay: 30,
            retryBackoff: true,
          },
          tx,
        );
      }
    return ids.length;
  }

  /** Eingeschaltete Kanäle je Person (Einstellung oder Standard laut Spec). */
  private async channelsFor(
    tx: Tx,
    personIds: string[],
    type: NotificationType,
  ): Promise<Map<string, boolean>> {
    const rows = await tx.notificationPreference.findMany({
      where: { personId: { in: personIds }, type },
      select: { personId: true, channel: true, enabled: true },
    });
    const out = new Map<string, boolean>();
    for (const p of personIds)
      for (const c of CHANNELS) out.set(`${p}|${c}`, DEFAULT_CHANNELS[type][c]);
    for (const r of rows) out.set(`${r.personId}|${r.channel}`, r.enabled);
    // Pflichtmitteilungen lassen sich nicht abschalten
    for (const c of MANDATORY_CHANNELS[type] ?? [])
      for (const p of personIds) out.set(`${p}|${c}`, true);
    return out;
  }

  /** Zustell-Job: alle noch offenen Hinweise dieses Typs gebündelt per Push oder E-Mail. */
  async deliver(job: NotifyJob): Promise<void> {
    const { tenantId, personId, type, channel } = job;
    const sentField = channel === 'push' ? 'pushedAt' : 'emailedAt';
    const plan = await this.prisma.runAsTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { slug: true, name: true, timezone: true },
      });
      const pending = await tx.notification.findMany({
        where: {
          personId,
          type,
          [sentField]: null,
          createdAt: { gte: new Date(Date.now() - MAX_AGE_HOURS * 3_600_000) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (pending.length === 0) return null;
      const enabled = (await this.channelsFor(tx, [personId], type)).get(`${personId}|${channel}`);
      const quietRow = await tx.notificationPreference.findFirst({
        where: { personId, type: QUIET },
      });
      const quiet =
        quietRow?.enabled && quietRow.quietFrom && quietRow.quietTo
          ? { from: quietRow.quietFrom, to: quietRow.quietTo }
          : null;
      const local = DateTime.now().setZone(tenant.timezone);
      const wait = enabled ? minutesUntilQuietEnds(local.hour * 60 + local.minute, quiet) : 0;
      if (wait > 0) return { kind: 'wait' as const, wait };
      const ids = pending.map((n) => n.id);
      if (!enabled) {
        // Abgeschaltet: als erledigt markieren, damit später nichts nachgeschickt wird
        await tx.notification.updateMany({
          where: { id: { in: ids } },
          data: { [sentField]: new Date() },
        });
        return null;
      }
      const latest = pending[0]!.payload as {
        params?: Record<string, string | number>;
        url?: string | null;
      };
      const text = notificationText(type, pending.length, latest.params ?? {});
      const url = pending.length === 1 && latest.url ? latest.url : '/benachrichtigungen';
      if (channel === 'push') {
        const subs = await tx.pushSubscription.findMany({ where: { personId } });
        return { kind: 'push' as const, push: subs, text, url, ids };
      }
      const user = await tx.user.findUnique({ where: { personId }, select: { email: true } });
      const roles = await tx.roleAssignment.findMany({
        where: { personId },
        select: { role: true },
      });
      return user?.email
        ? {
            kind: 'email' as const,
            email: user.email,
            formal: formalAddress(roles.map((r) => r.role as Role)),
            text,
            url: tenantAppUrl(this.env, tenant.slug, url),
            school: tenant.name,
            ids,
          }
        : null;
    });
    if (!plan) return;
    if (plan.kind === 'wait') {
      // Ruhezeit: nach deren Ende erneut versuchen (eigener wartender Job neben dem laufenden)
      await this.queue.send(QUEUE_NOTIFY, job, {
        singletonKey: `${tenantId}:${personId}:${type}:${channel}:quiet`,
        startAfter: plan.wait * 60,
      });
      return;
    }
    if (plan.kind === 'push') {
      await this.sendPush(tenantId, plan.push, {
        title: plan.text.title,
        body: plan.text.body,
        url: plan.url,
        tag: type,
      });
    } else {
      await this.mail.send(plan.email, {
        kind: 'notification',
        school: plan.school,
        title: plan.text.title,
        body: plan.text.body,
        url: plan.url,
        formal: plan.formal,
      });
    }
    await this.prisma.runAsTenant(tenantId, (tx) =>
      tx.notification.updateMany({
        where: { id: { in: plan.ids } },
        data: { [sentField]: new Date() },
      }),
    );
  }

  /** An alle Geräte der Person; abgelaufene Abos ("Gone") werden gelöscht. */
  private async sendPush(
    tenantId: string,
    subs: { id: string; endpoint: string; keys: Prisma.JsonValue }[],
    payload: object,
  ): Promise<void> {
    let failed = 0;
    const gone: string[] = [];
    for (const s of subs) {
      const r = await this.push.send(
        { endpoint: s.endpoint, keys: s.keys as unknown as PushTarget['keys'] },
        payload,
      );
      this.metrics.inc('sp_push_total', 'Web-Push-Zustellungen je Ergebnis', { result: r });
      if (r === 'gone') gone.push(s.id);
      if (r === 'failed') failed++;
    }
    if (gone.length)
      await this.prisma.runAsTenant(tenantId, (tx) =>
        tx.pushSubscription.deleteMany({ where: { id: { in: gone } } }),
      );
    // Alle verbliebenen Geräte fehlgeschlagen: Job scheitern lassen, pg-boss wiederholt mit Abstand
    if (failed > 0 && failed === subs.length - gone.length && this.push.available) {
      this.logger.warn(`Push an ${failed} Gerät(e) fehlgeschlagen, neuer Versuch folgt`);
      throw new Error('Push fehlgeschlagen');
    }
  }
}
