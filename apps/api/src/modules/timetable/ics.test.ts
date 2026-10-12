import { describe, expect, it } from 'vitest';
import { buildIcs, fold } from './ics';

describe('iCal-Export', () => {
  it('faltet lange Zeilen nach höchstens 75 Oktetten, auch mit Umlauten', () => {
    const line = `SUMMARY:${'Bewegung und Sport mit Übungsstunde für Größere '.repeat(4)}`;
    const folded = fold(line).split('\r\n');
    expect(folded.length).toBeGreaterThan(1);
    expect(folded.every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(folded.slice(1).every((l) => l.startsWith(' '))).toBe(true);
    expect(folded.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(line); // verlustfrei
  });

  it('maskiert Komma, Strichpunkt, Backslash und Zeilenumbruch; Zeiten in UTC; Entfall als CANCELLED', () => {
    const ics = buildIcs(
      'Plan',
      [
        {
          uid: 'a@x',
          start: new Date('2026-10-23T06:00:00Z'),
          end: new Date('2026-10-23T06:50:00Z'),
          summary: 'Mathe; Test, 1A\\B',
          location: 'Raum\n2',
          cancelled: true,
        },
      ],
      new Date('2026-10-01T00:00:00Z'),
    );
    expect(ics).toContain(String.raw`SUMMARY:Mathe\; Test\, 1A\\B`);
    expect(ics).toContain('LOCATION:Raum\\n2');
    expect(ics).toContain('DTSTART:20261023T060000Z');
    expect(ics).toContain('DTEND:20261023T065000Z');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
