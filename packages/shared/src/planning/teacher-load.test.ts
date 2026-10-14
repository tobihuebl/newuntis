import { describe, expect, it } from 'vitest';
import { teacherProfileInput } from '../masterdata';
import { teacherLoad } from './coverage';

describe('teacherLoad', () => {
  const req = (teacherId: string, subjectId: string, hoursPerWeek: number) => ({
    teacherId,
    subjectId,
    hoursPerWeek,
  });

  it('vergleicht die Lehrfächerverteilung mit dem Unterrichtsausmaß, größte Abweichung zuerst', () => {
    const rows = teacherLoad(
      [req('a', 'M', 4), req('a', 'D', 4), req('b', 'M', 10), req('c', 'E', 3)],
      [
        { id: 'a', teachingHours: 10, subjectIds: ['M', 'D'] },
        { id: 'b', teachingHours: 10, subjectIds: [] },
        { id: 'd', teachingHours: 5, subjectIds: [] },
      ],
    );
    expect(rows).toEqual([
      { teacherId: 'd', target: 5, assigned: 0, diff: -5, unqualified: [] },
      { teacherId: 'a', target: 10, assigned: 8, diff: -2, unqualified: [] },
      { teacherId: 'b', target: 10, assigned: 10, diff: 0, unqualified: [] },
      { teacherId: 'c', target: null, assigned: 3, diff: null, unqualified: [] },
    ]);
  });

  it('meldet Fächer ohne Lehrbefähigung nur, wenn Fächer gepflegt sind', () => {
    const rows = teacherLoad(
      [req('a', 'M', 4), req('a', 'BSP', 2), req('b', 'BSP', 2)],
      [
        { id: 'a', teachingHours: 6, subjectIds: ['M'] },
        { id: 'b', teachingHours: 2, subjectIds: [] },
      ],
    );
    expect(rows.find((r) => r.teacherId === 'a')!.unqualified).toEqual(['BSP']);
    expect(rows.find((r) => r.teacherId === 'b')!.unqualified).toEqual([]);
  });
});

describe('teacherProfileInput', () => {
  it('erlaubt halbe Stunden und entfernt doppelte Fächer', () => {
    expect(
      teacherProfileInput.parse({
        subjectIds: ['m', 'm'],
        employmentHours: 20,
        teachingHours: 10.5,
      }),
    ).toEqual({ subjectIds: ['m'], employmentHours: 20, teachingHours: 10.5 });
  });
  it('Unterricht höchstens so viel wie das Beschäftigungsausmaß, nur ganze oder halbe Stunden', () => {
    expect(
      teacherProfileInput.safeParse({ subjectIds: [], employmentHours: 10, teachingHours: 12 })
        .success,
    ).toBe(false);
    expect(
      teacherProfileInput.safeParse({ subjectIds: [], employmentHours: null, teachingHours: 7.25 })
        .success,
    ).toBe(false);
  });
});
