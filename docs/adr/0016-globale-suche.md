# ADR 0016: Globale Suche (PL-06)

Status: angenommen (2026-10-14)

## Kontext

Die Befehlspalette (Strg/Cmd+K) fand bisher nur Seiten. PL-06 verlangt Personen, Klassen und Räume. Personensuche
ist datenschutzrelevant: Wer darf wen finden?

## Entscheidung

1. **Ein Endpunkt `GET /search?q=`** (mindestens zwei Zeichen, je Art höchstens acht Treffer). Was gefunden wird,
   folgt den bestehenden Rechten, es gibt keine neue Aktion in der Matrix:
   - `timetable.read.other` (Lehrkräfte, Direktion, Administration): Klassen, Räume; Lehrkräfte mit Link auf ihren
     Stundenplan.
   - Lehrkräfte ohne Stammdatenrecht: Schüler:innen nur aus Klassen, in denen sie unterrichten oder Klassenvorstand
     sind (Link auf `/klassen/[id]`).
   - `masterdata.read` (Direktion, Administration): alle Personen mit Art und Klasse (Link auf die Personen-Ansicht).
   - Schüler:innen und Eltern: leere Liste; ihre Palette sucht weiter nur Seiten.
2. **Protokoll:** Werden Personen gefunden, entsteht ein Audit-Eintrag `person.search` mit der Anzahl, ohne Suchtext.
3. **Oberfläche:** Seiten zuerst, dann Personen, Klassen, Räume als Gruppen in einer Listbox. Treffer werden nach
   200 ms nachgeladen; offline bleiben die Seiten. Mobil öffnet ein Lupen-Symbol in der Kopfzeile die Suche (nur
   für Ansichten mit Personensuche).

## Folgen

- Gesucht wird in Vor- und Nachname (jedes Wort muss vorkommen), nicht in E-Mail oder Schülernummer; dafür bleibt die
  Personenliste der Administration.
