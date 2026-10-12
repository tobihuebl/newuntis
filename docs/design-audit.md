# Design-Audit (M6.5, Phase D0)

Stand 12. Okt. 2026. Grundlage: PROfessor Design System (Design-System-Artifact „PROfessor“, Dateien
`PROfessor-Design-System.md`, `tokens.json`, `bundle.css`, Logo-Assets). Dieses Dokument listet den Bestand,
die Abweichungen zum System und den Vorschlag für die Pfade im Repository. In D0 wurde kein Code geändert.

Abhaken: Jede Zeile in Abschnitt 7 wird in der genannten Phase erledigt und hier abgehakt (D6 „Aufräumen“).

---

## 1. Bestand: Technik

| Bereich | Heute | Design System | Abweichung |
| --- | --- | --- | --- |
| UI-Paket | `packages/ui` (`@sp/ui`), 15 Komponenten, Radix (`dialog`, `slot`), `cva`, `tailwind-merge`, `lucide-react` | dasselbe Muster (cva, Lucide) | passt, Komponenten werden ersetzt bzw. umgebaut |
| Tailwind | v4, `@theme inline` in `packages/ui/src/styles/index.css` | v4, `@theme inline` aus `tokens.json` erzeugt | Token-Namen und -Werte komplett neu |
| Tokens | `tokens.css` von Hand, 12 Farben (`--surface`, `--primary`, `--success` …), 3 Radien, keine Abstände, Schatten, Ebenen | 40 Farb-Tokens je Theme, Abstände, Radien, Schatten, Ebenen, Breakpoints, Typografie; `tokens.json` ist die einzige Quelle | ersetzen; `tokens.css` wird erzeugt |
| Schrift | Inter Variable (`@fontsource-variable/inter`), Größen über Tailwind (`text-sm` 218×, `text-lg` 51×, `text-2xl` 53× …) | Bricolage Grotesque (700/800), DM Sans, JetBrains Mono (500) über `next/font`; Tailwind-Textgrößen verboten, nur Typo-Stile `display-xl` … `mono-sm` | Schriften tauschen, alle Textgrößen auf Typo-Stile umstellen |
| Farben im Code | alte Token-Utilities (`text-muted` 176×, `bg-surface-2` 53×, `bg-surface` 36×, `text-primary` 32× …), Rohwerte `#4f46e5` (Fächer-Standardfarbe, `layout.tsx`, `manifest.ts`), `bg-white`, `bg-black/50` | nur neue Token-Utilities, keine Hex-Werte | alle Stellen umstellen, Lint-Skript verhindert Rückfall |
| Theme | Cookie `sp_theme` (light/dark, sonst System), Server setzt `data-theme` beim Rendern; System über `@media (prefers-color-scheme)` | `localStorage` `pf-theme` + Inline-Skript im `head` | Abweichung beibehalten, siehe Entscheidung E3 |
| `theme-color` | fest `#4F46E5` | je Theme per `media` (`#F6F5F1` hell, `#0E192D` dunkel) | ändern |
| Fokusring | 2px `--primary`, Abstand 2px | 3px `--focus`, Abstand 3px; auf Nachtflächen Amber | ändern |
| Bewegung | 150 ms global, Reduced Motion über `!important` | 120–320 ms, `cubic-bezier(.2,.8,.2,1)`, gezielt je Komponente | ändern |
| Logo / Icons | Text „Schulplattform“ in der Sidebar; PWA-Icons ohne Marke (`apps/web/public/icons/*`) | Raster-P, Wortmarke PROfessor, App-Icon Nacht | neu |
| Manifest | `name` „Schulplattform“, `short_name` „Schule“, Farben Indigo | „PROfessor“, `#0E192D` | ändern |
| Showcase | keiner | Storybook oder Showcase-Route mit allen Zuständen hell/dunkel | neu (E6) |
| Prüfskripte | axe in Playwright (hell und dunkel, 320 px) | dazu Token-Lint, Kontrast-Skript, Screenshots, PWA- und LCP-Prüfung | neu |

## 2. Bestand: Komponenten

