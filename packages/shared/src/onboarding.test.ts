import { describe, expect, it } from 'vitest';
import {
  ONBOARDING,
  ONBOARDING_FLOWS,
  avatarOf,
  composeSteps,
  flowsFor,
  isFlowStep,
  median,
  usernameBase,
} from './onboarding';

describe('Onboarding-Konfiguration (ADR 0020)', () => {
  it('jeder Flow folgt dem Gerüst: Willkommen, Einrichtung, genau ein Aha-Moment, Checkliste', () => {
    for (const f of ONBOARDING_FLOWS) {
      const phases = ONBOARDING[f].steps.map((s) => s.phase);
      expect(phases[0]).toBe('welcome');
      expect(phases.filter((p) => p === 'aha')).toHaveLength(1);
      const order = ['welcome', 'setup', 'aha', 'checklist'];
      expect([...phases].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(phases);
      // Willkommen höchstens drei Screens
      expect(phases.filter((p) => p === 'welcome').length).toBeLessThanOrEqual(3);
    }
  });

  it('Schritt-Ids sind eindeutig, ohne Punkt (i18n) und je Id überall gleich definiert', () => {
    const seen = new Map<string, string>();
    for (const f of ONBOARDING_FLOWS)
      for (const s of ONBOARDING[f].steps) {
        expect(s.id).not.toContain('.');
        const json = JSON.stringify(s);
        if (seen.has(s.id)) expect(seen.get(s.id)).toBe(json);
        seen.set(s.id, json);
      }
  });

  it('Pflichtschritte sind nie datengetrieben (sonst bliebe der Guard hängen)', () => {
    for (const f of ONBOARDING_FLOWS)
      for (const s of ONBOARDING[f].steps) if (s.required) expect(isFlowStep(s)).toBe(true);
  });

  it('Rollen ergeben Flows; Klassenvorstand ist der Lehrkraft-Flow mit Zusatzschritten', () => {
    expect(flowsFor(['HOMEROOM'])).toEqual(['teacher']);
    expect(flowsFor(['TEACHER', 'GUARDIAN'])).toEqual(['teacher', 'guardian']);
    expect(flowsFor(['ADMIN', 'PRINCIPAL'])).toEqual(['admin', 'principal']);
    const plain = composeSteps(['teacher'], { homeroom: false }).map((s) => s.id);
    const kv = composeSteps(['teacher'], { homeroom: true }).map((s) => s.id);
    expect(plain).not.toContain('homeroomLetters');
    expect(kv).toContain('homeroomLetters');
  });

  it('mehrere Rollen: Willkommen einmal, Phasen in Reihenfolge, gemeinsame Schritte einmal', () => {
    const s = composeSteps(['teacher', 'guardian'], { homeroom: false });
    expect(s.filter((x) => x.id === 'privacy')).toHaveLength(1);
    expect(s.map((x) => x.id).slice(0, 6)).toEqual([
      'privacy',
      'push',
      'teacherData',
      'teacherTimetable',
      'guardianChildren',
      'notify',
    ]);
    expect(s.find((x) => x.id === 'notify')?.flow).toBe('guardian');
  });

  it('Benutzername aus dem Namen', () => {
    expect(usernameBase('Lena Marie', 'Huber')).toBe('lena.huber');
    expect(usernameBase('Jürgen', 'Weiß-Öztürk')).toBe('juergen.weiss-oeztuerk');
    expect(usernameBase('Zoë', 'Ćosić')).toBe('zoe.cosic');
    expect(usernameBase('', '')).toBe('schueler.in');
  });

  it('Avatar und Median', () => {
    expect(avatarOf('cat:mint')).toEqual({ symbol: 'cat', color: 'mint' });
    expect(avatarOf('foto.jpg')).toBeNull();
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
