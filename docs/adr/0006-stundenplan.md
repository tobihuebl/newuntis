# ADR 0006: Stundenplan, Terminerzeugung, Jobs und Zeitstempel (M3)

Status: akzeptiert (M3)

## Kern als reine Funktionen

`packages/shared/src/timetable.ts` enthält Konfliktprüfung (`validateTimetable`), Wochenmuster und Terminplanung (`planDay`) ohne Datenbank. Die API prüft damit vor dem Veröffentlichen, der Editor im Browser live bei jeder Änderung (gemessen deutlich unter 100 ms für 600 Regeln). Property-Tests (fast-check) vergleichen die Bucket-Prüfung mit einem naiven Paarvergleich; ein absichtlich eingebauter Fehler wird von ihnen gefunden.

- **Schülermengen:** Klasse und Gruppe zählen selbst als Mitglied. Damit sind zwei Stunden derselben (auch leeren) Klasse ein Konflikt, getrennte Teilungsgruppen aber nicht.
- **blocksDouble:** Eine Doppelstunde darf nicht über eine Stunde mit `blocksDouble` hinweg in die nächste reichen (die Grenze liegt nach dieser Stunde).
- **Weiche Regeln:** Im MVP nur `ROOM_CAPACITY`; Hohlstunden, Tagesbelastung und gleiches Fach zweimal folgen in V1.

## Wochenmuster A/B

A oder B ergibt sich aus der Zahl der Wochen seit `settings.abWeekReferenceMonday` (sonst: Montag des Schuljahresbeginns), gezählt über Tage, **nicht über ISO-Wochennummern**: 2026 hat 53 Kalenderwochen, die Parität der Wochennummer würde an der Jahresgrenze zweimal dieselbe Hälfte liefern. Test über ein ganzes Jahr.

## Versionen und Gültigkeit

- Regeln gehören zu einer Version; nur Entwürfe sind änderbar. Bearbeiten: Administration; ansehen, prüfen und veröffentlichen ("freigeben"): auch Direktion.
- **Welche Version gilt an Tag D?** Die veröffentlichte oder archivierte Version mit dem spätesten Veröffentlichungszeitpunkt, deren "gültig ab" ≤ D ist und deren Schuljahr D enthält. Beim Veröffentlichen wird die bisherige Version archiviert, gilt dadurch aber weiter für die Tage vor dem neuen "gültig ab". Eine später veröffentlichte Version gewinnt immer.
- **Optimistische Sperre:** `Lesson.version`; die Änderung läuft als `updateMany ... WHERE version = x`. Ein veralteter Stand bekommt 409 mit dem aktuellen Stand, der Editor übernimmt ihn und meldet das.

## Terminerzeugung

- Job `generate-occurrences`: nächtlich 02:15 Wiener Zeit, beim API-Start (fehlende Tage nachholen) und direkt in der Transaktion des Veröffentlichens. Fenster: heute (Wiener Datum) bis heute + 28 Tage.
- Abgleich statt Neuanlage: fehlende Termine anlegen, geänderte anpassen, entfallene löschen. **Termine mit Klassenbuch, Anwesenheit, Supplierung oder geändertem Status werden nie verändert oder gelöscht.** Der Lauf ist idempotent (Test).
- Pläne jenseits des Fensters werden aus den Regeln berechnet (`planned: true`), damit Kalender und Wochenansicht auch Monate voraus funktionieren.
- `startsAt`/`endsAt` werden über Luxon in Europe/Vienna berechnet (Tests für 25.10.2026 und 29.03.2027).

## Zeitstempel

Alle Zeitpunkte sind jetzt `timestamptz` (Spec Abschnitt 8); Prisma legte sie zuvor als `timestamp` ohne Zeitzone an. Die Migration rechnet ausdrücklich `AT TIME ZONE 'UTC'` um, unabhängig von der Sitzungszeitzone. Anlass: Abfragen wie `startsAt AT TIME ZONE 'Europe/Vienna'` lieferten sonst falsche Zeiten.

## Jobs (pg-boss)

- pg-boss 12 läuft mit der Rolle `sp_app` im Schema `pgboss`, das eine Migration anlegt und `sp_app` gehört. `createSchema: false`, weil `CREATE SCHEMA IF NOT EXISTS` das CREATE-Recht auf der ganzen Datenbank verlangt, das `sp_app` absichtlich nicht hat.
- In Tests aus; abschaltbar mit `JOBS_ENABLED=false` (z. B. zusätzliche API-Instanzen ohne Worker).

## Kalender (iCal)

Persönlicher geheimer Link je Person (`CalendarToken`, nur Hash gespeichert), erneuerbar und widerrufbar. Inhalt: zwei Wochen zurück bis gut drei Monate voraus, Zeiten in UTC, Entfall als `STATUS:CANCELLED`, Zeilen auf 75 Oktette gefaltet. Eltern erhalten die Stunden aller verknüpften Kinder. Der Feed ist an die Subdomain der Schule gebunden.

## Betrieb

Die API lauscht standardmäßig nur auf `127.0.0.1` (`API_HOST`), weil sie `X-Forwarded-Host` vertraut. In Containern `API_HOST=0.0.0.0` mit einem Netz nur zwischen Proxy und API.
