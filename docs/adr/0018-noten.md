# ADR 0018: Noten (PN-02)

Status: angenommen (2026-10-14)

## Kontext

PN-02 verlangt Notenerfassung 1 bis 5 mit Gewichtung und Notenspiegel. Die offene Frage aus Abschnitt 15
("Notensystem und Gewichtungen") ist mit der Schule geklärt (14.10.).

## Entscheidung

1. **Skala:** österreichisch, nur ganze Noten: 1 Sehr gut, 2 Gut, 3 Befriedigend, 4 Genügend, 5 Nicht genügend.
   Durchschnitte mit zwei Kommastellen; die Zeugnisnote bleibt eine pädagogische Entscheidung (kein Runden).
2. **Leistungen** (`Assessment`) je Fach in einer Klasse oder Gruppe ("Kurs", `courseKey`), mit Notenart
   Schularbeit, Test, Mündlich oder Mitarbeit; optional mit einer Prüfung aus dem Kalender (PN-01) verknüpft.
3. **Gewichtung in Prozent je Notenart**, von der Lehrkraft je Kurs einstellbar (Summe 100, Standard 50/25/10/15).
   Jede Notenart wird für sich gemittelt; Arten ohne Noten oder mit 0 % fallen heraus, der Rest wird hochgerechnet.
4. **Freigabe:** Schüler:innen und Eltern sehen Noten erst, wenn die Lehrkraft die Leistung freigibt; dann
   Benachrichtigung `grade.released` (Fach, ohne Note). Freigegebene Leistungen lassen sich nicht löschen,
   einzelne Noten weiter korrigieren (protokolliert).
5. **Rechte** (`grade.write`, `grade.read`): eintragen die Lehrkraft des Fachs in dieser Klasse oder Gruppe
   (`teachingPairs` enthält jetzt auch Gruppen). Lesen: Lehrkraft (eigene Kurse), Klassenvorstand (eigene Klasse,
   Übersicht), Direktion und Administration (alle, nur lesen; Administration neu auf Wunsch der Schule),
   Schüler:innen eigene, Eltern ihrer Kinder (nur freigegebene, mit Notenspiegel). Lesen durch andere als die
   Lehrkraft des Kurses wird protokolliert.
6. **Altersgrenze** `ageLimits.seeGradesFrom` jetzt Standard 0: alle Schüler:innen sehen ihre Noten; eine Schule
   kann eine Grenze setzen (gilt nicht für Eltern).
7. **Datenschutz:** Noten sind Schulunterlagen wie Anwesenheit; Anonymisieren entfernt nur den Personenbezug.
   Die Datenauskunft enthält freigegebene Noten.

## Folgen

- Verbale Beurteilung (Volksschule) und Zeugnisse folgen mit PN-03 (V2).
