import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  isoWeekday,
  patternsOverlap,
  planDay,
  validateTimetable,
  weekHalfOf,
  type Conflict,
  type LessonRule,
  type PeriodInfo,
  type ValidationContext,
} from './timetable';

const PERIODS: PeriodInfo[] = [
  { number: 1, startTime: '08:00', endTime: '08:50', blocksDouble: false },
  { number: 2, startTime: '08:55', endTime: '09:45', blocksDouble: true },
  { number: 3, startTime: '10:00', endTime: '10:50', blocksDouble: false },
  { number: 4, startTime: '10:55', endTime: '11:45', blocksDouble: false },
  { number: 5, startTime: '11:50', endTime: '12:40', blocksDouble: false },
  { number: 6, startTime: '12:45', endTime: '13:35', blocksDouble: false },
];
const ctx = (over: Partial<ValidationContext> = {}): ValidationContext => ({
  periods: PERIODS,
  classStudents: {},
  groupMembers: {},
  roomCapacity: {},
  ...over,
});
let n = 0;
const rule = (over: Partial<LessonRule> = {}): LessonRule => ({
  id: `l${++n}`,
  weekday: 1,
  periodStart: 1,
  periodCount: 1,
  weekPattern: 'EVERY',
  subjectId: 's',
  classId: 'c1',
  groupId: null,
  roomId: null,
  teacherIds: ['t1'],
  ...over,
});
const codes = (cs: Conflict[]) => cs.map((c) => c.code).sort();

