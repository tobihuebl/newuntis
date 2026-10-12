import { describe, expect, it } from 'vitest';
import {
  absenceBlocks,
  examWarnings,
  minutesUntilQuietEnds,
  notificationText,
  rankSuggestions,
  type Suggestion,
} from './index';

const t = (
  name: string,
  teachesSubject: boolean,
  knowsClass: boolean,
  count: number,
): Suggestion => ({
  teacher: { id: name, name },
  teachesSubject,
  knowsClass,
  count,
});

describe('Supplierungsvorschläge', () => {
  it('Eignung vor Fairness, Fairness vor Name', () => {
    const ranked = rankSuggestions([
      t('Zach', false, false, 0),
      t('Berger', true, false, 5),
      t('Auer', true, false, 2),
      t('Moser', false, true, 0),
      t('Huber', true, true, 9),
    ]);
    expect(ranked.map((s) => s.teacher.name)).toEqual(['Huber', 'Auer', 'Berger', 'Moser', 'Zach']);
  });
});

describe('Fehlzeiten aus dem Klassenbuch', () => {
  const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 12, h, m));
  it('fasst Stunden mit Pausen zusammen, trennt bei größeren Lücken', () => {
    const blocks = absenceBlocks([
      { startsAt: at(8, 55), endsAt: at(9, 45) },
      { startsAt: at(8, 0), endsAt: at(8, 50) },
      { startsAt: at(12, 45), endsAt: at(13, 35) },
    ]);
    expect(blocks).toEqual([
      { fromAt: at(8, 0), toAt: at(9, 45), lessons: 2 },
      { fromAt: at(12, 45), toAt: at(13, 35), lessons: 1 },
    ]);
  });
});

describe('Prüfungskalender', () => {
  const limits = { maxPerDayPerClass: 1, maxPerWeekPerClass: 3 };
  it('warnt bei zweiter Prüfung am Tag und vierter in der Woche (Montag bis Sonntag)', () => {
    expect(examWarnings('2026-10-14', [], limits)).toEqual([]);
    expect(examWarnings('2026-10-14', ['2026-10-14'], limits).map((w) => w.code)).toEqual([
      'EXAM_DAY_LIMIT',
    ]);
    expect(
      examWarnings('2026-10-16', ['2026-10-12', '2026-10-13', '2026-10-18'], limits).map(
        (w) => w.code,
      ),
    ).toEqual(['EXAM_WEEK_LIMIT']);
    expect(examWarnings('2026-10-19', ['2026-10-12', '2026-10-13', '2026-10-18'], limits)).toEqual(
      [],
    );
  });
});

describe('Benachrichtigungen', () => {
  it('Ruhezeiten auch über Mitternacht', () => {
    const q = { from: '20:00', to: '07:00' };
    expect(minutesUntilQuietEnds(21 * 60, q)).toBe(10 * 60);
    expect(minutesUntilQuietEnds(6 * 60 + 30, q)).toBe(30);
    expect(minutesUntilQuietEnds(12 * 60, q)).toBe(0);
    expect(minutesUntilQuietEnds(13 * 60, { from: '12:00', to: '14:00' })).toBe(60);
    expect(minutesUntilQuietEnds(13 * 60, null)).toBe(0);
  });
  it('gebündelte Texte ohne Namen', () => {
    expect(notificationText('substitution.published', 1, { day: 'Mittwoch' }).body).toBe(
      'Es gibt eine Änderung im Stundenplan für Mittwoch.',
    );
    expect(notificationText('substitution.published', 3).body).toBe(
      'Es gibt 3 Änderungen im Stundenplan.',
    );
  });
});