| Heute (`@sp/ui`) | Design System | Maßnahme |
| --- | --- | --- |
| `Button` (`primary`, `secondary`, `ghost`, `destructive`; 44px, `rounded-sm`) | `Button` (`pf-btn`): `primary` mit Taster-Kante, `signal`, `secondary`, `ghost`, `danger`; `sm`/`md`/`lg`, `block`, `loading`, `iconLeft`; 48px | umbauen, `destructive` → `danger` an allen Aufrufstellen |
| `Badge` (Rahmen in Statusfarbe), `StatusBadge` (7 Zustände, Grün/Gelb/Rot/Blau) | `Chip` (`pf-chip`): `ok`, `late`, `absent`, `danger`, `solid`, `mono`; immer Wort plus Icon | `Chip` neu, `StatusBadge` auf `Chip` abbilden (Tabelle 2a), `Badge` entfällt |
| `Card` (Rahmen, `rounded-md`, kein Schatten) | `Card` (`pf-card`): `night`, `signal`, `brand`, `flat`, `interactive`; `shadow-card`, `radius-lg` | umbauen; Karte-in-Karte-Stellen auflösen |
| `Input`, `Textarea`, `Select` (44px, `bg-surface-2`, Rahmen) | `Field` (`pf-field`, `pf-input`): 52px, Ring `line-strong`, Fehler mit Icon | umbauen, Schnittstelle (`label`, `hint`, `error`) bleibt |
| `Checkbox`, `Switch`, `SegmentedControl` | nicht im System (nur Hinweise: `line-strong` für Checkbox/Segmente, `radius-pill` für Segmente und Toggles, `bg-sunken` für Segment-Tracks) | aus Tokens ableiten; **Vorschlag zur Ergänzung im Design System** (Abschnitt 6) |
| `ListRow` | nicht im System (Tabellen/Listen: Trennung durch `line`, Zeilen 52px) | aus Tokens ableiten; Vorschlag zur Ergänzung |
| `Sheet` (Radix-Dialog, `bg-black/50`, `rounded-t-md`) | `Sheet` (`pf-sheet`, Griff, `radius-xl`, Scrim `overlay`), Web als Dialog; Wischen zum Schließen | umbauen, Wischgeste neu |
| `Skeleton` | `Skeleton` (`pf-skel`, Schimmer, erst ab 1 s sichtbar) | umbauen, Verzögerung neu |
| `EmptyState` (nur Text) | `EmptyState` mit Kachel-Raster (`pf-empty__tiles`) | umbauen |
| – | `KpiTile` (`pf-kpi`, `--big` einmal je Dashboard) | neu |
| – | `Toast` (Nacht, 5 s, Aktion „Rückgängig“), `Banner` (`pf-banner`) | neu (heute: Inline-Statuszeilen, Offline-Banner selbst gebaut) |
| – | `Logo` (`pf-logo`, `onNight`, `symbolOnly`) | neu |
| – | `Sidebar`, `TabBar` (`pf-nav`, `pf-tabbar`, erhobene Hauptaktion) | neu (heute in `app-shell.tsx` inline) |
| – | `TimetableGrid` (`pf-tt`, Fächerfarben, `conflict`, `subst`, `drag`) | neu; ersetzt die Raster in `plan/week-plan.tsx` und `timetable/editor.tsx` |
| – | `AttendanceRow` (`pf-att`, 56px, Avatar-Initial, Chip) | neu; ersetzt die Zeile in `classbook/classbook-screen.tsx` (Bedienung Tap/langes Drücken gibt es schon) |

### 2a. Status-Abbildung (StatusBadge → Chip)

Das System kennt fünf Tonarten; die sieben fachlichen Zustände werden so abgebildet:

| Zustand | heute | neu | Icon |
| --- | --- | --- | --- |
| anwesend | Grün | `ok` „Anwesend“ | check |
| verspätet | Gelb | `late` „5 Min spät“ | clock |
| abwesend | Rot | `absent` „Abwesend“ | x |
| entschuldigt | Blau | `ok` „Entschuldigt“ (erledigt) | file-check |
| Entfall | Rot durchgestrichen | `late` „Entfall“ (Hinweis, Text durchgestrichen bleibt) | ban |
| Vertretung | Gelb | `ok` „Vertretung“ (laut Tabelle „Status auf einen Blick“) | user-round-cog |
| Raumwechsel | Blau | `late` „Raum 12“ (Hinweis) | door-open |

Rot (`danger`) bleibt Fehlern vorbehalten; heute sind „abwesend“ und „Entfall“ rot. Im Stundenplan-Raster ist eine Vertretung `is-subst` (Amber weich mit Rand).

## 3. Bestand: Seiten (61) und Zuordnung zu „Screens“

