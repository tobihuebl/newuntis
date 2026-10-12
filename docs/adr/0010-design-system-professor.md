# ADR 0010: PROfessor Design System (M6.5)

Status: akzeptiert (M6.5, Okt. 2026)

## Kontext

Bis M6 nutzte die App ein schlichtes Token-Set aus der Spec (Indigo, Inter, Rahmen statt Schatten). Mit dem
PROfessor Design System liegen Marke, Tokens, Komponenten-Referenz und Screen-Vorgaben vor. Es wird vor M7 in
Phasen D0 bis D6 umgesetzt (`docs/design-audit.md`). Fachlogik, API und Offline-Verhalten ändern sich nicht.

## Entscheidungen

1. **Quelle:** `docs/design-system/` enthält README, `tokens.json` und `bundle.css` aus dem Design-System-Artifact.
   `scripts/gen-theme.mjs` erzeugt daraus `tokens.css`, `theme.css`, eine Kopie von `bundle.css` (UI-Paket) und
   `design-tokens.ts` (shared, für Manifest, E-Mail, PDF). `pnpm design:check` prüft in CI, dass alles aktuell ist.
2. **`bundle.css` 1:1:** Die Referenz-CSS liegt unverändert in der Ebene `components`; React-Komponenten setzen die
   `pf-*`-Klassen und ihre Varianten über `cva`. Tailwind-Utilities (Ebene `utilities`) dürfen sie im Einzelfall
   überschreiben (Layout). So bleibt die Umsetzung deckungsgleich mit dem System und lässt sich bei neuen
   Fassungen austauschen.
3. **Tailwind v4 nur mit Tokens:** `--color-*` und `--text-*` sind auf `initial` gesetzt, es gibt nur Token-Farben
   (`bg-bg-raised`, `text-ink-muted`, `bg-brand` …) und die Schriftstile als Utilities (`text-h1`, `text-body-sm`,
   `text-overline`, `text-mono` …, mobil unter 1024 px kleiner). Schatten (`shadow-card`) und Ebenen (`z-nav`)
   sind eigene Utilities, weil sie mit dem Theme wechseln. `cn()` kennt diese Klassen (tailwind-merge).
4. **Theme per Cookie `pf-theme`** statt `localStorage` und Inline-Skript: Der Server setzt `data-theme` beim
   Rendern, "System" folgt `prefers-color-scheme` in `tokens.css`. Gleiches Ergebnis (kein Aufblitzen), aber ohne
   Inline-Skript, das die Content-Security-Policy (ADR 0009) verbietet. `theme-color` je Theme über
   `generateViewport`.
5. **Schriften über `next/font/google`:** beim Build geladen, von der eigenen Domain ausgeliefert, mit
   Fallback-Metriken. Inter entfällt.
6. **Name PROfessor** in Oberfläche, Manifest, E-Mails, PDF, 2FA-Aussteller und iCal (`BRAND` in
   `@sp/shared`). Technische Namen (Pakete `@sp/*`, Datenbank, Dexie-Datenbank, iCal-UIDs) bleiben, damit
   bestehende Kalender-Abos und Offline-Daten gültig bleiben.
7. **PWA-Icons** aus `packages/ui/assets/logo/app-icon-1024.svg` (`pnpm design:icons`), inklusive Maskable und
   Monochrom.
8. **Navigation, Fächerfarben, Anrede** folgen dem Design System (Entscheidungen F2 bis F4 im Audit); Details in
   den Phasen D3 bis D5.
9. **Showcase statt Storybook:** Route `/komponenten` mit allen Bausteinen in allen Zuständen, hell und dunkel.

## Folgen

- Neue Oberflächen nutzen ausschließlich Komponenten aus `@sp/ui` und Token-Utilities; Hex-Werte, `rgb()`,
  px-Rohwerte in Klassen und Tailwind-Standardfarben/-größen sind verboten (Token-Lint ab D6).
- Ändert sich das Design System, werden `docs/design-system/*` ersetzt und `pnpm design:gen` ausgeführt.
