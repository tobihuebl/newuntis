import { describe, expect, it } from 'vitest';
import { parseRequirementsCsv, type RequirementDirectory } from './requirements-csv';

const dir: RequirementDirectory = {
  teachers: [
    { id: 'hu', firstName: 'Anna', lastName: 'Huber', email: 'huber@schule.test' },
    { id: 'hu2', firstName: 'Max', lastName: 'Huber', email: null },
    { id: 'gr', firstName: 'Paul', lastName: 'Gruber', email: null },
  ],
  subjects: [
    { id: 'm', name: 'Mathematik', code: 'M' },
    { id: 'bsp', name: 'Bewegung und Sport', code: 'BSP' },
  ],
  classes: [{ id: '1a', name: '1A' }],
  groups: [{ id: 'rk', name: 'RK 1' }],
};

describe('Lehrfächerverteilung (CSV)', () => {
  it('liest Excel-CSV mit Semikolon, Kürzel, E-Mail oder Name, Doppelstunde', () => {
    const csv =
      'Klasse;Gruppe;Fach;Lehrkraft;Wochenstunden;Doppelstunde\n1A;;M;huber@schule.test;4;\n1A;;Bewegung und Sport;Gruber Paul;3;ja\n;RK 1;M;Paul Gruber;2;';
    const r = parseRequirementsCsv(csv, dir);
    expect(r.missingColumns).toEqual([]);
    expect(
      r.rows.map((x) => [
        x.line,
        x.classId,
        x.groupId,
        x.subjectId,
        x.teacherId,
        x.hoursPerWeek,
        x.preferDouble,
        x.errors,
      ]),
    ).toEqual([
      [2, '1a', null, 'm', 'hu', 4, false, []],
      [3, '1a', null, 'bsp', 'gr', 3, true, []],
      [4, null, 'rk', 'm', 'gr', 2, false, []],
    ]);
  });
  it('meldet Fehler je Zeile verständlich', () => {
    const csv = 'Klasse;Fach;Lehrer;Std\n2Z;Physik;Huber;x';
    const [row] = parseRequirementsCsv(csv, dir).rows;
    expect(row!.errors).toEqual([
      'Klasse "2Z" unbekannt',
      'Fach "Physik" unbekannt',
      'Lehrkraft "Huber" ist nicht eindeutig (E-Mail angeben)',
      'Wochenstunden: ganze Zahl von 1 bis 30',
    ]);
  });
  it('fehlende Spalten', () => {
    expect(parseRequirementsCsv('Name;Wert\na;b', dir).missingColumns).toEqual([
      'Klasse oder Gruppe',
      'Fach',
      'Lehrkraft',
      'Wochenstunden',
    ]);
  });
});
