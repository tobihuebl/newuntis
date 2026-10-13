import { describe, expect, it } from 'vitest';
import { clockMinutes, greetingKey, nowPlacement, viennaDate, viennaMinutes } from './now';

describe('Zeitlinie', () => {
  const at = (iso: string) => Date.parse(iso);
  it('liegt anteilig in der laufenden Stunde, in der Pause vor der nächsten, sonst nirgends', () => {
    const s1 = at('2026-10-12T06:00:00Z');
    const e1 = at('2026-10-12T06:50:00Z');
    const s2 = at('2026-10-12T06:55:00Z');
    const e2 = at('2026-10-12T07:45:00Z');
    expect(nowPlacement(at('2026-10-12T06:25:00Z'), s1, e1, null)).toEqual({
      kind: 'inside',
      progress: 0.5,
    });
    expect(nowPlacement(at('2026-10-12T06:52:00Z'), s2, e2, e1)).toEqual({ kind: 'before' });
    expect(nowPlacement(at('2026-10-12T06:52:00Z'), s1, e1, null)).toBeNull();
    expect(nowPlacement(at('2026-10-12T05:30:00Z'), s1, e1, null)).toEqual({ kind: 'before' });
  });

  it('rechnet in Wiener Zeit, auch über die Zeitumstellung', () => {
    expect(viennaMinutes(at('2026-10-12T06:25:00Z'))).toBe(clockMinutes('08:25')); // Sommerzeit
    expect(viennaMinutes(at('2026-10-26T07:25:00Z'))).toBe(clockMinutes('08:25')); // Winterzeit
    expect(viennaDate(at('2026-10-11T22:30:00Z'))).toBe('2026-10-12');
  });
});

describe('Begrüßung', () => {
  it('nach Wiener Uhrzeit: Morgen bis 11, Tag bis 17, danach Abend', () => {
    expect(greetingKey(Date.parse('2026-10-13T06:16:00Z'))).toBe('greetingMorning'); // 08:16
    expect(greetingKey(Date.parse('2026-10-13T08:59:00Z'))).toBe('greetingMorning'); // 10:59
    expect(greetingKey(Date.parse('2026-10-13T09:00:00Z'))).toBe('greetingDay'); // 11:00
    expect(greetingKey(Date.parse('2026-10-13T15:00:00Z'))).toBe('greetingEvening'); // 17:00
    expect(greetingKey(Date.parse('2026-12-01T22:30:00Z'))).toBe('greetingEvening'); // 23:30 (Winterzeit)
  });
});