describe('Konfliktprüfung', () => {
  it('findet Lehrkraft, Raum und Klasse doppelt', () => {
    const a = rule({ classId: 'c1', teacherIds: ['t1'], roomId: 'r1' });
    const b = rule({ classId: 'c2', teacherIds: ['t1'], roomId: 'r1' });
    const c = rule({ classId: 'c1', teacherIds: ['t2'], roomId: 'r2' });
    const cs = validateTimetable([a, b, c], ctx());
    expect(codes(cs)).toEqual(['ROOM_DOUBLE', 'STUDENT_DOUBLE', 'TEACHER_DOUBLE']);
    expect(cs.find((x) => x.code === 'TEACHER_DOUBLE')).toMatchObject({
      lessonIds: [a.id, b.id].sort(),
      resource: { kind: 'teacher', id: 't1' },
      weekday: 1,
      period: 1,
      severity: 'hard',
    });
  });

  it('Wochenmuster: A und B kollidieren nicht, EVERY mit beiden', () => {
    const a = rule({ weekPattern: 'A' });
    const b = rule({ weekPattern: 'B' });
    expect(validateTimetable([a, b], ctx())).toEqual([]);
    const every = rule({ weekPattern: 'EVERY' });
    const cs = validateTimetable([a, b, every], ctx());
    const teacher = cs.filter((c) => c.code === 'TEACHER_DOUBLE');
    expect(teacher.map((c) => c.lessonIds)).toEqual(
      expect.arrayContaining([[a.id, every.id].sort(), [b.id, every.id].sort()]),
    );
  });

  it('Doppelstunde überlappt mit der Folgestunde', () => {
    const d = rule({ periodStart: 3, periodCount: 2 });
    const next = rule({ periodStart: 4, teacherIds: ['t1'], classId: 'c9' });
    expect(codes(validateTimetable([d, next], ctx()))).toEqual(['TEACHER_DOUBLE']);
  });

  it('Gruppen: getrennte Teilungsgruppen sind erlaubt, gemeinsame Mitglieder nicht, Klasse gegen eigene Gruppe auch nicht', () => {
    const c = ctx({
      classStudents: { c1: ['s1', 's2', 's3', 's4'] },
      groupMembers: { g1: ['s1', 's2'], g2: ['s3', 's4'], g3: ['s2', 's9'] },
    });
    const g1 = rule({ classId: null, groupId: 'g1', teacherIds: ['t1'] });
    const g2 = rule({ classId: null, groupId: 'g2', teacherIds: ['t2'] });
    expect(validateTimetable([g1, g2], c)).toEqual([]);
    const g3 = rule({ classId: null, groupId: 'g3', teacherIds: ['t3'] });
    const s = validateTimetable([g1, g3], c);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ code: 'STUDENT_DOUBLE', resource: { kind: 'student', id: 's2' } });
    const whole = rule({ classId: 'c1', teacherIds: ['t4'] });
    expect(codes(validateTimetable([whole, g2], c))).toEqual(['STUDENT_DOUBLE']);
  });

  it('außerhalb des Rasters und Doppelstunde über eine Pause (blocksDouble)', () => {
    expect(codes(validateTimetable([rule({ periodStart: 6, periodCount: 2 })], ctx()))).toEqual([
      'OUT_OF_GRID',
    ]);
    expect(codes(validateTimetable([rule({ periodStart: 9 })], ctx()))).toEqual(['OUT_OF_GRID']);
    expect(codes(validateTimetable([rule({ weekday: 6 })], ctx()))).toEqual(['OUT_OF_GRID']);
    expect(codes(validateTimetable([rule({ periodStart: 2, periodCount: 2 })], ctx()))).toEqual([
      'OUT_OF_GRID',
    ]); // Pause nach Stunde 2
    expect(validateTimetable([rule({ periodStart: 1, periodCount: 2 })], ctx())).toEqual([]);
  });

  it('fehlende Lehrkraft oder Klasse/Gruppe; Raumkapazität ist nur eine Warnung', () => {
    expect(codes(validateTimetable([rule({ teacherIds: [] })], ctx()))).toEqual([
      'MISSING_RESOURCE',
    ]);
    expect(codes(validateTimetable([rule({ classId: null })], ctx()))).toEqual([
      'MISSING_RESOURCE',
    ]);
    expect(codes(validateTimetable([rule({ groupId: 'g1' })], ctx()))).toEqual([
      'MISSING_RESOURCE',
    ]);
    const cap = validateTimetable(
      [rule({ roomId: 'r1' })],
      ctx({ roomCapacity: { r1: 2 }, classStudents: { c1: ['a', 'b', 'c'] } }),
    );
    expect(cap).toMatchObject([{ code: 'ROOM_CAPACITY', severity: 'soft' }]);
  });

  it('Einzeländerung: nur Konflikte der geänderten Regel', () => {
    const a = rule({ teacherIds: ['t1'], classId: 'c1' });
    const b = rule({ teacherIds: ['t1'], classId: 'c2' }); // a und b kollidieren bereits
    const moved = { ...rule({ teacherIds: ['t5'], classId: 'c5', roomId: 'r1' }), weekday: 2 };
    const other = rule({ weekday: 2, teacherIds: ['t6'], classId: 'c6', roomId: 'r1' });
    const cs = validateTimetable([a, b, other], ctx(), { lesson: moved });
    expect(cs.map((c) => c.code)).toEqual(['ROOM_DOUBLE']);
    expect(cs[0]!.lessonIds).toContain(moved.id);
  });

  it('ist schnell: 600 Regeln (etwa 24 Klassen) in deutlich unter 100 ms', () => {
    const big: LessonRule[] = [];
    for (let c = 0; c < 24; c++)
      for (let wd = 1; wd <= 5; wd++)
        for (let p = 1; p <= 5; p++)
          big.push(
            rule({
              classId: `c${c}`,
              weekday: wd,
              periodStart: p,
              teacherIds: [`t${(c * 7 + wd * 3 + p) % 60}`],
              roomId: `r${c}`,
            }),
          );
    const students = Object.fromEntries(
      Array.from({ length: 24 }, (_, c) => [
        `c${c}`,
        Array.from({ length: 25 }, (_, s) => `c${c}s${s}`),
      ]),
    );
    const t0 = performance.now();
    validateTimetable(big, ctx({ classStudents: students }));
    validateTimetable(big, ctx({ classStudents: students }), {
      lesson: { ...big[0]!, periodStart: 2 },
    });
    expect(performance.now() - t0).toBeLessThan(100);
  });
});

/** Referenz: naiver Paarvergleich aller Regeln (quadratisch, offensichtlich korrekt). */
function referencePairs(lessons: LessonRule[], c: ValidationContext): Set<string> {
  const pairs = new Set<string>();
  const students = (l: LessonRule) =>
    new Set(
      l.classId
        ? [`class:${l.classId}`, ...(c.classStudents[l.classId] ?? [])]
        : l.groupId
          ? [`group:${l.groupId}`, ...(c.groupMembers[l.groupId] ?? [])]
          : [],
    );
  for (let i = 0; i < lessons.length; i++) {
    for (let j = i + 1; j < lessons.length; j++) {
      const a = lessons[i]!;
      const b = lessons[j]!;
      const overlap =
        a.weekday === b.weekday &&
        a.periodStart < b.periodStart + b.periodCount &&
        b.periodStart < a.periodStart + a.periodCount &&
        patternsOverlap(a.weekPattern, b.weekPattern);
      if (!overlap) continue;
      const key = (code: string) => `${code}|${[a.id, b.id].sort().join(',')}`;
      if (a.teacherIds.some((t) => b.teacherIds.includes(t))) pairs.add(key('TEACHER_DOUBLE'));
      if (a.roomId && a.roomId === b.roomId) pairs.add(key('ROOM_DOUBLE'));
      const sb = students(b);
      if ([...students(a)].some((s) => sb.has(s))) pairs.add(key('STUDENT_DOUBLE'));
    }
  }
  return pairs;
}
function foundPairs(cs: Conflict[]): Set<string> {
  const pairs = new Set<string>();
  for (const c of cs.filter((x) =>
    ['TEACHER_DOUBLE', 'ROOM_DOUBLE', 'STUDENT_DOUBLE'].includes(x.code),
  )) {
    for (let i = 0; i < c.lessonIds.length; i++)
      for (let j = i + 1; j < c.lessonIds.length; j++)
        pairs.add(`${c.code}|${[c.lessonIds[i], c.lessonIds[j]].sort().join(',')}`);
  }
  return pairs;
}

