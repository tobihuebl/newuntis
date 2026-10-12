import { describe, expect, it } from 'vitest';
import {
  announcementInput,
  DEFAULT_CHANNELS,
  hasScope,
  MANDATORY_CHANNELS,
  messagePreview,
  NOTIFICATION_TEXTS,
  NOTIFICATION_TYPES,
  reportQuery,
  tenantSettingsPatch,
  tenantSettingsSchema,
  threadCreateInput,
  toCsv,
  TYPES_FOR_ROLE,
} from './index';

describe('CSV-Export', () => {
  it('Strichpunkt, BOM, CRLF und Anführungszeichen', () => {
    const csv = toCsv([
      ['Name', 'Wert'],
      ['Huber; Anna', 'sagt "hallo"'],
      [null, 3],
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toBe('\uFEFFName;Wert\r\n"Huber; Anna";"sagt ""hallo"""\r\n;3\r\n');
  });

  it('entschärft Formeln (CSV-Injection), Zahlen bleiben', () => {
    expect(toCsv([['=HYPERLINK("x")', '+1', '-2', '@SUM', -5]])).toBe(
      '\uFEFF"\'=HYPERLINK(""x"")";\'+1;\'-2;\'@SUM;-5\r\n',
    );
  });
});

describe('Nachrichten', () => {
  it('Vorschau: eine Zeile, gekürzt', () => {
    expect(messagePreview('Hallo\n\n  Welt')).toBe('Hallo Welt');
    const long = messagePreview('a'.repeat(200), 10);
    expect(long).toHaveLength(10);
    expect(long.endsWith('…')).toBe(true);
  });

  it('Empfänger: Personen oder Klasse, nie leer', () => {
    expect(
      threadCreateInput.safeParse({
        subject: 'x',
        body: 'y',
        to: { kind: 'persons', personIds: [] },
      }).success,
    ).toBe(false);
    expect(
      threadCreateInput.safeParse({
        subject: ' ',
        body: 'y',
        to: { kind: 'class', classId: 'c', audience: 'guardians' },
      }).success,
    ).toBe(false);
    expect(
      threadCreateInput.safeParse({
        subject: 'Wandertag',
        body: 'Freitag',
        to: { kind: 'class', classId: 'c', audience: 'guardians' },
      }).success,
    ).toBe(true);
  });

  it('Rundschreiben brauchen mindestens eine Rolle', () => {
    const base = { title: 't', body: 'b', audience: { roles: [] } };
    expect(announcementInput.safeParse(base).success).toBe(false);
    const ok = announcementInput.parse({ ...base, audience: { roles: ['GUARDIAN'] } });
    expect(ok.audience).toEqual({ roles: ['GUARDIAN'], classIds: [], groupIds: [] });
    expect(ok.requiresRead).toBe(false);
  });
});

describe('Benachrichtigungen M6', () => {
  it('jeder Typ hat Standardkanäle und Texte; Pflichtkanäle sind standardmäßig an', () => {
    for (const t of NOTIFICATION_TYPES) {
      expect(DEFAULT_CHANNELS[t]).toBeDefined();
      expect(NOTIFICATION_TEXTS[t].title.length).toBeGreaterThan(0);
      for (const c of MANDATORY_CHANNELS[t] ?? []) expect(DEFAULT_CHANNELS[t][c]).toBe(true);
    }
  });

  it('Push-Texte enthalten keine Platzhalter für Namen', () => {
    for (const t of ['message.new', 'announcement.published', 'announcement.required'] as const)
      expect(`${NOTIFICATION_TEXTS[t].one}${NOTIFICATION_TEXTS[t].many}`).not.toMatch(
        /\{(name|title)\}/,
      );
  });

  it('alle Rollen bekommen Nachrichten', () => {
    for (const role of Object.keys(TYPES_FOR_ROLE))
      expect(TYPES_FOR_ROLE[role]!.includes('message.new') || role === 'HOMEROOM').toBe(true);
  });
});

describe('Auswertungen und Einstellungen', () => {
  it('Zeitraum: Beginn vor Ende, höchstens ein Schuljahr', () => {
    expect(reportQuery.safeParse({ from: '2026-09-01', to: '2026-10-01' }).success).toBe(true);
    expect(reportQuery.safeParse({ from: '2026-10-02', to: '2026-10-01' }).success).toBe(false);
    expect(reportQuery.safeParse({ from: '2025-01-01', to: '2026-10-01' }).success).toBe(false);
  });

  it('Audit-Log mindestens 90 Tage, Teiländerung ganzer Abschnitte', () => {
    expect(
      tenantSettingsPatch.safeParse({
        retention: { ...tenantSettingsSchema.parse({}).retention, auditLogDays: 30 },
      }).success,
    ).toBe(false);
    expect(tenantSettingsPatch.parse({}).absence).toBeUndefined();
  });

  it('hasScope unterscheidet schulweit und Klasse', () => {
    expect(hasScope({ personId: 'p', roles: ['HOMEROOM'] }, 'reports.read', 'ALL')).toBe(false);
    expect(
      hasScope({ personId: 'p', roles: ['HOMEROOM', 'PRINCIPAL'] }, 'reports.read', 'ALL'),
    ).toBe(true);
  });
});
