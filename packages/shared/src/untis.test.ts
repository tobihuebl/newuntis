import { describe, expect, it } from 'vitest';
import {
  buildLessons,
  buildRequirements,
  parseDif,
  readLessons,
  readTeachers,
  readTimetable,
} from './untis';

/** Ausschnitt eines GPU001-Exports (Komma, Text in Anführungszeichen, Windows-Zeilenenden). */
const GPU001 = [
  '1,"1A","HUB","M","R1",1,1,,',
  '1,"1A","HUB","M","R1",1,2,,', // Doppelstunde
  '2,"1A","MAY","E","R2",2,3,,',
  '2,"1A","KAL","E","R2",2,3,,', // Teamteaching
  '3,"1A","GRU","RK","R3",3,4,,', // Kopplung Religion
  '3,"1B","GRU","RK","R3",3,4,,',
  '3,"1A","WEI","EV","R4",3,4,,',
  '3,"1B","WEI","EV","R4",3,4,,',
  '4,"","HUB","KONF","",4,7,,', // ohne Klasse
  '5,"1A","HUB","M","R1",6,1,,', // Samstag
  '6,"1B","HUB","BSP","TH",5,9,,', // Stunde 9 nicht im Raster
  'kaputt',
].join('\r\n');

describe('Untis-Import (SD-06)', () => {
  it('liest DIF mit Komma oder Semikolon und Anführungszeichen', () => {
    expect(parseDif('1,"a, b","c ""d"""\n\n2;x')[0]).toEqual(['1', 'a, b', 'c "d"']);
    expect(parseDif('﻿"HUB";"Huber"\r\n"MAY";"Mayer"')).toEqual([
      ['HUB', 'Huber'],
      ['MAY', 'Mayer'],
    ]);
  });

  it('fasst Doppelstunden, Teamteaching und Kopplungen zusammen und meldet Übersprungenes', () => {
    const { slots, invalid } = readTimetable(parseDif(GPU001));
    expect(invalid).toEqual([12]);
    const { lessons, warnings } = buildLessons(slots, [1, 2, 3, 4, 5, 6, 7, 8], invalid);
    expect(lessons).toEqual([
      {
        lessonNo: '1',
        classes: ['1A'],
        subject: 'M',
        teachers: ['HUB'],
        room: 'R1',
        weekday: 1,
        periodStart: 1,
        periodCount: 2,
      },
      expect.objectContaining({
        lessonNo: '2',
        teachers: ['KAL', 'MAY'],
        periodCount: 1,
      }),
      expect.objectContaining({
        lessonNo: '3',
        subject: 'EV',
        classes: ['1A', '1B'],
        teachers: ['WEI'],
      }),
      expect.objectContaining({
        lessonNo: '3',
        subject: 'RK',
        classes: ['1A', '1B'],
        teachers: ['GRU'],
      }),
    ]);
    expect(Object.fromEntries(warnings.map((w) => [w.kind, w.count]))).toEqual({
      invalidLine: 1,
      noClass: 1,
      weekend: 1,
      missingPeriod: 1,
    });
  });

  it('Lehrfächerverteilung aus GPU002: Wochenstunden je Kurs, Kopplung als eine Zeile, halbe Stunden aufgerundet', () => {
    const rows = readLessons(
      parseDif(
        [
          '1,4,4,4,"1A","HUB","M","R1"',
          '3,1,1,1,"1A","GRU","RK"',
          '3,1,0,0,"1B","GRU","RK"',
          '7,"0,5",,,"1B","HUB","BSP"',
          '8,2,2,2,"1A","","D"',
        ].join('\n'),
      ),
    );
    expect(buildRequirements(rows)).toEqual([
      { classes: ['1A'], subject: 'M', teacher: 'HUB', hoursPerWeek: 4 },
      { classes: ['1A', '1B'], subject: 'RK', teacher: 'GRU', hoursPerWeek: 1 },
      { classes: ['1B'], subject: 'BSP', teacher: 'HUB', hoursPerWeek: 1 },
    ]);
  });

  it('Lehrkräfte aus GPU004: Kürzel, Nachname, Vorname (Feld 29), E-Mail (Feld 33)', () => {
    const row = Array.from({ length: 33 }, () => '');
    row[0] = 'HUB';
    row[1] = 'Huber';
    row[28] = 'Anna';
    row[32] = 'Anna.Huber@Schule.at';
    expect(readTeachers([row])).toEqual([
      { code: 'HUB', lastName: 'Huber', firstName: 'Anna', email: 'anna.huber@schule.at' },
    ]);
  });
});
