import { describe, expect, it } from 'vitest';
import {
  describeConstraint,
  planningConstraintInput,
  splitSentences,
  translateWishes,
  type TranslateDirectory,
} from './index';

const dir: TranslateDirectory = {
  teachers: [
    { id: 'hu', firstName: 'Anna', lastName: 'Huber' },
    { id: 'gr', firstName: 'Paul', lastName: 'Gruber' },
  ],
  subjects: [
    { id: 'bsp', name: 'Bewegung und Sport', code: 'BSP' },
    { id: 'm', name: 'Mathematik', code: 'M' },
    { id: 'ch', name: 'Chemie', code: 'CH' },
  ],
  classes: [{ id: '3a', name: '3A' }],
  rooms: [
    { id: 'ts', name: 'Turnsaal' },
    { id: 'chs', name: 'Chemiesaal' },
    { id: 'r12', name: 'R12' },
  ],
  maxPeriod: 7,
};
const one = (text: string) => {
  const r = translateWishes(text, dir);
  expect(r.unresolved).toEqual([]);
  expect(r.proposals).toHaveLength(1);
  const c = r.proposals[0]!.constraint;
  expect(planningConstraintInput.safeParse(c).success).toBe(true);
  return c;
};

describe('Wünsche in Worten (regelbasiert)', () => {
  it('Sätze trennen, ohne "1. Stunde" zu zerschneiden', () => {
    expect(splitSentences('Turnen nicht in der 1. Stunde. Frau Huber hat freitags frei')).toEqual([
      'Turnen nicht in der 1. Stunde',
      'Frau Huber hat freitags frei',
    ]);
  });
  it('freier Tag', () => {
    expect(one('Frau Huber hat freitags frei')).toMatchObject({
      kind: 'TEACHER_UNAVAILABLE',
      teacherId: 'hu',
      weekday: 5,
      periods: [],
      hard: true,
      source: 'TEXT',
    });
  });
  it('erst ab einer Stunde, nur bis zu einer Stunde', () => {
    expect(one('Herr Gruber montags erst ab der 3. Stunde')).toMatchObject({
      teacherId: 'gr',
      weekday: 1,
      periods: [1, 2],
    });
    expect(one('Gruber am Mittwoch nur bis zur 5. Stunde')).toMatchObject({
      weekday: 3,
      periods: [6, 7],
    });
  });
  it('Fach nicht in bestimmten Stunden, auch umgangssprachlich und weich', () => {
    expect(one('Turnen nicht in der ersten Stunde')).toMatchObject({
      kind: 'SUBJECT_NOT_PERIODS',
      subjectId: 'bsp',
      periods: [1],
      hard: true,
    });
    expect(one('Mathe möglichst nicht in der letzten Stunde')).toMatchObject({
      subjectId: 'm',
      periods: [7],
      hard: false,
    });
  });
  it('Fachraum, Stammraum, Höchststunden, Hohlstunden', () => {
    expect(one('Chemie nur im Chemiesaal')).toMatchObject({
      kind: 'SUBJECT_ROOMS',
      subjectId: 'ch',
      roomIds: ['chs'],
    });
    expect(one('3A hat den Stammraum R12')).toMatchObject({
      kind: 'CLASS_HOME_ROOM',
      classId: '3a',
      roomIds: ['r12'],
    });
    expect(one('Frau Huber höchstens 5 Stunden am Tag')).toMatchObject({
      kind: 'TEACHER_MAX_PER_DAY',
      teacherId: 'hu',
      max: 5,
    });
    expect(one('Klassen maximal 6 Stunden pro Tag')).toMatchObject({
      kind: 'CLASS_MAX_PER_DAY',
      classId: null,
      max: 6,
    });
    expect(one('Keine Hohlstunden für Schüler')).toMatchObject({ kind: 'NO_STUDENT_GAPS' });
  });
  it('Unverständliches bleibt offen, statt geraten zu werden', () => {
    const r = translateWishes('Die Bibliothek ist dienstags zu', dir);
    expect(r.proposals).toEqual([]);
    expect(r.unresolved).toEqual(['Die Bibliothek ist dienstags zu']);
  });
});

describe('Zusammenfassung', () => {
  it('beschreibt Wünsche lesbar', () => {
    const names = {
      teacher: () => 'Huber',
      subject: () => 'Turnen',
      cls: () => '3A',
      room: () => 'Turnsaal',
    };
    expect(describeConstraint(one('Frau Huber hat freitags frei'), names)).toBe(
      'Huber: Freitag nicht verfügbar',
    );
    expect(describeConstraint(one('Turnen möglichst nicht in der 1. und 2. Stunde'), names)).toBe(
      'Turnen: nicht in der 1. und 2. Stunde (möglichst)',
    );
  });
});
