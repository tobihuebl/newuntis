# ADR 0015: Frühwarnung bei Häufung von Fehlzeiten (AB-05)

Status: angenommen (2026-10-14)

## Kontext

Klassenvorstände sollen früh merken, wenn eine Schülerin oder ein Schüler auffällig oft fehlt, bevor die
Grenzen des Schulpflichtgesetzes erreicht sind (unentschuldigt mehr als drei Schultage oder 15 Stunden im Semester).

## Entscheidung

1. **Zwei Schwellen je Schule** in `settings.absence`: `warnUnexcusedLessons` (unentschuldigte Fehlstunden im
   Schuljahr, Standard 10) und `warnLessons` in `warnWindowDays` (alle Fehlstunden im Zeitraum, Standard 30 in
   30 Tagen). 0 schaltet eine Schwelle aus. Semester gibt es im Datenmodell nicht; gezählt wird ab Schuljahresbeginn.
2. **Grundlage sind Klassenbuch-Stunden mit "abwesend"**. Unentschuldigt ist eine Stunde, wenn die Fehlzeit, die
   sie abdeckt, abgelehnt (REJECTED) oder unentschuldigt (UNEXCUSED) ist; offene und gemeldete zählen noch nicht.
   Reine Funktion `absenceWarnings` in `@sp/shared`.
3. **Sichtbarkeit wie beim Prüfen von Entschuldigungen (`absence.review`)**: Klassenvorstand der Klasse
   (`GET /absences/warnings?classId=`), Direktion und Administration für die ganze Schule (Karte im Lagebild).
4. **Hinweis an den Klassenvorstand** (`absence.warning`, ohne Namen) über einen werktäglichen Job.
   `AbsenceWarning` merkt sich, wann gewarnt wurde: "unentschuldigt" einmal je Schuljahr, "häufig" erneut erst nach
   Ablauf des Zeitraums.
5. Keine automatische Nachricht an Eltern: Das Gespräch führt der Klassenvorstand (pädagogische Entscheidung).

## Folgen

- Schulen mit Semesterzählung stellen die Schwelle entsprechend niedriger ein; eine Semestergrenze kann später mit
  SD-05 (Schuljahreswechsel) und Semesterdaten am Schuljahr dazukommen.
