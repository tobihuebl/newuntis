# Schulplattform: Arbeitsanweisungen

Quelle der Wahrheit ist docs/spec.md. Bei Abweichung zuerst nachfragen oder
die Spezifikation anpassen, dann bauen.

## Befehle

- pnpm install, pnpm dev, pnpm lint, pnpm typecheck, pnpm test, pnpm e2e (ab M4)
- pnpm db:migrate, pnpm db:seed, pnpm db:reset, pnpm tenant:create (ab M1), pnpm tenant:feature (M7)
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

## Kommunikation, Lagebild, Datenschutz, Betrieb (M6, siehe ADR 0009)

- Empfänger:innen von Nachrichten nur über `allowedRecipients` (apps/api/src/modules/messages/recipients.ts); erreichbar = Konto, nicht anonymisiert, nicht eingeschränkt.
- Nachricht an eine Klasse = je Familie ein Gespräch (nie Eltern untereinander sichtbar machen).
- Rundschreiben halten ihre Empfänger:innen in AnnouncementRead fest; Pflichtkanäle in MANDATORY_CHANNELS (@sp/shared/notifications.ts).
- Schulweite Auswertungen nur mit `hasScope(user, 'reports.read', 'ALL')`; Klassenvorstand nur eigene Klasse.
- "Tenant" hat keine RLS: Tenant immer über die Id aus @TenantId() lesen, nie findFirst.
- Schuleinstellungen nur über update_tenant_settings() (sp_app hat kein UPDATE auf Tenant); Audit-Log löschen nur über prune_audit_log().
- Löschen von Personen: anonymizePerson() aus apps/api/src/modules/privacy/anonymize.ts (vorher assertCanAnonymize).
- CSP mit Nonce in apps/web/proxy.ts: keine Inline-Skripte, keine Fremdquellen; Inline-Styles nur als style-Attribut.
- Neue Benachrichtigungstypen: in NOTIFICATION_TYPES, DEFAULT_CHANNELS, TYPES_FOR_ROLE, Texte und profile.types (de-AT) ergänzen.
- E2E-Login führt beim ersten Mal durch /willkommen (helpers.ts: completeOnboarding).
- Betrieb: infra/Dockerfile (Ziele api, web, migrate), infra/docker-compose.prod.yml, Runbooks in docs/runbooks/, Lasttest in loadtest/.

## Design System PROfessor (M6.5, siehe ADR 0010)

- Quelle: docs/design-system/ (README, tokens.json, bundle.css). Nach Änderungen pnpm design:gen; CI prüft mit pnpm design:check.
- Nur Token-Utilities: Farben bg-bg-raised, text-ink-muted, bg-brand …; Schrift text-h1, text-body-sm, text-label, text-mono …; keine Hex-Werte, keine Tailwind-Standardfarben oder -größen, keine px-Rohwerte in Klassen.
- Komponenten aus @sp/ui setzen die pf-Klassen aus bundle.css; im App-Code keine eigenen Varianten nachbauen.
- Theme über Cookie pf-theme (src/lib/theme.ts), kein Inline-Skript (CSP).
- Produktname über BRAND aus @sp/shared, Schreibweise immer PROfessor. Anrede: du für Schüler:innen und Lehrkräfte, Sie für Eltern, Direktion, Administration.
- PWA-Icons: pnpm design:icons (aus packages/ui/assets/logo).
- Prüfungen (D6): pnpm design:lint (Token-Lint: Hex, rgb(), px in Arbitrary-Values, Tailwind-Farben/-Größen/-Gewichte,
  rounded-full, Raster ohne grid-cols für mobil) und pnpm design:contrast (schreibt docs/kontrast.md; CI prüft mit --check).
- Responsive Raster immer mit Grundspalte: grid grid-cols-1 lg:grid-cols-3 (sonst wächst das Raster bei 320 px über den Rand).
- e2e/design.spec.ts: Screenshots hell/dunkel × 390/1280 nach test-results/design, axe, Tastatur, Reduced Motion, PWA, LCP.

## Stundenplan-Assistent (M7, siehe ADR 0012)

- Planungslogik rein in packages/shared/src/planning: solveTimetable (deterministisch, seed), checkConstraints (Wünsche), requirementCoverage (Soll/Ist), translateWishes (regelbasiert).
- API unter /admin/planning/* (timetable.edit) nur mit features.autoPlanning der Schule; freischalten: pnpm tenant:feature --slug <schule> --auto-planning on|off.
- Ergebnis eines Laufs ist immer ein neuer Entwurf; Lesson.pinned bleibt bei Teilplanung unverändert. Wünsche sind im Editor Warnungen, für den Solver (hart) bindend.
- KI nur über das Vercel AI Gateway (AI_GATEWAY_API_KEY in .env, EU-Region, Zero Data Retention); an die KI gehen nur Kürzel (pseudonymize in ai-translate.ts), nie Namen.
- Veröffentlichen prüft Soll gegen Ist (422 COVERAGE, mit acceptCoverage bestätigen).

## Nach M7: V1-Punkte (ADR 0013 bis 0015)

- Lehrkräfte (SD-07): Fächer in TeacherSubject, Stunden an Person (employmentHours, teachingHours); Pflege über PUT /admin/persons/:id/teaching; Auslastung als teacherLoad (packages/shared/src/planning/coverage.ts) in der Versionsansicht.
- Klassenbuch-Notiz und Vermerke (KB-07): Notiz und Vermerke nur mit notesVisible (Lehrkräfte der Stunde, KV, Direktion); Vermerke über die Outbox (kind 'remark'); KV-Übersicht /klasse/[id]/vermerke.
- Frühwarnung (AB-05): absenceWarnings in @sp/shared/absences.ts, AbsenceWarningsService (Job absence-warnings-daily), Schwellen in settings.absence.warn*.

## Hinweise zur Umgebung

- pnpm liegt ggf. in ~/.local/bin (corepack); PATH entsprechend setzen.
- Nach pnpm install mit geänderten Abhängigkeiten pnpm dev neu starten (der laufende Next-Server sucht sonst alte Paketpfade, Seiten liefern 500).
- Achtung beim Schreiben über die Shell: die Zeichenfolge Backslash-Backslash-Strichpunkt kommt verfälscht an; solche Stellen mit dem Edit-Werkzeug schreiben.
- `prisma migrate reset` verweigert die Ausführung durch KI-Agenten; Reset (pnpm db:reset) startet der Mensch.