const ruleArb = (i: number) =>
  fc
    .record({
      weekday: fc.integer({ min: 1, max: 2 }),
      periodStart: fc.integer({ min: 1, max: 5 }),
      periodCount: fc.integer({ min: 1, max: 2 }),
      weekPattern: fc.constantFrom('EVERY' as const, 'A' as const, 'B' as const),
      cls: fc.option(fc.constantFrom('c1', 'c2', 'c3'), { nil: null }),
      group: fc.constantFrom('g1', 'g2', 'g3'),
      teachers: fc.uniqueArray(fc.constantFrom('t1', 't2', 't3', 't4'), {
        minLength: 1,
        maxLength: 2,
      }),
      room: fc.option(fc.constantFrom('r1', 'r2', 'r3'), { nil: null }),
    })
    .map((r): LessonRule => ({
      id: `p${i}`,
      weekday: r.weekday,
      periodStart: r.periodStart,
      periodCount: r.periodCount,
      weekPattern: r.weekPattern,
      subjectId: 's',
      classId: r.cls,
      groupId: r.cls ? null : r.group,
      roomId: r.room,
      teacherIds: r.teachers,
    }));

const planArb = fc
  .integer({ min: 0, max: 14 })
  .chain((len) => fc.tuple(...Array.from({ length: len }, (_, i) => ruleArb(i))));
const memberArb = fc.record({
  classStudents: fc.record({
    c1: fc.uniqueArray(fc.constantFrom('s1', 's2', 's3', 's4', 's5'), { maxLength: 3 }),
    c2: fc.uniqueArray(fc.constantFrom('s4', 's5', 's6'), { maxLength: 3 }),
    c3: fc.constant([] as string[]),
  }),
  groupMembers: fc.record({
    g1: fc.uniqueArray(fc.constantFrom('s1', 's2', 's6'), { maxLength: 2 }),
    g2: fc.uniqueArray(fc.constantFrom('s3', 's7'), { maxLength: 2 }),
    g3: fc.constant([] as string[]),
  }),
});

