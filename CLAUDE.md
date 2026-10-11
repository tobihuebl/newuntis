# Schulplattform: Arbeitsanweisungen

Quelle der Wahrheit ist docs/spec.md. Bei Abweichung zuerst nachfragen oder
die Spezifikation anpassen, dann bauen.

## Befehle

- pnpm install, pnpm dev, pnpm lint, pnpm typecheck, pnpm test
- pnpm db:migrate, pnpm db:seed, pnpm db:reset, pnpm tenant:create (ab M1)
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

## Hinweise zur Umgebung

- pnpm liegt ggf. in ~/.local/bin (corepack); PATH entsprechend setzen.
- `prisma migrate reset` verweigert die Ausführung durch KI-Agenten; Reset (pnpm db:reset) startet der Mensch.
