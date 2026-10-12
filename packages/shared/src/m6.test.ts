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

describe('Umgebung', () => {
  it('leeres METRICS_TOKEN schaltet /metrics ab, zu kurzes ist ein Fehler', async () => {
    const { serverEnvSchema } = await import('./env');
    const base = {
      DATABASE_URL: 'postgresql://x',
      DATABASE_APP_URL: 'postgresql://y',
      BASE_DOMAIN: 'localhost',
      SESSION_SECRET: 'x'.repeat(32),
      APP_URL: 'http://localhost:3000',
      API_URL: 'http://localhost:4000',
      SMTP_URL: 'smtp://localhost:1025',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_BUCKET: 'b',
      S3_ACCESS_KEY: 'a',
      S3_SECRET_KEY: 's',
      ENCRYPTION_KEY: btoa('x'.repeat(32)),
    };
    expect(serverEnvSchema.parse({ ...base, METRICS_TOKEN: '' }).METRICS_TOKEN).toBeUndefined();
    expect(serverEnvSchema.safeParse({ ...base, METRICS_TOKEN: 'kurz' }).success).toBe(false);
  });
});

describe('Fächerfarben (Design System, Entscheidung F3)', () => {
  it('ordnet Standardfächer wie im Design System zu', async () => {
    const { defaultFachColor, fachColorOf } = await import('./masterdata');
    expect(defaultFachColor('Mathematik', 'M')).toBe('kobalt');
    expect(defaultFachColor('Deutsch', 'D')).toBe('koralle');
    expect(defaultFachColor('Englisch', 'E')).toBe('rosa');
    expect(defaultFachColor('Biologie und Umweltkunde', 'BIU')).toBe('mint');
    expect(defaultFachColor('Physik', 'PH')).toBe('himmel');
    expect(defaultFachColor('Chemie', 'CH')).toBe('himmel');
    expect(defaultFachColor('Musik', 'MU')).toBe('flieder');
    expect(defaultFachColor('Bildnerische Erziehung', 'BE')).toBe('flieder');
    expect(defaultFachColor('Bewegung und Sport', 'BSP')).toBe('limette');
    expect(defaultFachColor('Geografie und Wirtschaftskunde', 'GWK')).toBe('sand');
    expect(defaultFachColor('Informatik', 'INF')).toBe('sand');
    expect(fachColorOf({ color: 'mint', name: 'Deutsch', code: 'D' })).toBe('mint');
    expect(fachColorOf({ color: '#4F46E5', name: 'Deutsch', code: 'D' })).toBe('koralle');
  });
  it('nimmt nur die acht Fächerfarben an, nie Amber oder Hex', async () => {
    const { subjectInput } = await import('./masterdata');
    expect(subjectInput.safeParse({ name: 'Mathe', code: 'M', color: 'kobalt' }).success).toBe(
      true,
    );
    expect(subjectInput.safeParse({ name: 'Mathe', code: 'M', color: 'amber' }).success).toBe(
      false,
    );
    expect(subjectInput.safeParse({ name: 'Mathe', code: 'M', color: '#2e53ea' }).success).toBe(
      false,
    );
  });
});