| Screen im System | Route(n) heute | wichtigste Abweichungen |
| --- | --- | --- |
| 1 Anmeldung, Zwei-Faktor, Einladung | `/login`, `/2fa`, `/2fa/einrichten`, `/einladung`, `/eltern-code`, `/passwort-*` | keine Marke, kein Nacht-/Raster-Teil, kein Claim; 2FA als ein Feld statt sechs Ziffernfeldern mit Autosubmit; Überschrift „Willkommen! …“ mit Ausrufezeichen |
| 2 Heute (Lehrer) | `/heute` (`today/today-screen.tsx`) | Begrüßung klein (`text-2xl`), aktuelle Stunde als Karte mit Rand statt Nachtkarte, kein Zweispalter ab 1024px |
| Heute (Schüler, Eltern) | `/heute` | nächste Stunde mit Fachfarbe als Randstreifen; Rest als Liste – passt im Aufbau, Optik neu |
| 3 Klassenbuch | `/klassenbuch`, `/klassenbuch/[occurrenceId]` | Zeilen ohne Avatar, Status in Grün/Rot; kein Zweispalter (Liste + Stundendetail) ab 1024px; keine Tastenkürzel `A`/`V`/`Enter`; kein Toast „Stunde abgeschlossen“ mit Rückgängig |
| 4 Stundenplan-Ansicht | `/plan`, `/kind/[id]/plan` (`plan/week-plan.tsx`) | Fächer als Randfarbe statt Fächerkachel; mobil kein Tageswischen; aktuelle Stunde ohne Nacht-Rand |
| 4 Stundenplan-Editor | `/admin/stundenplan/[id]` (`timetable/editor.tsx`, 1.109 Zeilen) | Konflikte rot statt Amber-Kachel mit Wort; Kacheln ohne Fächerfarbe; Drag ohne `is-drag` |
| 4 AI-Planung | – | gehört zu M7 (nicht Teil von M6.5) |
| 5 Abwesenheit melden | `/abwesenheit/neu` (`absences/absence-form.tsx`) | eigene Seite statt Sheet aus der Tab-Leiste; Grund als Auswahl statt Chips; kein Status-Verlauf als vier Kacheln |
| 6 Entschuldigungen prüfen | `/klasse/[id]/entschuldigungen` (`absences/class-absences.tsx`) | kein Wischen zum Entschuldigen, Frist nicht als Amber-Chip |
| 7 Supplierung | `/supplierung` (`substitution/substitution-screen.tsx`), Karte auf `/heute` | kein Zweispalter (Ausfälle links, Vorschläge rechts) |
| 8 Direktions-Lagebild | `/lagebild` (`principal/dashboard-screen.tsx`) | sechs gleich große Karten statt einer großen Zahl (`pf-kpi--big`) und kleinen Kennzahlen; kein Dreispalter ab 1280px |
| 9 Prüfungskalender | `/pruefungen` (`teacher/exams-screen.tsx`) | Liste statt Monatsraster (Web)/Wochenliste (mobil); Kollision nicht als Amber-Kachel |
| 10 Nachrichten, Rundschreiben | `/nachrichten*`, `/rundschreiben*` | kein Zweispalter auf Web; Senden ohne Vorschau „So sehen es Eltern“ (Vorschau der Empfängerzahl gibt es) |
| 11 Admin: Einrichtung und Import | `/admin/*` (Personen, Klassen, Fächer, Räume, Raster, Schuljahr, Import, Rollen, Protokoll, Datenschutz, Einstellungen) | **keine Übersichtsseite** mit Checkliste „Schule einrichten“; Import ohne große Ablagefläche |
| 12 Fehler- und Sonderseiten | `[...slug]` (404 im App-Bereich), `/offline` | keine Nachtfläche, kein Raster-Motiv; keine globale 404 außerhalb des App-Bereichs |
| (nicht im System) | `/willkommen`, `/profil`, `/benachrichtigungen`, `/mehr`, `/klassen*`, `/klasse*`, `/raeume`, `/freigaben`, `/auswertung`, `/termine`, `/aufgaben`, `/krankmeldung`, `/kind/[id]/fehlzeiten` | werden mit denselben Bausteinen umgestellt, ohne eigene Screen-Vorgabe |

## 4. Abweichungen bei Inhalt und Sprache

