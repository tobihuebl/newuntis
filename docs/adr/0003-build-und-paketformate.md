# ADR 0003: Paketformate, Tailwind 4, Prisma 6

Status: akzeptiert (M0)

- **`@sp/shared` und `@sp/db`** werden mit `tsup` als ESM und CJS samt Typen gebaut (`dist/`). Die NestJS-API läuft als CommonJS, Next.js und Tools als ESM. Turbo baut abhängige Pakete vor Lint, Typecheck und Test (`dependsOn: ^build`).
- **`@sp/ui`** wird als TypeScript-Quelltext konsumiert (`transpilePackages` in Next.js), ohne Build-Schritt.
- **Tailwind 4:** Das "Tailwind-Preset" der Spezifikation ist hier eine CSS-Datei (`@sp/ui/styles.css`, `@theme inline` auf den Design-Tokens aus `tokens.css`). Dark Mode über `data-theme="dark"` oder Systemvorgabe.
- **Prisma 6** (nicht 7), Konfiguration in `packages/db/prisma.config.ts`. Prisma 7 verlangt Driver-Adapter und ändert die Client-Erzeugung; Umstieg später als eigene Aufgabe.
- **Row-Level-Security:** In M0 aktiviert (`ENABLE`, nicht `FORCE`), damit Migrationen und Seed als Tabelleneigentümer laufen. M1 führt die nicht privilegierte Laufzeit-Rolle der API ein, die den Policies unterliegt, und den Mandantentest.
- **Schema-Ergänzungen** zur Spezifikation: `Lesson.version` (optimistische Sperre im Editor, Abschnitt 10), Unique-Indizes auf `Subject(tenantId, code)`, `Room(tenantId, name)`, `Person(tenantId, externalId)`, `SchoolYear(tenantId, name)`, `Attendance(tenantId, clientMutationId)`, sowie `updatedAt` auf allen Tabellen.
- **Seed-Stundenplan** ist `PUBLISHED`, enthält aber noch keine `Occurrence`-Zeilen; diese erzeugt in M3 der Job `generate-occurrences`.
