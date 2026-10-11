import { describe, expect, it } from 'vitest';
import {
  cleanText,
  detectDelimiter,
  mapHeaders,
  normalizeKey,
  parseCsv,
  parseDate,
  parseKind,
  splitIds,
} from './csv';

describe('CSV-Hilfen', () => {
  it('erkennt Trennzeichen (Semikolon wie von Excel in Österreich, Komma, Tab)', () => {
    expect(detectDelimiter('Vorname;Nachname;Klasse')).toBe(';');
    expect(detectDelimiter('Vorname,Nachname,Klasse')).toBe(',');
    expect(detectDelimiter('Vorname\tNachname')).toBe('\t');
    expect(detectDelimiter('"Name, Vor";Klasse')).toBe(';'); // Komma in Anführungszeichen zählt nicht
  });

  it('entfernt BOM und vereinheitlicht Zeilenenden', () => {
    expect(cleanText('﻿a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('normalisiert Spaltennamen (Umlaute, Sonderzeichen, Groß-/Kleinschreibung)', () => {
    expect(normalizeKey('Schüler-Nr.')).toBe('schuelernr');
    expect(normalizeKey(' E-Mail Adresse ')).toBe('emailadresse');
    expect(normalizeKey('Straße')).toBe('strasse');
  });

  it('erkennt gängige Spaltennamen automatisch', () => {
    const m = mapHeaders([
      'Familienname',
      'Rufname',
      'Stammklasse',
      'Schüler-Nr.',
      'E-Mail',
      'Geburtsdatum',
      'Art',
      'Kind',
    ]);
    expect(m).toEqual({
      lastName: 'Familienname',
      firstName: 'Rufname',
      class: 'Stammklasse',
      externalId: 'Schüler-Nr.',
      email: 'E-Mail',
      birthDate: 'Geburtsdatum',
      role: 'Art',
      childExternalIds: 'Kind',
    });
  });

  it('ausdrückliche Zuordnung hat Vorrang vor der automatischen Erkennung', () => {
    const m = mapHeaders(['Name', 'Zuname', 'Typ'], { lastName: 'Name' });
    expect(m.lastName).toBe('Name');
    expect(m.role).toBe('Typ');
  });

  it('liest Rollenbezeichnungen in mehreren Schreibweisen', () => {
    expect(parseKind('Schüler')).toBe('STUDENT');
    expect(parseKind('Schülerin')).toBe('STUDENT');
    expect(parseKind('Lehrer:in')).toBe('TEACHER');
    expect(parseKind('Lehrkraft')).toBe('TEACHER');
    expect(parseKind('Erziehungsberechtigte')).toBe('GUARDIAN');
    expect(parseKind('Hausmeister')).toBeNull();
  });

  it('liest Datum als TT.MM.JJJJ und JJJJ-MM-TT und lehnt unmögliche Tage ab', () => {
    expect(parseDate('05.03.2014')).toBe('2014-03-05');
    expect(parseDate('2014-3-5')).toBe('2014-03-05');
    expect(parseDate('31.02.2014')).toBeNull();
    expect(parseDate('05.03.14')).toBeNull();
    expect(parseDate('morgen')).toBeNull();
  });

  it('trennt mehrere Schülernummern', () => {
    expect(splitIds('S1; S2 | S3,S4/S5')).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
    expect(splitIds('')).toEqual([]);
  });

  it('parst Anführungszeichen, leere Zeilen und liefert Dateizeilen', () => {
    const csv = parseCsv('﻿Vorname;Nachname\n"Anna";"Gruber, Maria"\n\nBen;Huber\n');
    expect(csv.delimiter).toBe(';');
    expect(csv.headers).toEqual(['Vorname', 'Nachname']);
    expect(csv.rows).toEqual([
      { line: 2, cells: ['Anna', 'Gruber, Maria'] },
      { line: 3, cells: ['Ben', 'Huber'] },
    ]);
  });
});