1. **Name:** „Schulplattform“ steht in der Oberfläche (`app-shell.tsx`, `de-AT.json`), im Manifest, in E-Mails (`mail.service.ts`, `templates.tsx`), als 2FA-Aussteller (`totp.service.ts`) und im iCal-Feed (`ics.ts`). Neu überall **PROfessor**. Paketpräfix `@sp/` und Ordnernamen bleiben (Spec Abschnitt 2: Name ist Austausch von Texten, nicht von Struktur).
2. **Anrede:** Alle Texte duzen (34 Stellen mit du/dein, keine mit Sie). Das System verlangt **Sie** für Eltern, Direktion und Administration. Viele Texte sind rollenübergreifend (Profil, Nachrichten, Einführung, Benachrichtigungen, E-Mails) und brauchen zwei Fassungen.
3. **Ausrufezeichen:** 2 Stellen (`inviteTitle`, `welcome`).
4. **Button-Texte:** Prüfen auf „Verb, höchstens drei Wörter“; Stichprobe: überwiegend passend, einzelne „Speichern“/„Weiter“ ohne Ziel.
5. **Fehlertexte:** überwiegend handlungsorientiert; vollständige Prüfung in D5 je Seite.
6. **Demodaten-Hinweis:** Bildschirmfotos mit Demodaten brauchen den Hinweis „Beispieldarstellung mit Demodaten“ (betrifft nur Marketing-Material, nicht die App).

## 5. Abweichungen bei der Navigation (Spec Abschnitt 5 ↔ „Web und Mobile“ Abschnitt 3)

| Rolle | Tab-Leiste heute (Spec) | Tab-Leiste laut Design System (Mitte = Hauptaktion, Amber) |
| --- | --- | --- |
| Schüler | Heute, Plan, Aufgaben, Nachrichten, Profil | Heute, Plan, **Hausübungen**, Chat, Mehr |
| Eltern | Heute, Plan, Abwesenheit, Nachrichten, Profil | Heute, Plan, **Abwesenheit melden**, Nachrichten, Mehr |
| Lehrer | Heute, Klassenbuch, Klassen, Nachrichten, Profil | Heute, Plan, **Klassenbuch**, Chat, Mehr |
| Klassenvorstand | Heute, Klassenbuch, Meine Klasse, Nachrichten, Profil | wie Lehrer (Meine Klasse in Sidebar/Mehr) |
| Direktion | Lagebild, Supplierung, Auswertung, Nachrichten, Mehr | Lagebild, Supplierung, **Freigaben**, Nachrichten, Mehr |
| Administration | Personen, Klassen, Stundenplan, Import, Mehr | **Übersicht** (neu), Stundenplan, **Import**, Nachrichten, Mehr |
| Schul-IT | – (Rolle gibt es nicht) | Übersicht, Import, Zugänge, Datenschutz, Mehr |

Weitere Unterschiede:

- „Mehr“ ist heute eine Seite (nur Direktion und Administration). Laut System ist „Mehr“ ein **Sheet** mit Profil, Rolle wechseln, Theme, Hilfe, Abmelden – für alle Rollen.
- Sidebar heute = dieselben fünf Einträge wie die Tab-Leiste. Laut System hat sie je Rolle mehr Punkte und einen Abschnitt „Schule“.
- Topbar heute: Name, Rollen, Glocke, Abmelden. Laut System: Seitensuche (Strg/Cmd+K), Offline-Chip, Glocke, Profil-Menü mit Rolle und Schule.
- Zähler: heute ein roter Punkt bei Nachrichten. Laut System Amber-Zähler (`pf-nav__count`) nur für Dinge mit Frist (offene Einträge, Supplierungen).
- Umschaltpunkt: heute ab 768px (`md`) Sidebar. Laut System ab 1024px (`bp-lg`), darunter Tab-Leiste (auch Tablet).

## 6. Lücken und Widersprüche im Design System (Vorschläge statt Erfindungen)

