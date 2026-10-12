import { Inject, Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { ENV, type Env } from '../../config/env';

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type PushResult = 'sent' | 'gone' | 'failed';

/**
 * Web-Push mit VAPID (Spec Abschnitt 7). Ohne Schlüssel ist Push abgeschaltet (z. B. lokal ohne Konfiguration).
 * Eigene Klasse, damit Tests den Versand ersetzen können.
 */
@Injectable()
export class PushSender {
  private readonly logger = new Logger(PushSender.name);
  readonly publicKey: string | null;

  constructor(@Inject(ENV) env: Env) {
    this.publicKey = env.VAPID_PUBLIC_KEY || null;
    if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
      webpush.setVapidDetails(
        env.VAPID_SUBJECT ?? 'mailto:betrieb@schulplattform.invalid',
        env.VAPID_PUBLIC_KEY,
        env.VAPID_PRIVATE_KEY,
      );
  }

  get available(): boolean {
    return this.publicKey !== null;
  }

  async send(target: PushTarget, payload: object): Promise<PushResult> {
    if (!this.available) return 'failed';
    try {
      await webpush.sendNotification(target, JSON.stringify(payload), { TTL: 12 * 3600 });
      return 'sent';
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410: Abo existiert nicht mehr (App gelöscht, Berechtigung entzogen)
      if (status === 404 || status === 410) return 'gone';
      this.logger.warn(`Push fehlgeschlagen (${status ?? 'Netz'})`);
      return 'failed';
    }
  }
}
