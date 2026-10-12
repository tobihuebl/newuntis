import { describe, expect, it } from 'vitest';
import messages from '../messages/de-AT.json';

/** next-intl verbietet Punkte in Schlüsseln (Punkt = Verschachtelung); sonst bricht die ganze App. */
describe('Übersetzungen', () => {
  it('keine Punkte in Schlüsseln', () => {
    const bad: string[] = [];
    const walk = (o: unknown, path: string) => {
      if (o && typeof o === 'object')
        for (const [k, v] of Object.entries(o)) {
          if (k.includes('.')) bad.push(`${path}${k}`);
          walk(v, `${path}${k}/`);
        }
    };
    walk(messages, '');
    expect(bad).toEqual([]);
  });
});

/** Ton (Design System, Inhaltliche Grundsätze): keine Ausrufezeichen, Anrede nach Rolle. */
describe('Ton und Anrede', () => {
  const entries = (o: unknown, path = ''): [string, string][] =>
    o && typeof o === 'object'
      ? Object.entries(o).flatMap(([k, v]) => entries(v, `${path}${k}/`))
      : [[path.slice(0, -1), String(o)]];
  const all = entries(messages);

  it('keine Ausrufezeichen in der Oberfläche', () => {
    expect(all.filter(([, v]) => /!/.test(v)).map(([k]) => k)).toEqual([]);
  });

  it('öffentliche Seiten und Verwaltung siezen (kein du)', () => {
    const formalOnly = [
      'auth',
      'guardianCode',
      'admin',
      'settings',
      'rolesAdmin',
      'privacy',
      'adminOverview',
      'approvals',
      'timetable',
      'dashboard',
      'absence',
    ];
    const du = /\b(du|dich|dir|dein|deine|deinen|deinem|deiner|deines)\b/i;
    const bad = all.filter(([k, v]) => formalOnly.includes(k.split('/')[0]!) && du.test(v));
    expect(bad.map(([k]) => k)).toEqual([]);
  });

  it('Anrede-Auswahl hat immer beide Fassungen', () => {
    const bad = all.filter(
      ([, v]) => v.includes('{formal, select') && !/yes \{[^}]*\} other \{/.test(v),
    );
    expect(bad.map(([k]) => k)).toEqual([]);
  });
});
