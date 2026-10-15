# ADR 0022: Semester (SD-01)

Status: angenommen (2026-10-15)

## Kontext

SD-01 verlangt Schuljahr, Semester, Ferien und schulfreie Tage; Semester fehlten im Datenmodell. In Österreich hat
jedes Schuljahr genau zwei Semester. Das Schulpflichtgesetz zählt unentschuldigte Fehlstunden je Semester, und
die Schulnachricht am Ende des 1. Semesters braucht die Noten nur dieses Semesters.

## Entscheidung

1. **Ein Feld am Schuljahr:** `SchoolYear.secondSemesterFrom` (Beginn des 2. Semesters). Das 1. Semester reicht
   vom Schuljahresbeginn bis zum Vortag, das 2. bis zum Schuljahresende. Keine eigene Tabelle, weil es immer genau
   zwei sind.
2. **Ohne Eintrag** gilt der Tag nach den schulfreien Tagen mit dem Namen "Semesterferien". Die Ferien variieren je
   Bundesland und sind ohnehin eingetragen; so funktioniert es ohne zusätzliche Pflege. Fehlt beides, gibt es
   keine Semester und alles zählt wie bisher je Schuljahr.
3. **Frühwarnung (AB-05):** Unentschuldigte Stunden zählen ab Beginn des laufenden Semesters; die Warnung an den
   Klassenvorstand kommt einmal je Semester. "Häufig gefehlt" bleibt beim gleitenden Fenster. Die Oberfläche
   schreibt "im Semester" bzw. "im Schuljahr".
4. **Noten (PN-02):** Kurs, Klassenübersicht und eigene Noten haben den Filter "Ganzes Jahr / 1. Semester / 2. Semester" (`?semester=1|2`); Durchschnitte gelten für den gewählten Zeitraum. Die Erfassung einer Leistung
   zeigt immer das ganze Jahr, die Hinweise am Schuljahresende (SD-05) nutzen das ganze Jahr.

## Folgen

- Die Administration trägt den Beginn nur ein, wenn er vom Ende der Semesterferien abweicht.
- Semesterprüfungen der modularen Oberstufe bleiben außen vor (ADR 0019).
