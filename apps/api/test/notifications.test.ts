// Echte Queue (pg-boss) in diesem Test: Zustellung, Bündelung, Einstellungen und Ruhezeiten
process.env.SP_TEST_JOBS = 'on';
process.env.NOTIFY_BUNDLE_SECONDS = '1';
process.env.VAPID_PUBLIC_KEY = 'test-public-key';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { PushSender, type PushTarget } from '../src/modules/notifications/push.sender';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { Harness, type Client } from './support/harness';

const sent: { endpoint: string; payload: { title: string; body: string; url: string } }[] = [];
class FakePush {
  readonly publicKey = 'test-public-key';
  readonly available = true;
  async send(target: PushTarget, payload: object) {
    if (target.endpoint.includes('gone')) return 'gone' as const;
    sent.push({ endpoint: target.endpoint, payload: payload as (typeof sent)[number]['payload'] });
    return 'sent' as const;
  }
}

const until = async (pred: () => boolean | Promise<boolean>, ms = 15_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await pred()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};

describe('Benachrichtigungen', () => {
  let h: Harness;
  let tenantId = '';
  let parent: Client;
  let parentId = '';
  let notifications: NotificationsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    h = await Harness.create({ overrides: [[PushSender, new FakePush()]] });
    const t = await h.createTenant('nt');
    tenantId = t.id;
    const u = await h.createUser(tenantId, [{ role: 'GUARDIAN' }], undefined, 'GUARDIAN');
    parentId = u.personId;
    parent = (await h.loginFully(t.slug, u.email)).client;
    notifications = h.app.get(NotificationsService);
    prisma = h.app.get(PrismaService);
  });
  afterAll(async () => h.close());

  const emit = (type: Parameters<NotificationsService['emit']>[2], params = {}) =>
    prisma.runAsTenant(tenantId, (tx) =>
      notifications.emit(tx, tenantId, type, [parentId], { params, url: '/heute' }),
    );

  it('Gerät anmelden; gleichartige Ereignisse kommen gebündelt als eine Push-Nachricht an', async () => {
    expect(
      (
        await parent.post('/push/subscribe', {
          endpoint: 'https://push.example.test/abc',
          keys: { p256dh: 'p', auth: 'a' },
        })
      ).status,
    ).toBe(204);
    await h.owner.pushSubscription.create({
      data: {
        tenantId,
        personId: parentId,
        endpoint: 'https://push.example.test/gone',
        keys: { p256dh: 'p', auth: 'a' },
      },
    });
    await emit('substitution.published', { day: 'Mittwoch' });
    await emit('substitution.published', { day: 'Donnerstag' });
    await emit('substitution.published', { day: 'Freitag' });
    expect(await until(() => sent.length > 0)).toBe(true);
    await new Promise((r) => setTimeout(r, 1500));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload.body).toBe('Es gibt 3 Änderungen im Stundenplan.');
    // keine Namen in Push-Texten, Link führt zur Liste
    expect(sent[0]!.payload.url).toBe('/benachrichtigungen');
    // abgelaufenes Abo ("Gone") wurde gelöscht
    expect(await h.owner.pushSubscription.count({ where: { personId: parentId } })).toBe(1);
    const list = await parent.get('/notifications');
    expect(list.json.data).toHaveLength(3);
    expect(list.json.unread).toBe(3);
    await parent.post(`/notifications/${list.json.data[0].id}/read`);
    expect((await parent.get('/notifications')).json.unread).toBe(2);
    await parent.post('/notifications/read-all');
    expect((await parent.get('/notifications')).json.unread).toBe(0);
  });

  it('abgebrochene Transaktion stellt nichts zu', async () => {
    sent.length = 0;
    await expect(
      prisma.runAsTenant(tenantId, async (tx) => {
        await notifications.emit(tx, tenantId, 'absence.reviewed', [parentId]);
        throw new Error('Abbruch');
      }),
    ).rejects.toThrow('Abbruch');
    await new Promise((r) => setTimeout(r, 2500));
    expect(sent).toHaveLength(0);
  });

  it('abgeschalteter Kanal und Ruhezeiten werden beachtet', async () => {
    sent.length = 0;
    const prefs = await parent.patch('/me/preferences', {
      channels: [{ type: 'absence.reviewed', channel: 'push', enabled: false }],
    });
    expect(prefs.status).toBe(200);
    expect(prefs.json.types).toContain('absence.reminder');
    expect(
      prefs.json.channels.find(
        (c: { type: string; channel: string }) =>
          c.type === 'absence.reviewed' && c.channel === 'push',
      ).enabled,
    ).toBe(false);
    await emit('absence.reviewed');
    await new Promise((r) => setTimeout(r, 2500));
    expect(sent).toHaveLength(0);

    // Ruhezeit rund um die aktuelle Uhrzeit: Push wird verschoben
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Vienna' }));
    const hh = (d: Date) =>
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    await parent.patch('/me/preferences', {
      quiet: {
        from: hh(new Date(now.getTime() - 60 * 60_000)),
        to: hh(new Date(now.getTime() + 60 * 60_000)),
      },
    });
    await emit('timetable.published', { date: '19.10.' });
    await new Promise((r) => setTimeout(r, 2500));
    expect(sent).toHaveLength(0);
    const quietJob = await h.owner.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'notify' AND singleton_key LIKE '%:quiet' AND state = 'created'`,
    );
    expect(quietJob[0]!.n).toBe(1);
  });
});
