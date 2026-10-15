# ADR 0023: Untis-Import (SD-06)

Status: angenommen (2026-10-15)

## Kontext

Pilotschulen haben ihren Stundenplan fertig in Untis. Ohne Übernahme müssten sie hunderte Stunden neu
eintragen; das ist das größte Hindernis für einen Umstieg (Meilenstein M8). Untis exportiert seine Daten als
DIF-Textdateien GPU001 bis GPU021 (Untis-Handbuch, "Allgemeine Schnittstellen"): Felder durch Komma getrennt,
Text in Anführungszeichen, meist Windows-1252.

## Entscheidung

1. **Dateien:** GPU001 Stundenplan (Pflicht; Unt-Nr, Klasse, Lehrer, Fach, Raum, Tag, Stunde), optional GPU002
   Unterricht (Wochenstunden → Lehrfächerverteilung), GPU004 Lehrkräfte (Feld 1 Kürzel, 2 Nachname, 29 Vorname,
   33 E-Mail), GPU005 Räume (Kapazität), GPU006 Fächer (Langname). Die Feldpositionen von GPU004 bis GPU006 folgen
   der quelloffenen Bibliothek enbrea.untis.gpu, weil das Handbuch online nur für GPU001 bis GPU003 erreichbar
   war. Die Web-App liest die Dateien als UTF-8, sonst als Windows-1252, und erkennt sie am Dateinamen.
2. **Zusammenfassen** (reine Funktionen in `@sp/shared/untis.ts`): Zeilen mit gleicher Unterrichtsnummer, Tag,
   Stunde und Fach bilden eine Stunde. Mehrere Klassen sind eine Kopplung und werden eine Gruppe
   ("1A/1B RK", zunächst ohne Mitglieder); mehrere Lehrkräfte sind Teamteaching. Aufeinanderfolgende Stunden mit
   gleicher Besetzung werden zur Doppelstunde. Wochenende, Zeilen ohne Klasse oder Fach (z. B. Konferenzen) und
   Stunden außerhalb des Rasters werden übersprungen und in der Vorschau gemeldet.
3. **Zuordnung:** Klassen nach Name im Schuljahr, Gruppen nach Name, Fächer nach Kürzel, Räume nach Untis-Kürzel.
   Lehrkräfte zuerst über einen früheren Import (`Person.externalId = "untis:<Kürzel>"`), dann über die
   E-Mail-Adresse aus GPU004, dann über einen eindeutigen Namen; sonst neu ohne Konto (Einladung wie gewohnt).
4. **Immer ein neuer Entwurf** (`timetable.edit`): Vorschau und Übernahme teilen dieselbe Analyse; übernommen wird
   in einer Transaktion. Veröffentlichte Pläne, Termine und Klassenbuch bleiben unberührt; geprüft und
   veröffentlicht wird im Editor wie bei jedem Entwurf (Konflikte, Soll gegen Ist).

## Folgen

- A/B-Wochen (14-tägiger Unterricht) übernimmt der Import als wöchentlich; halbe Soll-Stunden werden aufgerundet.
  Die Administration korrigiert das im Editor.
- Die Feldpositionen sind mit echten Exporten einer Pilotschule zu bestätigen.
- Schüler:innen, Ferien (GPU018) und Vertretungen (GPU014) kommen nicht aus Untis; Personen kommen aus Sokrates
  (SD-08).
