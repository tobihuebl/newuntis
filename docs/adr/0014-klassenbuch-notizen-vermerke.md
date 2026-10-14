# ADR 0014: Notizen und besondere Vorkommnisse im Klassenbuch (KB-07)

Status: angenommen (2026-10-14)

## Kontext

KB-07 verlangt Notizen und besondere Vorkommnisse, sichtbar nur für Lehrkräfte und Klassenvorstand. Das Feld
`ClassbookEntry.note` gab es seit M4, aber ohne Oberfläche. Vorkommnisse betreffen meist einzelne Schüler:innen
("Handy im Unterricht", "hat geholfen") und sind personenbezogene Daten.

## Entscheidung

1. **Zwei Dinge:** Die **Notiz zur Stunde** ist ein Feld des Eintrags (gleiche Versionierung, Offline-Outbox und
   Konfliktlösung wie Stoff und Hausübung). **Vermerke** sind eine eigene Tabelle `ClassbookRemark` (Termin,
   Schüler:in, Text, Verfasser:in), nur anlegen und löschen, kein Bearbeiten.
2. **Sichtbarkeit:** Lehrkräfte der Stunde, Klassenvorstand der Klasse und Direktion (sie korrigiert das Klassenbuch
   ohnehin). Nicht: Administration, Schüler:innen, Eltern. Die API lässt `note` und `remarks` sonst ganz weg
   (`notesVisible`).
3. **Klassenvorstand:** bekommt eine Benachrichtigung `classbook.remark` (ohne Namen und Inhalt) und sieht alle
   Vermerke der Klasse unter `/klasse/[id]/vermerke` (auch die Direktion). Lesen wird protokolliert.
4. **Offline:** Vermerke gehen über die Outbox (`kind: 'remark'`, idempotent über `clientMutationId`); Löschen nur
   online. Ältere Outbox-Einträge ohne `note` lassen die Notiz unverändert.
5. **Löschen:** eigene Vermerke durch die Verfasser:in, alle durch die Direktion.
6. **Datenschutz:** Aufbewahrung `retention.remarksDays` (Standard 365 Tage). Die Datenauskunft der betroffenen Person
   enthält ihre Vermerke (Text, Datum, Fach, ohne Verfasser:in). Anonymisieren löscht Vermerke über die Person.
   Termine mit Vermerken verändert die Terminplanung nicht.

## Folgen

- Vermerke sind keine Disziplinarakte; für förmliche Verfahren bleibt die Schule bei ihren Vorlagen (AD-03).
- Die Auskunft zeigt Schüler:innen und Eltern die Vermerke; das ist gewollt (DSGVO Art. 15).
