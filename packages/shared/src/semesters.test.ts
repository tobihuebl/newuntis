import { describe, expect, it } from 'vitest';
import { absenceWarnings } from './absences';
import { secondSemesterFromBreak, semesterOf, semesterQuery, semesterRanges } from './semesters';

describe('Semester (SD-01, ADR 0022)', () => {
  const year = { startsOn: '2026-09-07', endsOn: '2027-07-02' };

  it('zwei Semester aus dem Beginn des zweiten; ungültig oder fehlend: keine', () => {
    expect(semesterRanges({ ...year, secondSemesterFrom: '2027-02-08' })).toEqual([
      { no: 1, from: '2026-09-07', to: '2027-02-07' },
      { no: 2, from: '2027-02-08', to: '2027-07-02' },
    ]);
    expect(semesterRanges({ ...year, secondSemesterFrom: null })).toBeNull();
    expect(semesterRanges({ ...year, secondSemesterFrom: '2026-09-07' })).toBeNull();
    expect(semesterRanges({ ...year, secondSemesterFrom: '2027-08-01' })).toBeNull();
  });

  it('Beginn aus den Semesterferien: Tag nach dem letzten freien Tag', () => {
    expect(
      secondSemesterFromBreak([
        { toDate: '2026-11-02', label: 'Allerheiligen' },
        { toDate: '2027-02-07', label: 'Semesterferien' },
      ]),
    ).toBe('2027-02-08');
    expect(
      secondSemesterFromBreak([{ toDate: '2026-12-31', label: 'Weihnachtsferien' }]),
    ).toBeNull();
  });

  it('Semester eines Tages und Abfrageparameter', () => {
    const r = semesterRanges({ ...year, secondSemesterFrom: '2027-02-08' });
    expect(semesterOf(r, '2027-02-07')).toBe(1);
    expect(semesterOf(r, '2027-02-08')).toBe(2);
    expect(semesterOf(r, '2027-08-01')).toBeNull();
    expect(semesterQuery.parse({ semester: '2' })).toEqual({ semester: 2 });
    expect(semesterQuery.parse({})).toEqual({});
    expect(semesterQuery.safeParse({ semester: '3' }).success).toBe(false);
  });

  it('Frühwarnung zählt unentschuldigte Stunden ab Semesterbeginn, häufige Fehlzeiten weiter im Fenster', () => {
    const at = (d: string) => new Date(`${d}T08:00:00Z`);
    const lessons = ['2027-02-04', '2027-02-05', '2027-02-09'].map((date) => ({
      studentId: 's',
      date,
      startsAt: at(date),
    }));
    const absences = [
      {
        studentId: 's',
        fromAt: at('2027-02-01'),
        toAt: at('2027-02-10'),
        status: 'UNEXCUSED' as const,
      },
    ];
    const o = {
      today: '2027-02-10',
      yearStart: '2026-09-07',
      warnUnexcusedLessons: 1,
      warnLessons: 3,
      warnWindowDays: 30,
    };
    expect(absenceWarnings(lessons, absences, o)[0]).toMatchObject({ unexcused: 3, recent: 3 });
    expect(
      absenceWarnings(lessons, absences, { ...o, unexcusedFrom: '2027-02-08' })[0],
    ).toMatchObject({ unexcused: 1, recent: 3 });
  });
});
