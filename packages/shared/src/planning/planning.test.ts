import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateTimetable, type LessonRule, type PeriodInfo } from '../timetable';
import {
  checkConstraints,
  planningConstraintInput,
  requirementCoverage,
  solveTimetable,
  unplacedMessage,
  type PlanningConstraint,
  type RequirementRule,
  type SolverInput,
} from './index';

const PERIODS: PeriodInfo[] = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  number: n,
  startTime: `${String(7 + n).padStart(2, '0')}:00`,
  endTime: `${String(7 + n).padStart(2, '0')}:50`,
  blocksDouble: n === 2 || n === 4, // große Pausen nach der 2. und 4. Stunde
}));

let n = 0;
const req = (over: Partial<RequirementRule> = {}): RequirementRule => ({
  id: `r${String(++n).padStart(3, '0')}`,
  subjectId: 'M',
  classId: '1A',
  groupId: null,
  teacherId: 'T1',
  hoursPerWeek: 4,
  preferDouble: false,
  ...over,
});
const wish = (over: Partial<PlanningConstraint>): PlanningConstraint => ({
  id: `w${++n}`,
  kind: 'TEACHER_UNAVAILABLE',
  hard: true,
  active: true,
  teacherId: null,
  classId: null,
  subjectId: null,
  roomIds: [],
  weekday: null,
  periods: [],
  max: null,
  source: 'FORM',
  text: null,
  ...over,
});
const input = (over: Partial<SolverInput>): SolverInput => ({
  periods: PERIODS,
  requirements: [],
  fixed: [],
  rooms: [],
  classStudents: {},
  groupMembers: {},
  constraints: [],
  dayLoadMax: 6,
  seed: 1,
  ...over,
});
const hard = (i: SolverInput, lessons: LessonRule[]) =>
  [
    ...validateTimetable([...i.fixed, ...lessons], {
      periods: i.periods,
      classStudents: i.classStudents,
      groupMembers: i.groupMembers,
      roomCapacity: Object.fromEntries(i.rooms.map((r) => [r.id, r.capacity])),
    }),
    ...checkConstraints([...i.fixed, ...lessons], i.constraints),
  ].filter((c) => c.severity === 'hard');

/** Kleine Schule: Klassen mit Fächern, Lehrkräfte mit Fächern. */
function school(classes: string[], plan: [string, string, number, boolean?][]) {
  const requirements: RequirementRule[] = [];
  for (const c of classes)
    for (const [subject, teacher, hours, double] of plan)
      requirements.push(
        req({
          classId: c,
          subjectId: subject,
          teacherId: `${teacher}-${c}`,
          hoursPerWeek: hours,
          preferDouble: !!double,
        }),
      );
  return requirements;
}

describe('Planungswünsche', () => {
  it('Schema verlangt je Art die nötigen Felder', () => {
    expect(
      planningConstraintInput.safeParse({ kind: 'TEACHER_UNAVAILABLE', teacherId: 't' }).success,
    ).toBe(false);
    expect(
      planningConstraintInput.safeParse({ kind: 'TEACHER_UNAVAILABLE', teacherId: 't', weekday: 5 })
        .success,
    ).toBe(true);
    expect(
      planningConstraintInput.safeParse({ kind: 'SUBJECT_ROOMS', subjectId: 'S' }).success,
    ).toBe(false);
  });
  it('Prüfung findet Verstöße gegen harte und weiche Wünsche', () => {
    const lessons: LessonRule[] = [
      {
        id: 'a',
        weekday: 5,
        periodStart: 1,
        periodCount: 1,
        weekPattern: 'EVERY',
        subjectId: 'TU',
        classId: '1A',
        groupId: null,
        roomId: null,
        teacherIds: ['T1'],
      },
    ];
    const cs = checkConstraints(lessons, [
      wish({ teacherId: 'T1', weekday: 5 }),
      wish({ kind: 'SUBJECT_NOT_PERIODS', subjectId: 'TU', periods: [1], hard: false }),
    ]);
    expect(cs.map((c) => [c.code, c.severity])).toEqual([
      ['WISH_VIOLATED', 'hard'],
      ['WISH_VIOLATED', 'soft'],
    ]);
  });
});

