# Schulplattform: Arbeitsanweisungen

Quelle der Wahrheit ist docs/spec.md. Bei Abweichung zuerst nachfragen oder
die Spezifikation anpassen, dann bauen.

## Befehle

- pnpm install, pnpm dev, pnpm lint, pnpm typecheck, pnpm test, pnpm e2e (ab M4)
- pnpm db:migrate, pnpm db:seed, pnpm db:reset, pnpm tenant:create (ab M1)
- Schule anlegen: pnpm tenant:create --name "…" --slug … --admin-email … --admin-first … --admin-last …
- Lokale Dienste: docker compose up -d (Postgres, Mailpit, S3-kompatibler Speicher)

## Regeln

- TypeScript strict, kein any, keine Ignore-Kommentare ohne Begründung.
- Jede Tabelle hat tenantId und Row-Level-Security. Neue Tabelle = Policy + Test.
- Rechte nur über das policy-Modul. Neuer Endpunkt = @Can(...) + Matrix-Test.
- Zod-Schemas liegen in packages/shared, API und Web teilen die Typen.
- Alle Texte über i18n (de-AT), keine festen Strings in Komponenten.
- Keine externen CDNs, Schriften oder Tracker. Keine personenbezogenen Daten in Logs.
- Zeiten in UTC speichern, Anzeige und Rasterzeiten in Europe/Vienna.
- Conventional Commits, kleine Pull Requests, eine Aufgabe pro PR.
- Vor Abschluss einer Aufgabe: lint, typecheck und Tests grün.
- Entscheidungen mit Folgen als ADR in docs/adr/ festhalten.
- Barrierefreiheit (WCAG 2.2 AA) und Offline-Verhalten gehören zur Definition of Done.

## Mandanten und Auth (M1, siehe ADR 0004)

- Mandant = Subdomain (demo.localhost:3000). Lokal im Browser: http://demo.localhost:3000
- API verbindet als Rolle sp_app (DATABASE_APP_URL, unterliegt RLS); Migrationen/Seed als Eigentümer (DATABASE_URL).
- Neue Route: @Public(), @Authenticated() oder @Can(action) deklarieren. Neue Aktion: Matrix in packages/shared/src/permissions.ts, Tests entstehen automatisch.
- Datenbankzugriff in Handlern nur über PrismaService.tx (Anfrage-Transaktion mit RLS) oder PrismaService.runAsTenant.
- API-Integrationstests starten Postgres per Testcontainers (Docker nötig).

## Stammdaten und Import (M2, siehe ADR 0005)

- Admin-API unter /admin/*: Lesen braucht masterdata.read (Direktion + Administration), Schreiben masterdata.write (Administration).
- Löschen von Personen = Anonymisieren. Enden von Einschreibungen/Verknüpfungen: "gestern" setzen (Datum bis einschließlich gilt noch).
- CSV-Import: reine Logik in apps/api/src/modules/admin/csv.ts und import.service.ts, Vorschau und Übernehmen teilen dieselbe Prüfung.
- Server-Komponenten können keine Funktionen an Client-Komponenten geben: Spalten-/Felddefinitionen leben in src/components/admin/managers.tsx.

## Stundenplan (M3, siehe ADR 0006)

- Konfliktprüfung und Terminplanung sind reine Funktionen in packages/shared/src/timetable.ts (Editor nutzt sie live).
- Klassenbuch, Anwesenheit und Supplierung hängen immer am Termin (Occurrence), nie an der Regel (Lesson).
- Termine mit Klassenbuch/Anwesenheit/Supplierung nie anfassen; OccurrencesService.generate ist idempotent.
- Datumslogik: Kalendertage als "YYYY-MM-DD" (UTC-Mitternacht in @db.Date), "heute" immer in Europe/Vienna (todayIn).
- Jobs über pg-boss (JobsService); in Tests aus.

## Heute und Klassenbuch (M4, siehe ADR 0007)

- Schreibrecht im Klassenbuch hängt an den wirksamen Lehrern des Termins (OccurrenceTeacher), nicht an der Regel.
- Schreibende Klassenbuch-Aufrufe sind idempotent (clientMutationId); Eintrag mit baseVersion, Anwesenheit "letzte Änderung gewinnt".
- Offline-Logik in apps/web/src/offline: reine Funktionen in mutations.ts (mit Tests), Dexie-Zugriff in db.ts/sync.ts.
- Echtzeit: EventsService.emit innerhalb der Transaktion (pg_notify), Ereignisse nur mit Ids.
- E2E: pnpm e2e (Docker nötig, eigene Ports 3100/4100). Service Worker nur im Produktions-Build.

## Abwesenheit, Supplierung, Benachrichtigungen (M5, siehe ADR 0008)

- Benachrichtigungen nur über NotificationsService.emit(tx, …) in der Transaktion des Fachmoduls; Texte in @sp/shared/notifications.ts, ohne Namen.
- Hintergrund-Jobs: QueueService.register(...) in onModuleInit; Jobs mit QueueService.send(..., tx) transaktional einstellen.
- E-Mails nur über MailQueue mit React-Email-Vorlage (apps/api/src/modules/mail/templates.tsx).
- Uploads nur über FilesService (Typprüfung, Virenscan, signierte Links).
- Klassenbuch "abwesend" → AbsencesService.syncFromClassbook; Supplierungen ändern Termine erst beim Veröffentlichen.
- Übersetzungsschlüssel ohne Punkt (next-intl), ein Test prüft das.
- VAPID-Schlüssel: pnpm --filter @sp/api vapid (Ausgabe in .env eintragen).

## Hinweise zur Umgebung

- pnpm liegt ggf. in ~/.local/bin (corepack); PATH entsprechend setzen.
- Achtung beim Schreiben über die Shell: die Zeichenfolge Backslash-Backslash-Strichpunkt kommt verfälscht an; solche Stellen mit dem Edit-Werkzeug schreiben.
- `prisma migrate reset` verweigert die Ausführung durch KI-Agenten; Reset (pnpm db:reset) startet der Mensch.