describe('Konfliktprüfung: Property-Tests gegen die Referenz', () => {
  it('findet in zufälligen Plänen genau die Doppelbelegungen des Paarvergleichs', () => {
    fc.assert(
      fc.property(planArb, memberArb, (plan, members) => {
        const c = ctx(members);
        expect(foundPairs(validateTimetable(plan, c))).toEqual(referencePairs(plan, c));
      }),
      { numRuns: 500 },
    );
  });

  it('eine eingefügte Doppelbelegung wird immer gefunden', () => {
    fc.assert(
      fc.property(
        planArb,
        fc.nat(),
        fc.constantFrom('teacher', 'room', 'class'),
        (plan, pick, kind) => {
          fc.pre(plan.length > 0);
          const base = plan[pick % plan.length]!;
          const clash: LessonRule = {
            ...base,
            id: 'clash',
            teacherIds: kind === 'teacher' ? [base.teacherIds[0]!] : ['t-neu'],
            roomId: kind === 'room' ? (base.roomId ?? 'r-x') : 'r-neu',
            classId: kind === 'class' ? (base.classId ?? 'c-x') : 'c-neu',
            groupId: null,
          };
          const target =
            kind === 'room' && !base.roomId
              ? { ...base, roomId: 'r-x' }
              : kind === 'class' && !base.classId
                ? { ...base, classId: 'c-x', groupId: null }
                : base;
          const all = plan.map((l) => (l.id === base.id ? target : l));
          const cs = validateTimetable(all, ctx(), { lesson: clash });
          const code =
            kind === 'teacher'
              ? 'TEACHER_DOUBLE'
              : kind === 'room'
                ? 'ROOM_DOUBLE'
                : 'STUDENT_DOUBLE';
          expect(
            cs.some(
              (c) =>
                c.code === code && c.lessonIds.includes('clash') && c.lessonIds.includes(base.id),
            ),
          ).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('Wochenmuster A/B', () => {
  const ref = '2026-09-07'; // A-Woche
  it('wechselt wöchentlich, auch mitten in der Woche', () => {
    expect(weekHalfOf('2026-09-07', ref)).toBe('A');
    expect(weekHalfOf('2026-09-11', ref)).toBe('A');
    expect(weekHalfOf('2026-09-14', ref)).toBe('B');
    expect(weekHalfOf('2026-09-21', ref)).toBe('A');
    expect(weekHalfOf('2026-08-31', ref)).toBe('B'); // vor dem Referenz-Montag
  });

  it('über die Jahresgrenze mit 53 Kalenderwochen (2026) läuft die Folge weiter', () => {
    // 2026-12-28 ist Montag der KW 53, 2027-01-04 Montag der KW 1: ISO-Wochennummern würden zweimal "ungerade" liefern
    const half1 = weekHalfOf('2026-12-28', ref);
    const half2 = weekHalfOf('2027-01-04', ref);
    expect(half1).not.toBe(half2);
    // jede Woche wechselt, über ein ganzes Jahr
    let prev = weekHalfOf(ref, ref);
    for (let d = addDays(ref, 7); d < '2027-09-07'; d = addDays(d, 7)) {
      const cur = weekHalfOf(d, ref);
      expect(cur).not.toBe(prev);
      prev = cur;
    }
  });
});

describe('Terminerzeugung', () => {
  const input = (lessons: LessonRule[], freeDays: { fromDate: string; toDate: string }[] = []) => ({
    lessons,
    periods: PERIODS,
    freeDays,
    referenceMonday: '2026-09-07',
    timezone: 'Europe/Vienna',
  });

  it('Zeitumstellung 25.10.2026: 08:00 Wien ist vorher 06:00 UTC, danach 07:00 UTC', () => {
    const fri = rule({ weekday: 5 });
    const tue = rule({ weekday: 2, periodStart: 3, periodCount: 2 });
    const [before] = planDay('2026-10-23', input([fri]));
    expect(before!.startsAt.toISOString()).toBe('2026-10-23T06:00:00.000Z'); // Sommerzeit (UTC+2)
    expect(before!.endsAt.toISOString()).toBe('2026-10-23T06:50:00.000Z');
    const [after] = planDay('2026-10-27', input([tue]));
    expect(after!.startsAt.toISOString()).toBe('2026-10-27T09:00:00.000Z'); // Winterzeit (UTC+1), 10:00 lokal
    expect(after!.endsAt.toISOString()).toBe('2026-10-27T10:45:00.000Z'); // Ende der 4. Stunde
  });

  it('Zeitumstellung im Frühling (29.03.2027)', () => {
    const fri = rule({ weekday: 5 });
    const mon = rule({ weekday: 1 });
    expect(planDay('2027-03-26', input([fri]))[0]!.startsAt.toISOString()).toBe(
      '2027-03-26T07:00:00.000Z',
    );
    expect(planDay('2027-03-29', input([mon]))[0]!.startsAt.toISOString()).toBe(
      '2027-03-29T06:00:00.000Z',
    );
  });

  it('keine Termine am Wochenende und an schulfreien Tagen; A/B nach Woche', () => {
    const every = rule({ weekday: 1 });
    const a = rule({ weekday: 1, weekPattern: 'A', periodStart: 2 });
    const b = rule({ weekday: 1, weekPattern: 'B', periodStart: 3 });
    expect(isoWeekday('2026-10-24')).toBe(6);
    expect(planDay('2026-10-24', input([rule({ weekday: 6 })]))).toEqual([]);
    expect(
      planDay('2026-10-26', input([every], [{ fromDate: '2026-10-26', toDate: '2026-10-26' }])),
    ).toEqual([]);
    expect(
      planDay('2026-12-28', input([every], [{ fromDate: '2026-12-24', toDate: '2027-01-06' }])),
    ).toEqual([]);
    const weekA = planDay('2026-09-07', input([every, a, b])).map((o) => o.lessonId);
    const weekB = planDay('2026-09-14', input([every, a, b])).map((o) => o.lessonId);
    expect(weekA).toEqual([every.id, a.id]);
    expect(weekB).toEqual([every.id, b.id]);
  });
});