1. **Komponenten ohne Vorgabe:** Checkbox, Switch, SegmentedControl, ListRow/Tabelle, Select. Vorschlag: aus vorhandenen Tokens ableiten (Checkbox/Switch: Rand `line-strong`, aktiv `brand`; Segment: Track `bg-sunken`, aktiv `bg-raised` mit `shadow-card`, `radius-pill`; Tabelle: Kopf `label` auf `bg-sunken`, Zeile 52px, Linie `line`) und als Ergänzung ins Design System zurückspielen.
2. **Rohwerte in `bundle.css`:** Die Referenz-CSS enthält feste Werte (z. B. Chip 13px, Zeilenhöhen 52/56px, Kanten-Schatten `#1a33a6` beim Drücken), obwohl „keine Rohwerte“ gilt und das Token-Lint `packages/ui/src` prüft. Vorschlag: `bundle.css` unverändert als Datei des Design Systems übernehmen und – wie `tokens.css` – vom Token-Lint ausnehmen; App-Code und eigene Komponenten bleiben rohwertfrei.
3. **Typografie mobil:** `h1` 28/32 und `h2` 22/28 „mobil“ ohne Breakpoint. Vorschlag: mobil = unter `bp-lg` (wie die Shell).
4. **Hilfe** im „Mehr“-Sheet: Es gibt keine Hilfeseite. Vorschlag: Punkt weglassen, bis Inhalte existieren.
5. **Lighthouse „installierbar“:** Lighthouse hat die PWA-Kategorie ab Version 12 entfernt. Vorschlag: eigener Playwright-Test für Manifest, Icons, Service Worker und Offline-Start; LCP weiterhin mit Lighthouse (mobil).
6. **Entfall, Raumwechsel** fehlen in „Status auf einen Blick“ – Vorschlag siehe 2a.
7. **Schul-IT** ist eine Rolle im System, aber nicht im Datenmodell und nicht in der Rechte-Matrix (Spec Abschnitt 3).

## 7. Entscheidungen und Vorschlag für die Umsetzung

### Entscheidungen, die ich treffe (Begründung)

- **E1 `bundle.css` 1:1:** Datei liegt unverändert in `packages/ui/src/styles/bundle.css`; React-Komponenten setzen die `pf-*`-Klassen (Varianten über `cva`). Vorteil: keine Abweichung beim Nachbauen, neue Fassungen des Systems lassen sich einfach ersetzen. Utilities nur für Layout (Abstände, Raster) aus Tokens.
- **E2 Typografie als Tailwind-Utilities aus Tokens:** `gen-theme.mjs` schreibt die Stile als `--text-*`-Tokens (Größe, Zeilenhöhe, Gewicht, Laufweite) → Klassen `text-h1`, `text-body-sm`, `text-overline`, `text-mono` …; Tailwinds Standardgrößen (`text-sm`, `text-lg` …) werden abgeschaltet, damit sie gar nicht mehr gehen.
- **E3 Theme per Cookie statt Inline-Skript:** Die App hat eine strenge CSP mit Nonce (M6). Der Server setzt `data-theme` schon beim Rendern aus dem Cookie, „System“ folgt `prefers-color-scheme` in CSS. Ergebnis wie gefordert (kein Aufblitzen), ohne Inline-Skript. Cookie heißt künftig `pf-theme`, Werte `system|light|dark`.
- **E4 Schriften mit `next/font/google`** wie vorgegeben: Download beim Build, Auslieferung von der eigenen Domain, Fallback-Metriken gegen Layout-Sprünge. Inter entfällt.
- **E5 Navigation bleibt eine Datei:** `packages/shared/src/navigation.ts` ist schon die einzige Quelle (inkl. erlaubter Routen); sie bekommt `primary`, Zähler-Quelle und Sidebar-Abschnitte. Kein neues Rechtemodell.
- **E6 Showcase-Route statt Storybook:** `/komponenten` (öffentlich, `noindex`, nur Demo-Inhalte), alle Bausteine in allen Zuständen, hell und dunkel nebeneinander. Spart eine zweite Build-Kette.
- **E7 E-Mails, PDF, Push:** Marke und Farben aus `tokens.json` (importiert, keine Hex-Werte im Code).
- **E8 shadcn-Zuordnung entfällt:** Das System ordnet shadcn-Variablen zu (`--primary`, `--border` …). Die App nutzt keine shadcn-Komponenten, nur Radix und eigene `cva`-Bausteine; die Variablen würden nur alte Namen am Leben halten.
- **E9 Splash unter iOS:** Android erzeugt den Splash aus Manifest (Nacht) und Icon. iOS braucht je Gerätegröße ein eigenes Startbild; das folgt bei Bedarf, bis dahin zeigt iOS die Nachtfläche aus `background_color` nicht, sondern Weiß.
- **E10 Wortmarke als Pfade:** bis zur Umwandlung (fonttools) ist die Wortmarke Live-Text in Bricolage Grotesque in der Komponente `Logo`; E-Mails und PDF nennen den Namen als Text.

### Entscheidungen der Produktverantwortung (am 12. Okt. 2026 bestätigt)