describe('Soll gegen Ist', () => {
  it('zählt Stunden je Soll-Zeile, A/B halb, Doppelstunden doppelt', () => {
    const r = req({ hoursPerWeek: 3 });
    const l = (o: Partial<LessonRule>): LessonRule => ({
      id: `x${++n}`,
      weekday: 1,
      periodStart: 1,
      periodCount: 1,
      weekPattern: 'EVERY',
      subjectId: 'M',
      classId: '1A',
      groupId: null,
      roomId: null,
      teacherIds: ['T1'],
      ...o,
    });
    expect(requirementCoverage([r], [l({ periodCount: 2 }), l({ weekPattern: 'A' })])).toEqual([
      { requirementId: r.id, required: 3, planned: 2.5, diff: -0.5 },
    ]);
  });
});

describe('Solver', () => {
  it('plant eine kleine Schule vollständig und ohne harte Konflikte', () => {
    const i = input({
      requirements: school(
        ['1A', '1B'],
        [
          ['D', 'De', 4],
          ['M', 'Ma', 4],
          ['E', 'En', 3],
          ['BSP', 'Sp', 2, true],
          ['BE', 'Ku', 2, true],
        ],
      ),
    });
    const r = solveTimetable(i);
    expect(r.unplaced).toEqual([]);
    expect(hard(i, r.lessons)).toEqual([]);
    const cov = requirementCoverage(i.requirements, r.lessons);
    expect(cov.every((c) => c.diff === 0)).toBe(true);
    // Doppelstunden nie über eine große Pause
    for (const l of r.lessons.filter((x) => x.periodCount === 2))
      expect([2, 4]).not.toContain(l.periodStart);
  });

  it('ist reproduzierbar: gleicher Startwert, gleicher Plan; anderer Startwert darf abweichen', () => {
    const base = input({
      requirements: school(
        ['1A', '1B', '2A'],
        [
          ['D', 'De', 4],
          ['M', 'Ma', 4],
          ['E', 'En', 3],
        ],
      ),
    });
    const a = solveTimetable(base);
    const b = solveTimetable(base);
    expect(b.lessons).toEqual(a.lessons);
    expect(b.cost).toBe(a.cost);
  });

  it('hält harte Wünsche ein: freier Tag, gesperrte Stunde, Fachraum', () => {
    const i = input({
      requirements: [
        req({ subjectId: 'M', teacherId: 'HU', hoursPerWeek: 5 }),
        req({ subjectId: 'BSP', teacherId: 'SP', hoursPerWeek: 3 }),
        req({ subjectId: 'BSP', teacherId: 'SP', classId: '1B', hoursPerWeek: 3 }),
      ],
      rooms: [{ id: 'TS', capacity: null }],
      constraints: [
        wish({ teacherId: 'HU', weekday: 5 }),
        wish({ kind: 'SUBJECT_NOT_PERIODS', subjectId: 'BSP', periods: [1] }),
        wish({ kind: 'SUBJECT_ROOMS', subjectId: 'BSP', roomIds: ['TS'] }),
      ],
    });
    const r = solveTimetable(i);
    expect(r.unplaced).toEqual([]);
    expect(hard(i, r.lessons)).toEqual([]);
    expect(r.lessons.filter((l) => l.teacherIds[0] === 'HU' && l.weekday === 5)).toEqual([]);
    expect(
      r.lessons
        .filter((l) => l.subjectId === 'BSP')
        .every((l) => l.roomId === 'TS' && l.periodStart > 1),
    ).toBe(true);
  });

  it('Teilplanung: feste Stunden bleiben und zählen zum Soll', () => {
    const r1 = req({ subjectId: 'M', teacherId: 'T1', hoursPerWeek: 4 });
    const pinned: LessonRule = {
      id: 'pin',
      weekday: 1,
      periodStart: 1,
      periodCount: 1,
      weekPattern: 'EVERY',
      subjectId: 'M',
      classId: '1A',
      groupId: null,
      roomId: null,
      teacherIds: ['T1'],
    };
    const i = input({ requirements: [r1], fixed: [pinned] });
    const r = solveTimetable(i);
    expect(r.lessons).toHaveLength(3);
    expect(r.lessons.some((l) => l.weekday === 1 && l.periodStart === 1)).toBe(false);
  });

  it('erklärt, was nicht passt, statt harte Regeln zu brechen', () => {
    const i = input({
      periods: PERIODS.slice(0, 2),
      weekdays: [1],
      requirements: [req({ subjectId: 'M', teacherId: 'T1', hoursPerWeek: 3 })],
    });
    const r = solveTimetable(i);
    expect(r.lessons).toHaveLength(2);
    expect(r.unplaced).toEqual([
      { requirementId: i.requirements[0]!.id, periodCount: 1, reason: 'TEACHER_FULL' },
    ]);
    expect(unplacedMessage('NO_COMMON_SLOT', 'Mathe', '3A')).toBe(
      'Mathe 3A: keine freie Zeit, in der Lehrkraft und Klasse gleichzeitig frei sind',
    );
  });

  it('Gruppen und Klassen teilen Schüler:innen: keine Überschneidung', () => {
    const i = input({
      classStudents: { '1A': ['s1', 's2', 's3'] },
      groupMembers: { RK: ['s1', 's2'], RE: ['s3'] },
      requirements: [
        req({ subjectId: 'M', teacherId: 'T1', hoursPerWeek: 5 }),
        req({ subjectId: 'RK', classId: null, groupId: 'RK', teacherId: 'T2', hoursPerWeek: 2 }),
        req({ subjectId: 'RE', classId: null, groupId: 'RE', teacherId: 'T3', hoursPerWeek: 2 }),
      ],
    });
    const r = solveTimetable(i);
    expect(r.unplaced).toEqual([]);
    expect(hard(i, r.lessons)).toEqual([]);
  });

  it('Eigenschaft: in zufälligen Schulen nie harte Konflikte, Stunden vollständig verbucht', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.array(
          fc.tuple(fc.integer({ min: 1, max: 5 }), fc.integer({ min: 0, max: 3 }), fc.boolean()),
          {
            minLength: 1,
            maxLength: 8,
          },
        ),
        fc.integer({ min: 1, max: 1000 }),
        (classCount, subjects, seed) => {
          const classes = Array.from({ length: classCount }, (_, k) => `K${k}`);
          const requirements: RequirementRule[] = [];
          classes.forEach((c, ci) =>
            subjects.forEach(([hours, teacher, double], si) =>
              requirements.push(
                req({
                  id: `q${ci}-${si}`,
                  classId: c,
                  subjectId: `F${si}`,
                  teacherId: `L${(teacher + ci) % 4}`, // Lehrkräfte unterrichten mehrere Klassen
                  hoursPerWeek: hours,
                  preferDouble: double,
                }),
              ),
            ),
          );
          const i = input({ requirements, seed, iterations: 200 });
          const r = solveTimetable(i);
          expect(hard(i, r.lessons)).toEqual([]);
          const placed = r.lessons.reduce((s, l) => s + l.periodCount, 0);
          const missing = r.unplaced.reduce((s, u) => s + u.periodCount, 0);
          expect(placed + missing).toBe(requirements.reduce((s, q) => s + q.hoursPerWeek, 0));
        },
      ),
      { numRuns: 60 },
    );
  });

  it('Demoschule (8 Klassen, 28 Stunden je Klasse) in wenigen Sekunden ohne harte Konflikte', () => {
    const classes = ['1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B'];
    const plan: [string, string, number, boolean?][] = [
      ['D', 'De', 4],
      ['M', 'Ma', 4],
      ['E', 'En', 4],
      ['GSP', 'Ge', 2],
      ['GW', 'Gw', 2],
      ['BU', 'Bi', 2],
      ['PH', 'Ph', 2],
      ['BE', 'Ku', 2, true],
      ['ME', 'Mu', 2],
      ['BSP', 'Sp', 4, true],
    ];
    // Lehrkräfte unterrichten ihr Fach in zwei Klassen (Paare 1A/1B …)
    const requirements = school(classes, plan).map((r) => ({
      ...r,
      teacherId: `${r.teacherId.split('-')[0]}-${r.classId![0]}`,
    }));
    const i = input({ requirements, dayLoadMax: 6 });
    const t0 = Date.now();
    const r = solveTimetable(i);
    const ms = Date.now() - t0;
    expect(hard(i, r.lessons)).toEqual([]);
    expect(r.unplaced).toEqual([]);
    expect(ms).toBeLessThan(10_000);
    const gaps = validateTimetable(r.lessons, {
      periods: PERIODS,
      classStudents: {},
      groupMembers: {},
      roomCapacity: {},
      soft: { dayLoadMax: 6 },
    }).filter((c) => c.code === 'GAP_STUDENT');
    expect(gaps.length).toBeLessThanOrEqual(2);
  });
});
