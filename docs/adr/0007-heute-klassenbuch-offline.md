# ADR 0007: Heute, Klassenbuch, Offline-Synchronisation und Echtzeit (M4)

Status: akzeptiert (M4)

## Klassenbuch-API

- `GET /today` (jede angemeldete Person): Lehrkräfte sehen ihre Stunden mit Stand des Klassenbuchs, offene Einträge und Supplierungen der nächsten 7 Tage; Schüler:innen und Eltern den Tag der Klasse, Hausübungen bis zum nächsten Schultag und Prüfungen der nächsten 7 Tage. Eltern wählen ein Kind über `studentId` (Rechte-Prüfung `timetable.read.own`).
- `GET /occurrences/:id` braucht `attendance.read`. Schreiben darf, wer `classbook.write` für die **wirksamen Lehrer des Termins** hat (nach Supplierung die Vertretung, nicht mehr die ursprüngliche Lehrkraft) sowie die Direktion (Korrektur). Klassenvorstände lesen nur. Lesen fremder Stunden wird protokolliert.
- `PUT …/classbook` mit `baseVersion` (optimistische Sperre, 0 = noch kein Eintrag). Abweichung: 409 mit `current` (aktueller Stand). Wiederholung derselben `clientMutationId` liefert den bestehenden Stand (`ClassbookEntry.lastMutationId`). Abweichung von der Spec: die Version steht im Body statt in `If-Match`, weil die Outbox sie vor dem Senden nachziehen muss.
- `PUT …/attendance` nimmt Listen. Pro Schüler:in gewinnt die spätere Gerätezeit (`Attendance.clientUpdatedAt`, begrenzt auf die Serverzeit, damit eine vorgehende Uhr nicht dauerhaft gewinnt). Bereits angewandte `clientMutationId`s werden übersprungen.
- `POST …/close` ist idempotent, ab dem Tag der Stunde möglich, nicht bei Entfall. Nicht eingetragene Schüler:innen werden als anwesend festgehalten. Einträge bleiben nach dem Abschluss korrigierbar.
- Offene Einträge: eigene, beendete, nicht entfallene Stunden der letzten 60 Tage ohne Abschluss.

## Offline (Spec Abschnitt 12)

- **Speicher:** IndexedDB über Dexie (`apps/web/src/offline`). Tabellen `snapshots` (letzter Serverstand je Abfrage), `outbox` (eigene Änderungen) und `meta` (Besitzer, letzte Nutzung).
- **Anzeige:** Klassenbuch = Serverstand aus IndexedDB plus noch nicht bestätigte Outbox-Einträge (`applyPending`, reine Funktion mit Tests). Abfragen laufen Netz zuerst und fallen bei fehlender Verbindung auf den gespeicherten Stand zurück; 401/403/404 werden nie durch alte Daten verdeckt.
- **Outbox:** Noch nie gesendete Änderungen werden zusammengefasst (Anwesenheit je Kind, Eintrag je Termin). Ohne Verbindung wird nicht gesendet. Gesendet wird der Reihe nach bei `online`, Sichtbarkeit, alle 15 s und nach jeder Änderung; Anwesenheit eines Termins gebündelt in einer Anfrage. Nach einer eigenen erfolgreichen Eintragsänderung erhalten Nachfolger die neue Basisversion, sonst gäbe es einen Konflikt mit sich selbst. Background Sync wird nicht genutzt (nicht überall verfügbar, die Logik liegt in der Seite).
- **Konflikte:** Bei 409 zeigt der Klassenbuch-Screen beide Fassungen: "Meine behalten" sendet die eigene Fassung auf Basis der Serverversion erneut, "Andere übernehmen" verwirft sie. Abgelehnte Änderungen (4xx) bleiben mit Fehlertext sichtbar (erneut senden oder verwerfen). 401/CSRF: Senden pausiert, nach neuer Anmeldung geht es weiter.
- **Vorrat:** Die Heute-Ansicht der Lehrkraft lädt höchstens alle 5 Minuten `GET /classbook/prefetch` (eigene Stunden der nächsten 7 Tage und offene Einträge mit Schülerlisten) und lässt die zugehörigen Seiten vom Service Worker zwischenspeichern.
- **Datenschutz auf dem Gerät:** Der Speicher gehört genau einer Person einer Schule. Andere Person oder länger als `settings.offline.clearAfterIdleDays` (Standard 14) nicht genutzt: alles wird gelöscht, bevor Lokales gelesen wird. Abmelden löscht ebenfalls; offene Änderungen werden vorher angesagt.

## Service Worker und PWA

Handgeschrieben (`public/sw.js`), ohne Workbox. Statische Next-Dateien cache-first, Seitenaufrufe Netz zuerst; nur Heute, Plan und Klassenbuch werden für offline gemerkt, Umleitungen (z. B. zum Login) nie. API-Aufrufe gehen nie durch einen Cache. Registrierung nur im Produktionsbetrieb (`NEXT_PUBLIC_ENABLE_SW=1` erzwingt sie im Entwicklungsmodus). Manifest über `app/manifest.ts`, Icons erzeugt `scripts/make-icons.mjs` ohne Zusatzbibliothek.

## Echtzeit

`GET /events` (Server-Sent Events). Fachmodule rufen `EventsService.emit` in ihrer Transaktion auf; das läuft über `pg_notify`, wird also erst beim Commit zugestellt und erreicht alle API-Instanzen. Jede Instanz hält einen Ringpuffer (2000 Ereignisse) für `Last-Event-ID`; unbekannte Ids (z. B. nach Neustart) bekommen `resync`. Ereignisse tragen nur Ids und optional die Empfänger. Der Stream prüft die Sitzung minütlich, ohne sie zu verlängern. Der Client lädt betroffene TanStack-Query-Abfragen neu; nach Verbindungsabbruch alles.

## E2E-Tests

Playwright (`pnpm e2e`) startet ein eigenes Postgres per Testcontainers, spielt Migrationen und Seed ein, baut die API nach `dist-e2e` und das Web nach `.next-e2e` und startet beide auf 4100/3100. Ein laufendes `pnpm dev` bleibt unberührt.