- **F1 Name:** PROfessor überall in Oberfläche, E-Mails, Manifest, 2FA-Aussteller, iCal und Spec; Repo und Pakete bleiben `schulplattform`/`@sp`.
- **F2 Navigation nach Design System** (Tabelle 5) statt Spec Abschnitt 5. Schul-IT entfällt vorerst (wäre eine neue Rolle mit Rechte-Matrix); ihre Punkte bleiben bei der Administration. Neu: Admin-„Übersicht“ mit Checkliste „Schule einrichten“ aus vorhandenen Daten.
- **F3 Fächerfarben:** `Subject.color` speichert künftig eine der acht Fächerfarben (`kobalt`, `mint`, … statt Hex). Migration ordnet bestehende Fächer nach Name/Kürzel der Standardzuordnung zu (Mathe Kobalt, Deutsch Koralle …). Kleine Änderung an Validierung und Daten, sonst kein Verhalten.
- **F4 Anrede Sie** für Eltern, Direktion und Administration: Texte bekommen eine zweite Fassung (ICU `select` nach Rolle), auch E-Mails und Einführung.

### Pfade

```
docs/design-system/            Quelle: PROfessor-Design-System.md, tokens.json, bundle.css (Kopien aus dem Artifact)
docs/design-audit.md           dieses Dokument
docs/kontrast.md               erzeugt von scripts/check-contrast.mjs
scripts/gen-theme.mjs          tokens.json → packages/ui/src/styles/tokens.css + theme.css (Tailwind-Anbindung)
scripts/check-tokens.mjs       Token-Lint (Hex, rgb(), px in Arbitrary Values, Tailwind-Standardfarben/-größen)
scripts/check-contrast.mjs     Kontrastpaare aus den Token-Hinweisen, beide Themes
scripts/gen-icons.mjs          app-icon-1024.svg → PWA-Icons (sharp)
packages/ui/src/styles/        tokens.css (erzeugt), theme.css (erzeugt), base.css, bundle.css, index.css
packages/ui/src/components/    Button, Chip, Card, Field, KpiTile, Toast, Banner, Sheet, EmptyState, Skeleton,
                               Logo, Sidebar, TabBar, TimetableGrid, AttendanceRow (+ abgeleitete Checkbox, Switch,
                               SegmentedControl, ListRow, Select, Textarea)
packages/ui/assets/logo/       symbol-kobalt.svg, symbol-creme.svg, symbol-nacht.svg, app-icon-1024.svg
apps/web/app/layout.tsx        Schriften, theme-color je Theme
apps/web/app/(public)/komponenten/   Showcase (E6)
apps/web/src/components/shell/ AppShell, Sidebar-/Topbar-/TabBar-Verdrahtung, Mehr-Sheet, Befehlspalette
apps/web/public/icons/         erzeugte PWA-Icons
```

### Phasen (ein Commit je Phase, nach jeder Phase lint, typecheck, Tests grün)

- [x] **D1 Fundament:** Design-System-Dateien ins Repo, `gen-theme.mjs`, Tokens/Theme/Base, Schriften, Theme-Cookie, `theme-color`, Logo-Assets, PWA-Icons, Manifest, Name (F1), Spec Abschnitt 6 → Verweis auf `docs/design-system/`.
- [x] **D2 Bausteine:** Komponenten aus Abschnitt 2 inkl. Toast-Provider, Showcase `/komponenten`, Tests.
- [x] **D3 Shell:** Sidebar ab 1024px, Topbar mit Befehlspalette (nur Seiten der Rolle; Personensuche bleibt V1), Tab-Leiste mit erhobener Hauptaktion, Mehr-Sheet (Profil, Rolle wechseln, Theme, Abmelden), Navigation nach F2, Admin-Übersicht.
- [ ] **D4 Fachkomponenten:** `TimetableGrid`, `AttendanceRow`, Heute-Nachtkarte; Fächerfarben (F3); Playwright-Zeitmessung „Stunde abschließen“ (≤ 4 Taps, < 10 s).
- [ ] **D5 Seiten:** in der Reihenfolge Anmeldung, Heute, Klassenbuch, Abwesenheit melden, Stundenplan, Lagebild, Supplierung, Editor, Admin, Nachrichten, Prüfungen, danach die übrigen; Anrede (F4), Texte ohne Ausrufezeichen, Leer-/Lade-/Fehler-/Offline-Zustände.
- [ ] **D6 Härtung:** Token-Lint und Kontrast-Skript in CI, Screenshots hell/dunkel × 390/1280, axe, Tastatur, Reduced Motion, PWA-Test, LCP, Aufräumen (alte Tokens, `Badge`, Inter, alte Klassen), dieses Audit abhaken.

Nicht Teil von M6.5: AI-Planung (M7), Personensuche (PL-06, V1), Schul-IT-Rolle, Hilfeseiten.
