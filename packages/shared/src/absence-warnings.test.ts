import { describe, expect, it } from 'vitest';
import { absenceWarnings, type AbsenceStatusName } from './absences';

const at = (date: string, h = 8) => new Date(`${date}T0${h}:00:00Z`);
const lesson = (studentId: string, date: string, h = 8) => ({
  studentId,
  date,
  startsAt: at(date, h),
});
const absence = (studentId: string, from: string, to: string, status: AbsenceStatusName) => ({
  studentId,
  fromAt: new Date(`${from}T00:00:00Z`),
  toAt: new Date(`${to}T23:59:59Z`),
  status,
});
const opts = {
  today: '2026-10-14',
  yearStart: '2026-09-07',
  warnUnexcusedLessons: 3,
  warnLessons: 4,
  warnWindowDays: 7,
};

describe('absenceWarnings (AB-05)', () => {
  it('zählt unentschuldigte Stunden im Schuljahr und alle Fehlstunden im Fenster', () => {
    const lessons = [
      // a: drei unentschuldigte Stunden im September
      lesson('a', '2026-09-20', 7),
      lesson('a', '2026-09-20', 8),
      lesson('a', '2026-09-21', 8),
      // b: vier entschuldigte Stunden in den letzten sieben Tagen
      ...[1, 2, 3, 4].map((h) => lesson('b', '2026-10-12', h)),
      // c: knapp unter beiden Schwellen
      lesson('c', '2026-10-13'),
      // vor dem Schuljahr und in der Zukunft zählen nicht
      lesson('a', '2026-09-01'),
      lesson('b', '2026-10-20'),
    ];
    const absences = [
      absence('a', '2026-09-20', '2026-09-21', 'UNEXCUSED'),
      absence('b', '2026-10-12', '2026-10-12', 'EXCUSED'),
      absence('c', '2026-10-13', '2026-10-13', 'REJECTED'),
    ];
    expect(absenceWarnings(lessons, absences, opts)).toEqual([
      { studentId: 'a', unexcused: 3, recent: 0, kinds: ['UNEXCUSED'] },
      { studentId: 'b', unexcused: 0, recent: 4, kinds: ['FREQUENT'] },
    ]);
  });

  it('Schwelle 0 schaltet die Warnung aus; offene Fehlzeiten sind (noch) nicht unentschuldigt', () => {
    const lessons = [1, 2, 3, 4, 5].map((h) => lesson('a', '2026-10-13', h));
    const open = [absence('a', '2026-10-13', '2026-10-13', 'OPEN')];
    expect(absenceWarnings(lessons, open, { ...opts, warnLessons: 0 })).toEqual([]);
    expect(absenceWarnings(lessons, open, opts)[0]!.kinds).toEqual(['FREQUENT']);
  });
});
