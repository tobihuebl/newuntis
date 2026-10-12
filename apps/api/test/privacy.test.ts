import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PRIVACY_NOTICE_VERSION } from '@sp/shared';
import { withTenant } from '@sp/db';
import { PrivacyService } from '../src/modules/privacy/privacy.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { Harness, type Client } from './support/harness';
import { enroll, smallSchool } from './support/school';

const DAY = 86_400_000;

describe('Datenschutz: Einführung, Export, Anfragen, Aufbewahrung, Einstellungen', () => {
  let h: Harness;
  let tenantId = '';
  let slug = '';
  let admin: Client;
  let principal: Client;
  let student: Client;
  let adminId = '';
  const ids = {} as Record<'student' | 'guardian', string>;

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.tenantWithAdmin('dsg');
    tenantId = t.tenant.id;
    slug = t.tenant.slug;
    admin = t.admin;
    adminId = t.adminPersonId;
    const s = await smallSchool(h, tenantId);
    const pu = await h.createUser(tenantId, [{ role: 'PRINCIPAL' }]);
    const st = await h.createUser(tenantId, [{ role: 'STUDENT' }], undefined, 'STUDENT');
    const g = await h.createUser(tenantId, [{ role: 'GUARDIAN' }], undefined, 'GUARDIAN');
    ids.student = st.personId;
    ids.guardian = g.personId;
    await enroll(h, tenantId, st.personId, s.c1.id);
    principal = (await h.loginFully(slug, pu.email)).client;
    student = (await h.loginFully(slug, st.email)).client;
  });
  afterAll(async () => h.close());

  it('Einführung: Datenschutzhinweis mit Version und Zeitpunkt bestätigen', async () => {
    expect((await student.get('/me')).json.needsOnboarding).toBe(true);
    expect((await student.post('/me/onboarding', { privacyNoticeVersion: 'alt' })).status).toBe(
      400,
    );
    expect(
      (await student.post('/me/onboarding', { privacyNoticeVersion: PRIVACY_NOTICE_VERSION }))
        .status,
    ).toBe(204);
    expect((await student.get('/me')).json.needsOnboarding).toBe(false);
    const c = await h.owner.consent.findFirstOrThrow({ where: { personId: ids.student } });
    expect(c).toMatchObject({ kind: 'privacy-notice', version: PRIVACY_NOTICE_VERSION });
  });

  it('eigene Daten als JSON und PDF exportieren', async () => {
    const json = await student.get('/me/export');
    expect(json.status).toBe(200);
    expect(json.headers['content-disposition']).toContain('datenauskunft-');
    expect(json.json.person.id).toBe(ids.student);
    expect(json.json.enrollments[0].className).toBe('1A');
    expect(json.json.consents).toHaveLength(1);
    const pdf = await student.get('/me/export?format=pdf');
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.raw.subarray(0, 5).toString()).toBe('%PDF-');
    const log = await h.owner.auditLog.findMany({
      where: { tenantId, action: 'privacy.export.self', actorId: ids.student },
    });
    expect(log).toHaveLength(2);
  });

  it('Datenschutz-Anfragen: nur Administration; Einschränkung und Löschung', async () => {
    expect((await principal.get('/admin/privacy/requests')).status).toBe(403);
    const r1 = await admin.post('/admin/privacy/requests', {
      personId: ids.guardian,
      kind: 'RESTRICTION',
      note: 'Bitte bis zur Klärung keine Mitteilungen.',
    });
    expect(r1.status).toBe(201);
    await admin.patch(`/admin/privacy/requests/${r1.json.id}`, { status: 'DONE' });
    expect(
      (await h.owner.person.findUniqueOrThrow({ where: { id: ids.guardian } })).restrictedAt,
    ).not.toBeNull();
    expect(
      (await admin.patch(`/admin/privacy/requests/${r1.json.id}`, { status: 'DONE' })).status,
    ).toBe(409);

    const list = await admin.get('/admin/privacy/requests');
    expect(list.json.data[0].person.restricted).toBe(true);

    const exp = await admin.get(`/admin/privacy/persons/${ids.guardian}/export`);
    expect(exp.json.person.restricted).toBe(true);

    const self = await admin.post('/admin/privacy/requests', {
      personId: adminId,
      kind: 'ERASURE',
    });
    expect(
      (await admin.patch(`/admin/privacy/requests/${self.json.id}`, { status: 'DONE' })).status,
    ).toBe(400);

    const r2 = await admin.post('/admin/privacy/requests', {
      personId: ids.guardian,
      kind: 'ERASURE',
    });
    expect(
      (await admin.patch(`/admin/privacy/requests/${r2.json.id}`, { status: 'DONE' })).status,
    ).toBe(200);
    const p = await h.owner.person.findUniqueOrThrow({
      where: { id: ids.guardian },
      include: { user: true },
    });
    expect(p.anonymizedAt).not.toBeNull();
    expect(p.firstName).toBe('Anonymisiert');
    expect(p.user).toBeNull();
  });

  it('Aufbewahrung: alte Nachrichten, Benachrichtigungen und Audit-Einträge werden gelöscht', async () => {
    const old = new Date(Date.now() - 2000 * DAY);
    const thread = await h.owner.thread.create({
      data: { tenantId, subject: 'Alt', createdById: adminId, lastMessageAt: old },
    });
    await h.owner.message.create({
      data: { tenantId, threadId: thread.id, senderId: adminId, body: 'alt', createdAt: old },
    });
    await h.owner.notification.create({
      data: { tenantId, personId: adminId, type: 'message.new', payload: {}, createdAt: old },
    });
    await h.owner.auditLog.create({
      data: { tenantId, action: 'test.alt', entity: 'x', createdAt: old },
    });
    const fresh = await h.owner.auditLog.create({
      data: { tenantId, action: 'test.neu', entity: 'x' },
    });
    const svc = h.app.get(PrivacyService);
    const prisma = h.app.get(PrismaService);
    const r = await prisma.runAsTenant(tenantId, (tx) => svc.retention(tx, tenantId));
    expect(r).toMatchObject({ messages: 1, threads: 1, notifications: 1 });
    expect(r.audit).toBeGreaterThanOrEqual(1);
    expect(await h.owner.thread.findUnique({ where: { id: thread.id } })).toBeNull();
    expect(await h.owner.auditLog.findUnique({ where: { id: fresh.id } })).not.toBeNull();
    expect(await h.owner.auditLog.count({ where: { tenantId, action: 'retention.run' } })).toBe(1);
  });

  it('die Laufzeit-Rolle kann junge Audit-Einträge nicht löschen', async () => {
    await expect(
      withTenant(
        h.app.get(PrismaService).client,
        tenantId,
        (tx) => tx.$queryRaw`SELECT prune_audit_log(now() - interval '1 day')`,
      ),
    ).rejects.toThrow(/90 Tage/);
  });

  it('Schuleinstellungen: Direktion liest, Administration ändert mit Prüfung', async () => {
    expect((await principal.get('/admin/settings')).json.absence.excuseDeadlineDays).toBe(7);
    expect(
      (await principal.patch('/admin/settings', { absence: { excuseDeadlineDays: 5 } })).status,
    ).toBe(403);
    expect((await admin.patch('/admin/settings', { retention: { auditLogDays: 10 } })).status).toBe(
      400,
    );
    const res = await admin.patch('/admin/settings', {
      absence: { excuseDeadlineDays: 5, attachmentRequiredFromDays: 3, reminderAfterDays: [2] },
      privacy: { noticeUrl: 'https://schule.example.at/datenschutz' },
    });
    expect(res.status).toBe(200);
    expect(res.json.absence.excuseDeadlineDays).toBe(5);
    expect(res.json.exams.maxPerDayPerClass).toBe(1);
    const t = await h.owner.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(
      (t.settings as { absence: { excuseDeadlineDays: number } }).absence.excuseDeadlineDays,
    ).toBe(5);
    expect((await student.get('/me')).json.tenant.privacyNoticeUrl).toBe(
      'https://schule.example.at/datenschutz',
    );
    // Ein anderer Abschnitt allein lässt die bisherigen Änderungen stehen
    const again = await admin.patch('/admin/settings', {
      communication: { announcementReminderAfterDays: 0 },
    });
    expect(again.json.absence.excuseDeadlineDays).toBe(5);
    expect(again.json.communication.announcementReminderAfterDays).toBe(0);
  });
});
