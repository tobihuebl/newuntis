# PROfessor Design System

Brand book, UI-Konzept für Web und Mobile und Umsetzungsanleitung für Claude Code in einer Datei. Begleitdateien: `tokens.json` (Tokens, einzige Quelle) und `bundle.css` (Referenz-CSS der Komponenten, Präfix `pf-`). Die browsbare Fassung mit Live-Vorschauen liegt als Design-System-Artifact in Claude.

---

## Überblick

PROfessor ist die moderne Schulplattform für Österreich. Das Design System macht aus Stundenplan, Klassenbuch und Dashboards eine einzige, schnelle App, die sich auf Web und Mobil gleich anfühlt: mutig, klar, tippbar.

### So liest und nutzt du dieses System

1. Lies zuerst dieses Kapitel, dann `ci-handbuch` (Marke), `ui-grundlagen` (Regeln), `web-und-mobile` (Shell und Navigation), `screens` (Seiten je Rolle) und `umsetzung-claude-code` (Reihenfolge, Dateien, Prüfungen).
2. Verwende ausschließlich Tokens aus `tokens.json` bzw. `tokens.css`. Rohwerte (Hex, px) stehen in der App nirgends. Fehlt ein Token, wird er hier ergänzt, nicht in der App erfunden.
3. Verwende die Klassen aus `components/bundle.css` (Präfix `pf-`) als Referenz und baue sie in React nach. Jede Komponente hat eine README mit Regeln und eine Vorschau.
4. Schreibe den Namen immer **PROfessor**: PRO in Großbuchstaben, fessor klein, kein Punkt, kein Leerzeichen. Die Domain bleibt `pro.fessor.app`.

### Die Idee in einem Satz

Schulsoftware darf einfach sein. Alles, was ein Lehrer täglich tut, passiert in unter zehn Sekunden und mit einem Daumen.

### Inhaltliche Grundsätze (Content Fundamentals)

- **Anrede:** Schüler, Lehrkräfte und Klassenvorstände werden mit **du** angesprochen. Eltern, Direktion, Administration und Schul-IT mit **Sie**. Marketing und Verträge immer **Sie**.
- **Ton:** ruhig, freundlich, konkret. Kurze Sätze. Verben statt Substantivketten. Kein Behördendeutsch, kein Marketing-Pathos in der App.
- **Schreibweise:** österreichisches Deutsch (Supplierung, Klassenvorstand, Schularbeit, Hausübung, Jänner), Zahlen und Uhrzeiten "08:00", Datum "12. Okt."
- **Buttons:** ein Verb, höchstens drei Wörter: "Stunde abschließen", "Abwesenheit melden", "Vertretung bestätigen". Nie "OK", "Submit", "Weiter" ohne Ziel.
- **Fehler:** sagen, was zu tun ist. "Der Code muss sechs Ziffern haben." Nicht: "Ungültige Eingabe."
- **Leer:** positiv und erklärend. "Heute keine Supplierungen."
- **Kein Emoji, keine Ausrufezeichen** in der Oberfläche. Kein "Oops".

Beispiele aus der Präsentation, die den Ton setzen: "Schulsoftware darf einfach sein." "Die AI schlägt vor, die Schule entscheidet." "Weniger Zettel, weniger Telefonate."

### Visuelle Grundlagen (Visual Foundations)

- **Farbe:** Fläche ist `bg` (Creme) oder `bg-night` (Tiefblau). `brand` (Kobalt) ist die Handlungsfarbe. `signal` (Amber) lenkt Aufmerksamkeit und wird sparsam eingesetzt: ungefähr 70 % Fläche, 20 % Kobalt, 10 % Amber. Rot (`danger`) gibt es nur für Fehler und Zerstörendes.
- **Schrift:** Überschriften und Zahlen in Bricolage Grotesque 800 mit enger Laufweite (`display-xl` bis `h3`, `numeral-xl`). Fließtext und Bedienelemente in DM Sans (`body`, `label`). Uhrzeiten, Räume und Codes in JetBrains Mono (`mono`). Abschnittsmarken als `overline` in Großbuchstaben.
- **Raster-Motiv:** Das Stundenplan-Raster ist die Bildsprache der Marke: abgerundete Kacheln (`radius-md`), Lücke `space-2`, bunte Kacheln zwischen ruhigen. Es erscheint im Logo, im Hintergrund von Hero-Flächen, in Leerzuständen und im Cover. Keine Stockfotos, keine Figuren.
- **Formen:** Karten `radius-lg`, Buttons und Felder `radius-md`, Chips `radius-pill`, Sheets `radius-xl`.
- **Tiefe:** Karten mit `shadow-card` auf hellen, mit Haarlinie auf dunklen Flächen. Der Primär-Button hat eine Taster-Kante (`shadow-key-brand`), die beim Drücken verschwindet: Das ist die Signatur-Interaktion der Marke.
- **Bewegung:** 120 bis 320 ms, `cubic-bezier(.2,.8,.2,1)`. Bewegung bestätigt Handlung (Taster drückt, Kachel hebt sich), sie dekoriert nie. Mit `prefers-reduced-motion` entfällt sie.
- **Dark Mode:** Gleichwertig zum hellen Theme. Theme `dark` wechselt Flächen und Text; Kobalt-Text hellt auf (`brand-text`), der Fokusring wird Amber.
- **Barrierefreiheit:** WCAG 2.2 AA. Text mindestens 4.5:1, Bedienelemente mindestens 3:1, Tippflächen mindestens 44px. Zustände tragen immer Wort oder Icon, nie nur Farbe.

### Iconografie

Lucide (`lucide-react`), 24px-Raster, Strichstärke 2, Enden und Ecken rund, Farbe `currentColor`. Icons stehen immer neben einem Wort, außer in der Tab-Leiste und bei universellen Symbolen (Schließen, Mehr). Kein Emoji, keine Füll-Icons, keine Mischung mit anderen Icon-Sets.

### Fächerfarben

Jedes Fach bekommt eine der acht Fächerfarben (`fach-*`), Text darauf immer `on-fach`. Die Zuordnung ist eine Einstellung der Schule; Standard: Mathe Kobalt, Deutsch Koralle, Englisch Rosa, Bio Mint, Physik Himmel, Musik Flieder, Sport Limette, Geografie und Sonstiges Sand. Amber ist für Konflikte reserviert und deshalb keine Fächerfarbe.

### Status auf einen Blick

| Zustand | Chip | Fläche | Text |
| --- | --- | --- | --- |
| Anwesend, erledigt, Vertretung | `pf-chip--ok` | `brand-soft` | `brand-text` |
| Verspätet, Frist, Hinweis | `pf-chip--late` | `signal-soft` | `signal-ink` |
| Abwesend, Entwurf, inaktiv | `pf-chip--absent` | `neutral-soft` | `ink-muted` |
| Fehler | `pf-chip--danger` | `danger-soft` | `danger-ink` |
| Konflikt (ein Fokus pro Ansicht) | `pf-chip--solid` | `signal` | `on-signal` |

"OK" ist bewusst Kobalt und nicht Grün: Blau gegen Amber und Rot ist für Farbsehschwächen sicher unterscheidbar.

---

# CI-Handbuch

Das CI-Handbuch legt fest, wie PROfessor aussieht und klingt, überall außerhalb und innerhalb der App: Website, Präsentation, Verträge, Social Media, App-Store, Oberfläche.

## 1. Markenkern

**Positionierung:** Die modernste Schulplattform Österreichs für Stundenplan, Klassenbuch und Dashboards, alles in einer App.

**Versprechen:** Schulsoftware darf einfach sein. Weniger Klicks, weniger Zettel, weniger Telefonate.

**Beweise:** Klassenbuch in unter 10 Sekunden. PWA mit Offline-Modus. Echtzeit-Push, gezielt je Klasse. Ein Kern, alle Module vernetzt. Hosting in der EU.

**Persönlichkeit (vier Wörter):** klar, schnell, mutig, verlässlich. Mutig heißt: kräftige Farben, große Schrift, klare Aussagen. Verlässlich heißt: ruhige Flächen, vorhersehbares Verhalten, saubere Daten.

**Gegenbild:** Behördenblau mit Verlauf, Stockfoto-Klassenzimmer, Dropdown-Wüsten, Pastell-Illustrationen mit Strichmännchen.

## 2. Name

- Offizieller Name: **PROfessor**. Immer in dieser Schreibweise, in Fließtext, Überschriften, Verträgen, Store-Listings.
- Falsch: PRO.fessor, Pro.fessor, ProFessor, Professor, PROFESSOR (außer bewusst als Versalien in `overline`-Stil), "der Professor".
- Domain und App-Adresse: `pro.fessor.app` (klein, in `mono`). Produktfamilie: "PROfessor, ein Produkt der Kracht Media GmbH".
- Kurzform in engen Räumen (Tab-Titel, Push): **PROfessor**, nie "PRO".
- Pakete heißen **Basis**, **Plus**, **Komplett**. Das Highlight-Feature heißt **AI-Stundenplan**.
- Claim (Standard): **Schulsoftware darf einfach sein.** Kurzbeschreibung: *Stundenplan, Klassenbuch und Dashboards in einer App.*

## 3. Logo

**Symbol "Raster-P":** Ein P aus zehn abgerundeten Kacheln eines 3 × 5-Rasters, wie eine Stunde im Stundenplan. Neun Kacheln tragen die Hauptfarbe, die Kachel rechts oben im Bogen ist **immer Amber**: die eine Stunde, auf die es ankommt.

**Wortmarke:** PROfessor in Bricolage Grotesque 800, Laufweite -0.04em. "PRO" farbig, "fessor" neutral, ohne Punkt.

| Hintergrund | Symbol | "PRO" | "fessor" |
| --- | --- | --- | --- |
| Creme, Weiß, helle Flächen | Kobalt + Amber | Kobalt | Nacht |
| Nacht, dunkle Flächen, Kobalt-Flächen | Creme + Amber | Amber | Creme |
| Einfarbig (Druck, Stempel) | Nacht, Amber-Kachel Nacht | Nacht | Nacht |

**Dateien:** Assets, Gruppe Logo: `symbol-kobalt.svg`, `symbol-creme.svg`, `symbol-nacht.svg`, `app-icon-1024.svg`. Die Wortmarke wird aus der Schriftdatei zu Pfaden umgewandelt (siehe `umsetzung-claude-code`, Schritt D1) und als `wordmark-*.svg` abgelegt.

**Schutzraum:** eine Kachelbreite (ein Zehntel der Symbolhöhe) rundum. **Mindestgröße:** Symbol 20px hoch, Symbol plus Wortmarke 24px hoch, Wortmarke allein 16px.

**Nicht erlaubt:** Symbol drehen, strecken, mit Schatten oder Verlauf versehen, Kacheln umfärben, die Amber-Kachel weglassen, Symbol mit Punkt-Wortmarke "PRO.fessor" kombinieren, Logo auf Fotos ohne ruhige Fläche.

**App-Icon:** Symbol Creme + Amber auf Nacht, 1024 × 1024, quadratisch ohne Rundung (das Betriebssystem rundet). Maskable-Variante: Symbol innerhalb der inneren 80 %. Monochrom-Variante (Android): Symbol in einer Farbe, die Amber-Kachel als Aussparung.

## 4. Farben

| Rolle | Token | Hex | Einsatz |
| --- | --- | --- | --- |
| Nacht | `nacht` | `#0E192D` | Tiefe Flächen, Text auf Hell |
| Kobalt | `kobalt` | `#2E53EA` | Handlung, Auswahl, "OK" |
| Amber | `amber` | `#F3A423` | Aufmerksamkeit, Konflikt, Highlight |
| Creme | `creme` | `#F6F5F1` | Helle Fläche, Text auf Nacht |

Im dunklen Theme wird die Handlungsfarbe `brand` auf `#4A68F0` aufgehellt (die Markenfarbe Kobalt bleibt `#2E53EA`), damit Flächen gegen Nacht mindestens 3:1 erreichen. Hilfsflächen: Kobalt weich `#E3E9FD`, Amber weich `#FCF0D7`, Nachtfläche 2 `#16243E`. Alle Werte stehen als Tokens im System; in Layouts außerhalb der App werden sie aus `tokens.json` übernommen.

**Mischverhältnis:** 70 % Creme oder Nacht, 20 % Kobalt, 10 % Amber. Amber nie als Fließtext auf Hell (1.9:1), nur als Fläche mit Nacht-Text oder als Text auf Nacht.

**Verläufe:** Einziger erlaubter Verlauf ist der Nacht-Kobalt-Hintergrund der Präsentation (Nacht `#0E192D` nach `#1B316D`, diagonal, nur als großer ruhiger Hintergrund hinter Titelfolien). Nie in der App-Oberfläche.

## 5. Typografie

| Schrift | Einsatz | Schnitte |
| --- | --- | --- |
| **Bricolage Grotesque** | Überschriften, Wortmarke, große Zahlen | 700, 800 |
| **DM Sans** | Fließtext, Bedienelemente, Tabellen | 400, 500, 600, 700 |
| **JetBrains Mono** | Uhrzeiten, Räume, Codes, Domains | 500 |

Alle drei sind freie Google-Fonts (OFL) und werden selbst gehostet (`next/font` lädt sie zur Build-Zeit, keine Anfrage an Google zur Laufzeit; wichtig für den Datenschutz). Überschriften sind groß, eng gesetzt (-0.02 bis -0.04em) und linksbündig. Zahlen im Dashboard sind die größten Elemente der Seite. Abschnittsmarken (`overline`) in Großbuchstaben, 12px, Laufweite 0.12em.

Für Word, PowerPoint und E-Mail-Signaturen ohne Schriftinstallation: Arial (Überschrift und Text), Courier New (Mono).

## 6. Bildsprache

- **Raster-Motiv** statt Foto: bunte und ruhige Kacheln im Stundenplan-Raster. Hero-Flächen zeigen ein 6 × 4-Raster mit zwei bis vier Kobalt- und ein bis zwei Amber-Kacheln, der Rest in `bg-night`, `brand-soft` oder `line`.
- **Produktbilder:** echte Bildschirmfotos der App mit Demodaten ("Beispieldarstellung mit Demodaten"), im Telefonrahmen (Nacht, `radius-xl`) oder Browserrahmen. Namen von Kindern sind immer erfunden.
- **Fotos** (Pilotschulen, Team): nur echte, ungestellte Bilder, ruhiges Licht, kein Stockmaterial. Zuschnitt in Kachelform (`radius-lg`).
- **Diagramme:** flach, zwei Farben (Kobalt gegen Grau, Amber für den Vergleichswert), Zahl direkt am Balken, keine 3D-Effekte.

## 7. Tonalität im Marketing

Kräftig, kurz, mit Beweis. Eine Aussage pro Folie oder Absatz. Marketing nutzt Sie.

| Statt | Besser |
| --- | --- |
| "Innovative, ganzheitliche Schullösung" | "Klassenbuch in unter 10 Sekunden." |
| "Digitalisierung leicht gemacht" | "Weniger Zettel, weniger Telefonate." |
| "Künstliche Intelligenz übernimmt die Planung" | "Die AI schlägt vor, die Schule entscheidet." |
| "Höchste Sicherheitsstandards" | "Hosting in der EU, getrennte Mandanten, Zwei-Faktor-Login." |

## 8. Präsentation und Dokumente

- Folienformat 16:9. Titelfolie und Highlight-Folien auf Nacht, Inhaltsfolien auf Creme. Jede Folie hat `overline` (Abschnitt), Titel in `display-lg`, höchstens fünf Elemente.
- Fußzeile: links "PROfessor · pro.fessor.app" in `caption`, rechts Foliennummer.
- Preisfolien: Kachel je Paket, das empfohlene Paket (Plus) auf Nacht mit Amber-Marke "Empfohlen".
- Verträge und Angebote: Creme-Kopf mit Wortmarke, Fließtext 10.5pt DM Sans (Ersatz Arial), Überschriften Nacht, Tabellenkopf Kobalt weich.

## 9. Social, Store, OG-Bild

- **OG-Bild und Social-Karte** (1200 × 630): Nachtfläche, Raster-Motiv rechts, Wortmarke und Claim links, `pro.fessor.app` in `mono`.
- **App-Store und Play-Store:** Screenshots im Telefonrahmen auf Nacht oder Creme, eine Kachel-Aussage pro Bild ("Klassenbuch in unter 10 Sekunden").
- **Profilbild:** App-Icon.

---

# UI-Grundlagen

Verbindliche Regeln für jede Oberfläche von PROfessor. Sie gelten für Web und Mobil gleichermaßen; wo sie sich unterscheiden, steht es dabei.

## 1. Gestaltungsprinzipien

1. **Zehn-Sekunden-Regel.** Jede tägliche Aufgabe (Anwesenheit, Stunde abschließen, Abwesenheit melden) ist in unter zehn Sekunden erledigt. Wer mehr als drei Taps braucht, hat ein Designproblem.
2. **Ein Daumen.** Mobil liegt die Hauptaktion unten, im Daumenbereich. Nichts Wichtiges oben links.
3. **Ein Fokus pro Ansicht.** Pro Bildschirm gibt es genau eine Hauptaktion (Kobalt) und höchstens einen Aufmerksamkeitspunkt (Amber).
4. **Zahl vor Diagramm, Wort vor Farbe.** Zustände stehen als Wort, wichtige Mengen als große Zahl.
5. **Mutig, aber ruhig.** Kräftige Farbflächen und große Schrift an wenigen Stellen, dazwischen viel Creme.
6. **Offline ist normal.** Die Oberfläche zeigt nie "Fehler", wenn das Netz fehlt, sondern "wartet auf Verbindung".
7. **Die AI schlägt vor, der Mensch entscheidet.** Vorschläge sind immer als Vorschlag erkennbar (Entwurf-Chip, Rückgängig) und werden erst nach Bestätigung wirksam.

## 2. Tokens in der Praxis

- Alle Werte kommen aus `tokens.css`: Farben (`--bg`, `--ink`, `--brand` …), Abstände (`--space-1` bis `--space-16`), Radien (`--radius-*`), Schatten (`--shadow-*`), Schriften (`--font-display`, `--font-text`, `--font-mono`).
- Abstände in der App sind ausschließlich Vielfache von 4px aus den Tokens. Abweichungen (zum Beispiel 13px) sind ein Fehler.
- Schrift: Überschriften über `h1`/`h2`/`h3`, Text über `body`, `body-sm`, `label`, `caption`. Mobil: `h1` 28/32, `h2` 22/28, `display-xl` entfällt (stattdessen `display-lg`).
- Zahlen in Tabellen, Kennzahlen und Uhrzeiten immer mit `font-variant-numeric: tabular-nums`.

## 3. Farbeinsatz

| Wann | Farbe |
| --- | --- |
| Hauptaktion, aktive Auswahl, Links, "OK" | `brand`, `brand-text`, `brand-soft` |
| Aufmerksamkeit, Konflikt, Frist, Verspätung | `signal`, `signal-soft`, `signal-ink` |
| Fehler, Zerstörendes | `danger`, `danger-soft`, `danger-ink` |
| Inaktiv, Entwurf, abwesend | `neutral-soft`, `ink-muted` |
| Fach im Stundenplan | `fach-*` mit `on-fach` |
| Starke Fläche (aktuelle Stunde, Sidebar, Toast) | `bg-night` mit `ink-on-night` |

Regeln: Amber-Text nur als `signal-ink` auf `signal-soft`. Kobalt als Text nur als `brand-text`. Zwei verschiedene Farbflächen mit Aussage nie nur durch Farbton trennen, immer auch durch Helligkeit, Wort oder Icon. Kein Verlauf, kein Glow, keine Transparenz auf Text.

## 4. Layout

| Breakpoint | Token | Verhalten |
| --- | --- | --- |
| bis 639px | (Basis) | Eine Spalte, Gutter `space-4`, Tab-Leiste unten |
| ab 640px | `bp-sm` | Karten zweispaltig |
| ab 768px | `bp-md` | Tablet: Tab-Leiste bleibt, Stundenplan 5 Tage |
| ab 1024px | `bp-lg` | Sidebar statt Tab-Leiste, Gutter `space-6` |
| ab 1280px | `bp-xl` | Dashboards dreispaltig, `content-max` 1200px |

- **Mobile first.** Zuerst die Mobilansicht bauen, dann erweitern.
- Seitenkopf: `overline` (Bereich), `h1` (Titel), optional eine Zeile `body-sm`. Abstand zu Inhalt `space-8`.
- Inhalt in einem Raster aus Karten mit Abstand `space-4` mobil und `space-6` Web.
- Safe-Area beachten: `env(safe-area-inset-bottom)` unter Tab-Leiste und angehefteten Buttons, `env(safe-area-inset-top)` in der Kopfzeile der installierten PWA.

## 5. Interaktion

- **Tippfläche** mindestens 44px (`tap-min`), Buttons und Felder 48 bis 52px (`tap-comfort`). Zeilen im Klassenbuch ab 56px.
- **Zustände** jedes interaktiven Elements: Ruhe, Hover (nur Web), Fokus, Gedrückt, Deaktiviert, Laden, Fehler. Alle sind in den Komponenten-Vorschauen gezeigt oder per Klasse definiert.
- **Fokus:** `outline: 3px solid var(--focus); outline-offset: 3px` auf jedem fokussierbaren Element, nie entfernt.
- **Rückgängig statt Bestätigen.** Reversible Aktionen laufen sofort und zeigen einen Toast mit "Rückgängig". Nur nicht Umkehrbares (Löschen, Veröffentlichen, Supplierung versenden) bekommt ein Bestätigungs-Sheet.
- **Gesten:** Wischen zum Schließen eines Sheets, Ziehen in der Stundenplan-Bearbeitung, Tippen zum Umschalten. Jede Geste hat eine sichtbare Alternative.
- **Tastatur (Web):** Tab-Reihenfolge folgt der Leserichtung, `Esc` schließt Overlays, `Enter` löst die Hauptaktion aus, Stundenplan-Zellen sind per Pfeiltasten und Leertaste verschiebbar.

## 6. Bewegung

| Zweck | Dauer | Kurve |
| --- | --- | --- |
| Taster drücken, Kachel antippen | 120 ms | `cubic-bezier(.2,.8,.2,1)` |
| Hover, Farbwechsel | 120 ms | linear |
| Karte heben, Chip wechseln | 160 ms | `cubic-bezier(.2,.8,.2,1)` |
| Sheet, Dialog, Seitenwechsel | 240 bis 320 ms | `cubic-bezier(.2,.8,.2,1)` |

Seitenwechsel: neue Seite gleitet 24px von unten ein und blendet auf (Mobil), Web nur Überblenden. Listen erscheinen gestaffelt mit 30 ms Versatz, höchstens zehn Elemente. Bei `prefers-reduced-motion` alles sofort, ohne Bewegung.

## 7. Zustände der Oberfläche

- **Laden:** Skeletons in der Form des Inhalts. Ab 1 s Wartezeit sichtbar. Kein Vollbild-Spinner.
- **Leer:** `EmptyState` mit Kachel-Raster, ein Satz, optional eine Aktion.
- **Fehler:** am Ort des Fehlers (Feld, Zeile), mit Icon und Anweisung. Systemfehler als Banner `danger-soft` mit "Erneut versuchen".
- **Offline:** Banner `pf-banner` oben mit Anzahl wartender Einträge. Lesbare Daten bleiben sichtbar, Einträge werden lokal gespeichert und zeigen "wartet".
- **Konflikt bei Synchronisation:** Zeile mit Amber-Chip "Konflikt", Tippen öffnet ein Sheet mit beiden Versionen und zwei Aktionen.
- **Berechtigung fehlt:** Hinweis in `brand-soft` mit Klartext, wen man fragen kann.

## 8. Formulare und Tabellen

- Ein Feld pro Zeile, Beschriftung darüber, Hilfetext darunter. Pflichtfelder sind der Normalfall; optionale Felder tragen "(optional)".
- Validierung beim Verlassen des Feldes, Fehlermeldung bleibt bis zur Korrektur. Beim Absenden springt der Fokus zum ersten Fehler.
- Tabellen (Web, Admin): Kopf `label` auf `bg-sunken`, Zeilenhöhe 52px, Zebrastreifen nein, Trennung durch `line`. Mobil werden Tabellen zu Karten-Listen mit den zwei wichtigsten Feldern.
- Import (CSV): Drag-Fläche als großer Kachel-Bereich, Fortschritt als Balken, Fehler zeilenweise mit Link zur Korrektur.

## 9. Barrierefreiheit (Pflicht)

- WCAG 2.2 AA. Kontrast Text 4.5:1, große Schrift und Bedienelemente 3:1. Die Tokens erfüllen das in beiden Themes; wer neue Kombinationen verwendet, prüft sie.
- Farbe trägt nie allein Bedeutung: Chips haben Wort und Icon, Konflikte Wort und Rand.
- Semantik: echte `button`, `a`, `label`, `nav`, `main`, Überschriftenhierarchie ohne Sprünge. `aria-current="page"`, `aria-invalid`, `role="status"` für Toasts.
- Bildschirmleser: Zahlen in Kennzahlen als "3 Supplierungen" vorlesen (Zahl und Wort im selben Element).
- Zoom bis 200 % und Textgröße über Systemeinstellung ohne Verlust. Keine festen Höhen für Text.
- Eingabefelder 16px, damit iOS nicht zoomt. `autocomplete`-Attribute setzen.
- Prüfung: `axe` in jedem Playwright-Test, manuell VoiceOver (iOS) und TalkBack (Android) für Klassenbuch und Abwesenheit melden.

## 10. Datenschutz in der Oberfläche

- Schülernamen erscheinen nur dort, wo die Rolle sie braucht. Dashboards der Direktion zeigen Zahlen, Namen erst per Klick.
- Keine personenbezogenen Daten in URLs, Seitentiteln, Push-Texten auf dem Sperrbildschirm ("Neue Nachricht aus 3B", nicht der Name).
- Demodaten sind immer erfunden und als "Beispieldarstellung mit Demodaten" gekennzeichnet.

---

# Web und Mobile

Eine Codebasis, zwei Gestalten: Web (ab 1024px) und Mobil (PWA, Telefon und Tablet). Dieselben Komponenten, dieselben Tokens, andere Anordnung.

## 1. Shell Web (ab `bp-lg`)

```
┌──────────┬──────────────────────────────────────────┐
│ Sidebar  │ Topbar: Suche · Offline-Status · Profil   │ 64px
│ 264px    ├──────────────────────────────────────────┤
│ bg-night │ Inhalt (max 1200px, Gutter 24px)          │
│          │ overline · h1 · Karten-Raster             │
└──────────┴──────────────────────────────────────────┘
```

- **Sidebar** (`Navigation`): Nachtfläche mit Wortmarke, Hauptpunkte der Rolle, darunter Abschnitt "Schule" für Verwaltung. Aktiver Punkt Kobalt-Fläche. Auf 1024 bis 1279px bleibt sie sichtbar, darunter wird sie zur Tab-Leiste.
- **Topbar:** Seitensuche (`Strg/Cmd + K` öffnet Befehlspalette), Offline-Status-Chip, Benachrichtigungen, Profil-Menü mit Rolle und Schule.
- **Inhalt:** `overline` zeigt den Bereich, `h1` den Titel; Hauptaktion rechts neben dem Titel als Primär-Button.
- **Dichte:** Web darf kompakter sein (Buttons `pf-btn--sm` in Tabellen, 52px-Tabellenzeilen), Tippflächen bleiben bei Touch-Geräten ab 44px.

## 2. Shell Mobil (bis `bp-lg`)

```
┌────────────────────────┐
│ Kopfzeile  64px         │  Titel · Aktion rechts
├────────────────────────┤
│ Inhalt, Gutter 16px     │
│                        │
├────────────────────────┤
│ Tab-Leiste 68px+Safe    │  Heute · Plan · [Hauptaktion] · Chat · Mehr
└────────────────────────┘
```

- **Tab-Leiste:** fünf Tabs, der mittlere ist die Hauptaktion der Rolle als erhobene Amber-Taste (56px, 22px über der Leiste). Aktiv: Kobalt-Text, `brand-soft`-Pille hinter dem Icon.
- **Kopfzeile:** links Titel (`h2`), rechts höchstens eine Aktion. Beim Scrollen verkleinert sich der Titel und die Kopfzeile bekommt eine Haarlinie.
- **Sheets** für Aufgaben, **Seiten** für Inhalte. Zurück ist immer möglich: Pfeil links oben und System-Geste.
- **Angeheftete Hauptaktion:** Primär-Button am unteren Rand über der Tab-Leiste, wenn die Seite eine Aufgabe ist (Stunde abschließen).
- **Tablet (ab `bp-md`):** Tab-Leiste bleibt, Inhalt zweispaltig, Stundenplan 5 Tage.

## 3. Navigation je Rolle

| Rolle | Tab 1 | Tab 2 | Tab 3 (Hauptaktion) | Tab 4 | Tab 5 |
| --- | --- | --- | --- | --- | --- |
| Schüler | Heute | Plan | Hausübungen | Chat | Mehr |
| Eltern | Heute | Plan | Abwesenheit melden | Nachrichten | Mehr |
| Lehrer, Klassenvorstand | Heute | Plan | Klassenbuch | Chat | Mehr |
| Direktion | Lagebild | Supplierung | Freigaben | Nachrichten | Mehr |
| Administration | Übersicht | Stundenplan | Import | Nachrichten | Mehr |
| Schul-IT | Übersicht | Import | Zugänge | Datenschutz | Mehr |

Web-Sidebar je Rolle (gleiche Reihenfolge, zusätzliche Punkte):

- **Lehrer:** Heute, Stundenplan, Klassenbuch, Supplierung, Prüfungen, Nachrichten.
- **Eltern:** Heute, Stundenplan, Abwesenheit, Termine, Nachrichten.
- **Schüler:** Heute, Stundenplan, Hausübungen, Prüfungen, Nachrichten.
- **Direktion:** Lagebild, Supplierung, Prüfungskalender, Auswertungen, Freigaben, Nachrichten.
- **Administration:** Übersicht, Stammdaten (Klassen, Fächer, Räume, Personen), Stundenplan (Editor, AI-Planung), Import, Rechte und Einladungen.
- **Schul-IT:** Import, Single Sign-on, Datenschutz, Audit-Log.

"Mehr" öffnet ein Sheet mit Profil, Rolle wechseln, Theme (Hell, Dunkel, System), Hilfe, Abmelden.

## 4. PWA

- **Manifest:** `name` "PROfessor", `short_name` "PROfessor", `theme_color` `#0E192D`, `background_color` `#0E192D`, `display` `standalone`, `orientation` `any`, Sprache `de-AT`.
- **Icons:** `app-icon-1024.svg` als Quelle; PNG 192, 512 und Maskable 512 daraus erzeugen; `apple-touch-icon` 180 ohne Transparenz.
- **Statusleiste:** `theme-color` je Theme (`#F6F5F1` hell, `#0E192D` dunkel) per `media`-Attribut.
- **Splash:** Nachtfläche, Raster-P in Creme mit Amber-Kachel, keine Animation länger als 600 ms.
- **Installation:** Dezenter Hinweis in "Mehr" und einmalig nach der zweiten Sitzung (Kachel `brand-soft`, "Auf dem Startbildschirm", Aktion "Installieren" und "Nicht jetzt"). Kein modaler Zwang.
- **Offline:** App-Shell wird zwischengespeichert, Daten in IndexedDB (Dexie). Offline-Status siehe `ui-grundlagen`.
- **Push:** Texte kurz, ohne personenbezogene Daten auf dem Sperrbildschirm, Icon Symbol Creme auf Nacht.

## 5. Themes

- Drei Einstellungen: **System** (Standard), **Hell**, **Dunkel**. Umsetzung über `data-theme="light|dark"` am `html`-Element; "System" folgt `prefers-color-scheme`.
- Theme wird beim ersten Rendern gesetzt (kleines Inline-Skript im `head`), damit nichts aufblitzt.
- Das Raster-Motiv und die Fächerfarben sind in beiden Themes identisch, nur Flächen und Text wechseln.

## 6. Responsive Muster

| Muster | Mobil | Web |
| --- | --- | --- |
| Stundenplan | Tagesliste mit Zeitleiste, Wisch zum Tag | 5-Tage-Raster, Drag and Drop |
| Klassenbuch | Vollbreite Zeilen, Hauptaktion unten | Zweispaltig: Liste links, Stundendetail rechts |
| Dashboards | Kennzahlen als Karten-Stapel | Drei Spalten, Kennzahl groß |
| Tabellen | Karten-Liste mit zwei Feldern | Tabelle mit Sortierung und Filter |
| Formulare | Eine Spalte, Sheet | Eine Spalte, max. 520px, Dialog oder Seite |
| Nachrichten | Liste, dann Detail als Seite | Zweispaltig |

---

# Screens

Spezifikation der wichtigsten Seiten je Rolle. Jeder Eintrag nennt Zweck, Aufbau auf Mobil und Web, die verwendeten Komponenten und die Besonderheit, die die Seite zu PROfessor macht. Texte sind Vorschläge im Ton des Systems.

## 1. Anmeldung und Zwei-Faktor

**Zweck:** schnell hinein, sicher bleiben.
- **Mobil:** Nachtfläche oben mit Symbol Creme und Wortmarke, darunter Creme-Karte mit `Field` E-Mail, `Field` Passwort, Primär-Button "Anmelden", Link "Passwort vergessen". Rolle ergibt sich aus dem Konto, keine Rollenwahl.
- **Web:** zweigeteilt. Links Nachtfläche mit Raster-Motiv (6 × 4 Kacheln), Claim "Schulsoftware darf einfach sein." in `display-xl`. Rechts die Anmeldekarte, 420px.
- **Zwei-Faktor** (Lehrer, Direktion, Administration): sechs `mono`-Ziffernfelder à 52px, automatisches Weiterspringen, Einfügen aus der Zwischenablage, Autosubmit nach der sechsten Ziffer.
- **Besonderheit:** Fehler am Feld ("Der Code muss sechs Ziffern haben"), nie ein Alert.
- **Einladung:** Landeseite mit Schulname, Rolle, Passwort setzen, 2FA einrichten in zwei Schritten.

## 2. Heute (Lehrer)

**Zweck:** das Lagebild des Tages und der direkte Einstieg ins Klassenbuch.
- **Aufbau:** Begrüßung `display-lg` ("Guten Morgen, Anna."), darunter die **Nachtkarte der aktuellen Stunde** (`Card night`: "3B · Mathe", "2. Stunde, Raum 12", Chip "Stunde offen", Primär-Button "Klassenbuch öffnen"). Danach die Tagesliste: Zeile je Stunde mit `mono` Uhrzeit, Klasse und Fach, Raum-Chip, Status-Chip (Raum, Vertretung, offen).
- **Web:** zweispaltig, links Tagesliste, rechts Karten "Offene Einträge" und "Supplierungen für mich".
- **Besonderheit:** Die aktuelle Stunde wird automatisch zur Nachtkarte; ist keine Stunde, zeigt die Karte die nächste.
- **Leer:** "Heute keine Unterrichtsstunden."

## 3. Klassenbuch

**Zweck:** Anwesenheit, Stoff und Hausübung in einem Schritt, auch offline.
- **Aufbau:** Kopf `overline` "HEUTE · 3B · MATHE", `body-sm` "2. Stunde, Raum 12". Darunter `Klassenbuch`-Zeilen (alle standardmäßig anwesend). Darunter Felder "Stoff" und "Hausübung" (`Field`, mehrzeilig, Diktat-Taste). Unten angeheftet "Stunde abschließen".
- **Interaktion:** Tippen auf eine Zeile wechselt anwesend/abwesend, langes Drücken öffnet das Verspätungs-Sheet (Minuten per Schnellwahl 5, 10, 15, Eigene). Beim Abschließen Toast "Stunde abgeschlossen" mit "Rückgängig".
- **Offline:** Einträge zeigen einen kleinen Punkt "wartet"; Banner oben zählt wartende Einträge. Nach der Synchronisation Toast "Synchronisiert". Konflikte öffnen ein Sheet mit beiden Versionen.
- **Web:** zweispaltig, links Liste, rechts Stundendetail (Stoff, Hausübung, Verlauf der letzten Stunden). Tastatur: Pfeile wechseln Zeile, `A` abwesend, `V` verspätet, `Enter` abschließen.
- **Besonderheit:** Ziel ist unter 10 Sekunden von "Klassenbuch öffnen" bis "abgeschlossen".
- **Leer:** "Keine Schülerinnen und Schüler in dieser Gruppe."

## 4. Stundenplan

**Ansicht (alle Rollen):**
- **Mobil:** Tagesliste mit Zeitleiste (`mono`), Wischen zwischen Tagen, Wochenübersicht als Sheet. Kacheln in Fächerfarben.
- **Web:** 5-Tage-Raster (`Stundenplan`), aktuelle Stunde mit Nacht-Rand.
- **iCal-Feed:** Aktion "In Kalender abonnieren" (Apple, Google, Outlook) als Sheet mit Link-Kopieren.

**Editor (Administration, Web):**
- Links Fachliste und Lehrerstunden-Zähler, Mitte Raster, rechts Konflikt-Panel.
- Drag and Drop mit angehobener Kachel (`is-drag`). Gültiges Ziel `brand-soft`, harter Konflikt `danger-soft` und Rückfederung. Konflikte sofort als Amber-Kachel mit Grund ("Lehrer doppelt belegt").
- Toolbar: Rückgängig, Wiederholen, Entwurf speichern, "Veröffentlichen mit Gültig-ab-Datum" (Primär, öffnet Bestätigungs-Sheet).
- Doppelstunden: Kachel zwei Zeilen hoch, Rand verbunden.

**AI-Planung (Paket Komplett):**
- Fünf Schritte als horizontale Leiste wie in der Präsentation: Eingabe, AI-Vorschlag, Regelprüfung, Feinschliff, Freigabe.
- Der Vorschlag erscheint als Entwurf (Chip "Entwurf", `neutral-soft`), nie direkt live. Unter dem Raster eine Bewertung: harte Konflikte "0", Hohlstunden, Tagesbelastung als einfache Zahlen.
- Textzeile unter dem Titel: "Die AI schlägt vor, die Schule entscheidet."

## 5. Abwesenheit melden (Eltern)

**Zweck:** Ein Tap statt Zettel.
- **Aufbau:** Hauptaktion in der Tab-Leiste. Öffnet ein Sheet: Kind wählen (bei mehreren), Grund als Chips (Krank, Arzttermin, Sonstiges), Zeitraum (Heute, Morgen, Eigener), optional Notiz, Primär-Button "Melden".
- **Danach:** Status-Verlauf als vier Kacheln wie in der Präsentation: Gemeldet, Erinnerung, Geprüft, Entschuldigt. Aktueller Schritt in Kobalt.
- **Besonderheit:** Bestätigung per Push, wenn die Klassenvorständin entschuldigt.
- **Anrede:** Sie ("Wie lange fehlt Anna?").

## 6. Entschuldigungen prüfen (Klassenvorstand)

- Liste "Zu prüfen" mit Zeile je Meldung: Name, Zeitraum, Grund, Chip "Gemeldet". Aktionen "Entschuldigen" (Primär) und "Rückfrage" (Sekundär). Wischen nach rechts entschuldigt mit Rückgängig.
- Frist-Job: Erinnerungen als Amber-Chip "Frist in 2 Tagen".

## 7. Supplierung

**Zweck:** Vertretung ohne Telefonkette.
- **Direktion/Administration (Web):** links Liste der Ausfälle (Chip "Vertretung gesucht"), rechts Vorschläge als Karten mit Name, Passung (frei, Fach, Wegstrecke) und "Bestätigen". Danach "Veröffentlichen": Echtzeit-Push an betroffene Klassen.
- **Lehrer (Mobil):** Karte "Du vertrittst heute 3B, 4. Stunde, Raum 12" in Amber weich mit "Annehmen"; die Supplierstunde ist im Klassenbuch vorbelegt.
- **Besonderheit:** Der Stundenplan zeigt die Vertretung als `is-subst`-Kachel.

## 8. Direktions-Lagebild

**Zweck:** das Lagebild des Tages auf einen Blick.
- **Aufbau Web (drei Spalten):** links `KpiTile` "Supplierungen", "Offene Einträge", "Prüfungskollision" (Amber); Mitte "Abwesenheiten heute" mit Zahl `numeral-xl` und Balken je Klasse; rechts "Heute auf einen Blick" (Zeilen je Stunde mit Status).
- **Mobil:** Kennzahlen als Stapel, jede Kennzahl führt in die gefilterte Liste.
- **Besonderheit:** Das Dashboard hat genau eine große Zahl (`pf-kpi--big`); alles andere ist klein und ruhig. Keine Diagramme ohne Zahl.
- **Datenschutz:** Zahlen statt Namen; Namen erst nach Klick.

## 9. Prüfungskalender

- Monatsraster (Web) bzw. Wochenliste (Mobil). Prüfungen als Kacheln in Fächerfarbe. Kollision (zwei Schularbeiten am selben Tag in einer Klasse) als Amber-Kachel mit Wort "Kollision" und Hinweis, wer entscheidet.
- Neue Prüfung: Sheet mit Klasse, Fach, Datum, Art; Kollisionsprüfung live unter dem Datum.

## 10. Nachrichten und Rundschreiben

- Zwei Bereiche: Chats (Eltern-Lehrer, Klasse) und Rundschreiben (Direktion an Klassen). Rundschreiben: Titel, Text, Zielgruppe als Chips (Klassen, Rollen), Vorschau "So sehen es Eltern", Primär "Senden" mit Bestätigungs-Sheet (nicht rückgängig).
- Gelesen-Status als Zahl ("28 von 31 gelesen"), nicht als Namensliste.

## 11. Administration: Einrichtung und Import

- **Übersicht:** Checkliste "Schule einrichten" (Schuljahr und Ferien, Klassen/Fächer/Räume, Personen per CSV, Rechte und Einladungen) mit Fortschritt als Kachel-Leiste: erledigt Kobalt, offen `bg-sunken`.
- **CSV-Import:** große Ablagefläche, Spaltenzuordnung als Tabelle, Vorschau mit Fehlern zeilenweise (Chip `danger`), Primär "Importieren". Ergebnis: Toast und Bericht.
- **Rechte und Einladungen:** Tabelle (Web) mit Rolle als Chip, Einladung erneut senden, Zugang sperren (Sheet mit Bestätigung).

## 12. Fehler- und Sonderseiten

- **404 / Kein Zugriff:** Nachtfläche, Raster-Motiv mit einer leeren Kachel, ein Satz ("Diese Seite gibt es nicht."), Primär "Zur Startseite".
- **Wartung:** Nachtfläche, Raster, Text "Wir sind gleich wieder da", `mono`-Zeitangabe.
- **Offline beim ersten Start:** Hinweis, dass die App einmal online geöffnet werden muss.

---

# Umsetzung mit Claude Code

Arbeitsanweisung für die Umsetzung dieses Design Systems in der bestehenden PROfessor-Codebasis (Monorepo mit pnpm und Turborepo, Next.js, React, Tailwind, shadcn/ui, TanStack Query, Dexie). Sie ist als eigener Abschnitt **M6.5 "Design System"** zwischen M6 (Pilotreife) und M7 gedacht. Sie ersetzt keine Fachlogik: Es ändert sich nur, wie die App aussieht und sich anfühlt.

## 0. Grundregeln

1. **Erst lesen, dann ändern.** Vor jeder Änderung die vorhandenen UI-Pakete, Tailwind-Konfiguration, Layouts und Komponenten durchsehen und die Aufgaben unten an die tatsächliche Struktur anpassen. Pfade in diesem Dokument sind Vorschläge.
2. **Tokens sind die einzige Quelle.** `tokens.json` ist die Wahrheit, `tokens.css` wird daraus erzeugt und ins UI-Paket kopiert. Keine Hex-Werte, keine px-Rohwerte für Abstände, Radien, Farben in App-Code.
3. **Verhalten bleibt gleich.** Keine Änderung an API, Datenmodell, Rechten, Offline-Logik. Bestehende Tests bleiben grün.
4. **Schrittweise und lauffähig.** Nach jeder Phase baut die App, Tests laufen, ein Commit pro Phase.
5. **Mobile first.** Jede Komponente zuerst bei 390px Breite bauen und prüfen.
6. **Nicht erfinden.** Fehlt ein Token oder eine Komponente, melde es und schlage die Ergänzung im Design System vor.

## 1. Phasen und Abnahme

| Phase | Inhalt | Abnahme |
| --- | --- | --- |
| **D0 Bestand** | UI-Struktur lesen, Liste aller Komponenten und Seiten, Abweichungen zum System notieren (`docs/design-audit.md`) | Audit-Datei liegt vor, keine Codeänderung |
| **D1 Fundament** | Tokens, Schriften, Theme-Mechanik, Tailwind-Anbindung, Logo-Assets, PWA-Icons | Seite zeigt neue Schriften und Farben, Hell/Dunkel/System funktioniert ohne Aufblitzen |
| **D2 Bausteine** | `Button`, `Chip`, `Card`, `Field`, `KpiTile`, `Toast`/`Banner`, `Sheet`, `EmptyState`, `Skeleton` im UI-Paket | Jede Komponente hat eine Storybook-Seite oder Showcase-Route mit allen Zuständen in Hell und Dunkel |
| **D3 Shell** | Web-Sidebar und Topbar, mobile Tab-Leiste mit Hauptaktion, rollenabhängige Navigation | Alle sechs Rollen sehen die richtige Navigation, Tab-Leiste mobil, Sidebar ab 1024px |
| **D4 Fachkomponenten** | `Stundenplan`-Raster, `Klassenbuch`-Zeile, Heute-Karte | Klassenbuch in unter 10 Sekunden bedienbar (Playwright-Zeitmessung ≤ 10 s mit 4 Taps) |
| **D5 Seiten** | Anmeldung, Heute, Klassenbuch, Stundenplan, Abwesenheit, Supplierung, Lagebild, Admin-Einrichtung nach `screens` | Jede Seite entspricht der Spezifikation, Screenshots hell/dunkel × 390px/1280px |
| **D6 Härtung** | Barrierefreiheit, Reduced Motion, Kontrast-Check, Lighthouse PWA, Aufräumen alter Styles | Alle Prüfungen aus Abschnitt 7 grün |

## 2. D1 Fundament

### Dateien

```
packages/ui/
  src/styles/tokens.css        # aus dem Design System (generiert aus tokens.json)
  src/styles/theme.css         # Tailwind-Anbindung + shadcn-Zuordnung (unten)
  src/styles/base.css          # Reset, Fokusring, Reduced Motion
  src/components/…             # Komponenten (Abschnitt 4)
  assets/logo/                 # symbol-*.svg, wordmark-*.svg, app-icon-1024.svg
apps/web/
  src/app/layout.tsx           # Schriften, Theme-Skript
  public/icons/…               # PWA-Icons
scripts/
  gen-theme.mjs                # erzeugt theme.css-Teile aus tokens.json
```

### Schriften (selbst hosten mit `next/font`)

```tsx
// apps/web/src/app/layout.tsx
import { Bricolage_Grotesque, DM_Sans, JetBrains_Mono } from "next/font/google";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-bricolage", display: "swap" });
const text = DM_Sans({ subsets: ["latin"], variable: "--font-dmsans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-jetbrains", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de-AT" suppressHydrationWarning className={`${display.variable} ${text.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="bg-bg text-ink font-body antialiased">{children}</body>
    </html>
  );
}
```

`next/font` lädt die Schriften beim Build und liefert sie von der eigenen Domain aus (keine Anfrage an Google zur Laufzeit). Danach in `base.css` die Familien an die Variablen binden:

```css
:root {
  --font-display: var(--font-bricolage), "Bricolage Grotesque", system-ui, sans-serif;
  --font-text:    var(--font-dmsans), "DM Sans", system-ui, sans-serif;
  --font-mono:    var(--font-jetbrains), "JetBrains Mono", ui-monospace, monospace;
}
```

Fehlen Umlaut-Glyphen oder die Schnitte, prüfe `subsets`; Bricolage braucht `latin` (enthält ä, ö, ü, ß).

### Theme-Mechanik

```ts
// Läuft vor dem ersten Rendern, setzt data-theme ohne Aufblitzen
export const THEME_INIT = `(function(){try{var s=localStorage.getItem("pf-theme")||"system";
var d=s==="dark"||(s==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.setAttribute("data-theme",d?"dark":"light");
var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?"#0E192D":"#F6F5F1");}catch(e){}})();`;
```

Der Theme-Umschalter (in "Mehr") schreibt `pf-theme` (`system`, `light`, `dark`), setzt `data-theme` und reagiert bei "system" auf `prefers-color-scheme`-Änderungen.

### Tailwind-Anbindung (v4; bei v3 dieselbe Zuordnung in `tailwind.config`)

```css
/* packages/ui/src/styles/theme.css */
@import "tailwindcss";
@import "./tokens.css";
@import "./base.css";

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

/* Farben: jedes Farb-Token wird zu einer Utility (bg-bg, text-ink, bg-brand, bg-signal …).
   Erzeugt von scripts/gen-theme.mjs aus tokens.json; Muster: --color-<name>: var(--<name>); */
@theme inline {
  --color-bg: var(--bg);
  --color-bg-raised: var(--bg-raised);
  --color-bg-sunken: var(--bg-sunken);
  --color-bg-night: var(--bg-night);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-ink-subtle: var(--ink-subtle);
  --color-ink-on-night: var(--ink-on-night);
  --color-line: var(--line);
  --color-line-strong: var(--line-strong);
  --color-brand: var(--brand);
  --color-on-brand: var(--on-brand);
  --color-brand-soft: var(--brand-soft);
  --color-brand-text: var(--brand-text);
  --color-signal: var(--signal);
  --color-on-signal: var(--on-signal);
  --color-signal-soft: var(--signal-soft);
  --color-signal-ink: var(--signal-ink);
  --color-danger: var(--danger);
  --color-danger-soft: var(--danger-soft);
  --color-danger-ink: var(--danger-ink);
  --color-neutral-soft: var(--neutral-soft);
  /* … alle weiteren Farb-Tokens, inkl. fach-* und on-fach, per Skript */

  --font-heading: var(--font-display);
  --font-body: var(--font-text);
  --font-sans: var(--font-text);
  --font-data: var(--font-mono);
}
```

Radien und Schatten stammen aus denselben Tokens. Weil die Token-Namen (`--radius-md`, `--shadow-card`) mit Tailwinds Namensräumen zusammenfallen, schreibt `gen-theme.mjs` sie als feste Werte in einen normalen `@theme`-Block (`--radius-md: 14px`, `--shadow-card: …`). Damit gibt es `rounded-md`, `rounded-lg`, `shadow-card` und beide Quellen stimmen überein, weil beide aus `tokens.json` entstehen. Prüfe die Syntax gegen die installierte Tailwind-Version und passe an, falls nötig.

Typografie-Klassen (`display-xl`, `h1`, `body`, `label`, `overline`, `mono` …) liefert `tokens.css` bereits als Klassen. Verwende sie in Überschriften und Texten; Tailwind-Textgrößen (`text-lg`) sind in der App nicht erlaubt.

### shadcn/ui zuordnen

shadcn erwartet eigene Variablennamen. Sie werden auf PROfessor-Tokens abgebildet, die Komponenten bleiben unverändert benutzbar. Achtung: shadcn nennt `accent` die Hover-Fläche, PROfessor nennt Amber `signal`, damit nichts kollidiert.

```css
:root, [data-theme] {
  --background: var(--bg);              --foreground: var(--ink);
  --card: var(--bg-raised);             --card-foreground: var(--ink);
  --popover: var(--bg-raised);          --popover-foreground: var(--ink);
  --primary: var(--brand);              --primary-foreground: var(--on-brand);
  --secondary: var(--bg-raised);        --secondary-foreground: var(--ink);
  --muted: var(--bg-sunken);            --muted-foreground: var(--ink-muted);
  --accent: var(--brand-soft);          --accent-foreground: var(--brand-text);
  --destructive: var(--danger);         --border: var(--line);
  --input: var(--line-strong);          --ring: var(--focus);
  --radius: var(--radius-md);
}
```

### Logo und Icons

- Die vier SVGs aus dem System (Assets, Gruppe Logo) nach `packages/ui/assets/logo/` übernehmen.
- Wortmarke: "PROfessor" in Bricolage Grotesque 800 mit `fonttools` oder `opentype.js` zu Pfaden umwandeln (Laufweite -0.04em), als `wordmark-hell.svg` (PRO Kobalt, fessor Nacht), `wordmark-nacht.svg` (PRO Amber, fessor Creme) und `wordmark-einfarbig.svg` ablegen. Bis dahin Live-Text in der Komponente `Logo`.
- PWA-Icons aus `app-icon-1024.svg` per `sharp` erzeugen: 192, 512, Maskable 512 (Symbol innerhalb 80 %), `apple-touch-icon` 180, Favicon 32 (nur Symbol).
- Icons: `lucide-react`, Strichstärke 2, Größe 20 (Buttons, Chips 14) oder 24 (Tabs). Vorhandene andere Icon-Sets ersetzen.

## 3. Komponenten (D2 bis D4)

Pro Komponente: Datei im UI-Paket, `cva`-Varianten gemäß `components/bundle.css`, Showcase mit allen Zuständen, Test. Reihenfolge: Button, Chip, Field, Card, KpiTile, Toast/Banner, Sheet, EmptyState/Skeleton, Navigation (Sidebar, TabBar), Stundenplan, Klassenbuch-Zeile.

| Komponente | Referenzklassen in `bundle.css` | Varianten | Pflicht |
| --- | --- | --- | --- |
| `Button` | `pf-btn`, `--primary`, `--signal`, `--secondary`, `--ghost`, `--danger`, `--lg`, `--sm`, `--block` | `variant`, `size`, `loading`, `iconLeft` | Taster-Kante und 2px-Absenken, 48px Höhe, Fokusring |
| `Chip` | `pf-chip`, `--ok`, `--late`, `--absent`, `--danger`, `--solid`, `--mono` | `tone`, `icon` | Immer Wort plus Icon |
| `Field` | `pf-field`, `pf-input` | `label`, `hint`, `error`, `mono` | `aria-invalid`, `aria-describedby`, 16px |
| `Card` | `pf-card`, `--night`, `--signal`, `--brand`, `--flat`, `--interactive` | `tone`, `interactive` | Nie verschachteln |
| `KpiTile` | `pf-kpi`, `--signal`, `--big` | `tone`, `size`, `href` | Zahl und Wort im selben Element |
| `Toast`, `Banner` | `pf-toast`, `pf-banner` | `action`, `tone` | `role="status"`, 5 s |
| `Sheet` | `pf-sheet`, `pf-scrim` | mobil Sheet, Web Dialog | Fokusfalle, Esc, Wischen |
| `EmptyState`, `Skeleton` | `pf-empty`, `pf-skel` | – | Kachel-Raster, Skeleton ab 1 s |
| `Sidebar`, `TabBar` | `pf-nav`, `pf-tabbar`, `pf-tab` | Rolle bestimmt Einträge | `aria-current`, Safe-Area |
| `TimetableGrid` | `pf-tt` | Fächerfarbe, `conflict`, `subst`, `drag` | Tastaturbedienung, Konflikt mit Wort |
| `AttendanceRow` | `pf-att` | Status | 56px, Tap und langes Drücken |
| `Logo` | `pf-logo` | `onNight`, `symbolOnly` | Schutzraum, Mindestgrößen |

Beispiel `Button` (Muster für alle anderen):

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const button = cva(
  "inline-flex items-center justify-center gap-2 min-h-12 px-5 rounded-md font-body text-base font-bold transition active:translate-y-0.5 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[var(--focus)] disabled:opacity-45 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-brand text-on-brand shadow-key-brand mb-[3px] hover:bg-[var(--brand-hover)] active:shadow-none",
        signal: "bg-signal text-on-signal shadow-key-signal mb-[3px] active:shadow-none",
        secondary: "bg-bg-raised text-ink ring-[1.5px] ring-inset ring-line-strong hover:bg-brand-soft",
        ghost: "bg-transparent text-brand-text hover:bg-brand-soft",
        danger: "bg-danger text-on-danger",
      },
      size: { md: "", lg: "min-h-14 px-6 text-[17px] rounded-lg", sm: "min-h-10 px-4 text-sm" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;
export function Button({ variant, size, className, ...p }: ButtonProps) {
  return <button className={cn(button({ variant, size }), className)} {...p} />;
}
```

`shadow-key-brand` und `shadow-key-signal` kommen aus den Schatten-Tokens (`gen-theme.mjs`). Bei Abweichungen zwischen Tailwind-Utility und `bundle.css` gilt `bundle.css`.

## 4. D3 Shell

- `AppShell` wählt per Breakpoint (`bp-lg`) zwischen `Sidebar` plus `Topbar` und `TabBar` plus Kopfzeile. Kein doppeltes Rendern: per CSS ausblenden, nicht per JS zweimal mounten.
- Die Navigationseinträge je Rolle liegen in **einer** Konfigurationsdatei (`nav.config.ts`) mit Rolle, Icon, Label, Route, Zähler-Quelle und Kennzeichnung `primary` für die Hauptaktion. Sie folgt der Tabelle in `web-und-mobile`. Sichtbarkeit richtet sich nach dem bestehenden Policy-Modul, nicht nach einer neuen Rechtelogik.
- Zähler (offene Einträge, Supplierungen) kommen aus vorhandenen Abfragen (TanStack Query), kein neuer Endpunkt, falls nicht nötig.
- Safe-Area: `padding-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom))` für Inhalt und Tab-Leiste.

## 5. D5 Seiten

Jede Seite aus `screens` einzeln umsetzen, in dieser Reihenfolge (wirkungsvollste zuerst): Anmeldung, Heute, Klassenbuch, Abwesenheit melden, Stundenplan-Ansicht, Lagebild, Supplierung, Stundenplan-Editor, Admin-Einrichtung, Nachrichten, Prüfungen. Pro Seite: bestehende Datenanbindung beibehalten, nur Darstellung ersetzen; Leer-, Lade-, Fehler- und Offline-Zustand mit umsetzen; Texte aus der Spezifikation (Anrede nach Rolle).

Der **Ablauf "Stunde abschließen"** wird mit einem Playwright-Test gemessen: Klassenbuch öffnen, ein Schüler abwesend tippen, Stoff eintragen, abschließen. Erwartung: höchstens vier Taps und unter zehn Sekunden Interaktionszeit im Test.

## 6. Dinge, die nicht passieren dürfen

- Hex-Werte, `rgb()`, `px` für Abstände oder Radien im App-Code. Prüfung per Lint-Skript (Abschnitt 7).
- Tailwind-Standardfarben (`bg-blue-500`, `text-gray-600`) und Standard-Schriftgrößen (`text-lg`).
- Verläufe, Glow, Schlagschatten außer den Tokens, Emoji in der Oberfläche.
- Amber als Textfarbe auf hellem Grund, Kobalt-Text im Dunkeln außer `brand-text`.
- Zwei Primär-Buttons in einer Ansicht, Karte in Karte, Spinner im Vollbild.
- Farbe als einziger Zustandsträger. Fokusring entfernen. Tippflächen unter 44px.
- Wortmarke als "PRO.fessor", "Professor" oder in anderer Schrift.
- Schüler- oder Elternnamen in URLs, Titeln oder Push-Texten.

## 7. Prüfungen (Definition of Done für M6.5)

1. **Build und Tests:** `pnpm build`, `pnpm test`, `pnpm lint` grün, bestehende Playwright-Tests unverändert grün.
2. **Token-Lint:** Skript `scripts/check-tokens.mjs` durchsucht `apps/` und `packages/ui/src` (außer `tokens.css`) nach Hex-Farben, `rgb(`, `px`-Abstände in Tailwind-Arbitrary-Values und Tailwind-Standardfarben; Treffer = Fehler.
3. **Kontrast:** Skript prüft alle Text-Hintergrund-Paare aus den Token-Hinweisen in beiden Themes (Text 4.5:1, Bedienelemente 3:1). Das Ergebnis liegt als Tabelle in `docs/kontrast.md`.
4. **Visuelle Tests:** Playwright-Screenshots für Anmeldung, Heute, Klassenbuch, Stundenplan, Lagebild in Hell und Dunkel bei 390 × 844 und 1280 × 800.
5. **Barrierefreiheit:** `axe` ohne Verstöße (Stufe serious und critical) in diesen Seiten; Tastaturdurchlauf; `prefers-reduced-motion` getestet.
6. **PWA:** Lighthouse "installierbar" bestanden, Offline-Start nach erstem Laden, Icons und Splash korrekt, `theme-color` je Theme.
7. **Leistung:** LCP auf Heute unter 2.0 s im mobilen Lighthouse-Profil, keine Layout-Sprünge durch Schriften (`display: swap` mit passenden Fallback-Metriken).
8. **Aufräumen:** Alte CSS-Klassen, ungenutzte Komponenten und alte Schriften entfernt; `docs/design-audit.md` abgehakt.

## 8. Startprompt für Claude Code

Kopiere diesen Text als erste Nachricht in Claude Code, im Repository von PROfessor, und hänge diese Dokumentation (oder die exportierten Dateien) an.

```
Wir setzen jetzt M6.5 "Design System" um, bevor M7 beginnt. Grundlage ist das PROfessor Design System
(README, ci-handbuch, ui-grundlagen, web-und-mobile, screens, umsetzung-claude-code, tokens.json,
tokens.css, bundle.css, Komponenten-READMEs).

Gehe in Phasen vor (D0 bis D6 aus umsetzung-claude-code). Beginne mit D0: lies die bestehende UI-Struktur,
Tailwind-Konfiguration, Layouts und Komponenten und schreibe docs/design-audit.md mit allen Abweichungen
zum System und deinem Vorschlag, wie die Pfade im Repo aussehen. Ändere in D0 keinen Code. Zeige mir das
Audit und warte auf mein OK, bevor du D1 startest.

Regeln: Tokens sind die einzige Quelle für Farben, Abstände, Radien, Schatten, Schriften. Verhalten, API,
Datenmodell und Offline-Logik bleiben unverändert, bestehende Tests bleiben grün. Mobile first (390px).
Ein Commit pro Phase. Der Produktname ist immer "PROfessor". Wenn etwas im Design System fehlt oder sich
widerspricht, frage nach, statt zu erfinden.
```

---

# Komponenten-Regeln


## Button

Der Button löst jede primäre Handlung aus; Primär ist Kobalt mit Taster-Kante, Amber nur für Aufmerksamkeit.

**Der Aufrufer liefert:** Beschriftung (Verb, max. drei Wörter), optional ein Lucide-Icon links, `disabled` oder `aria-disabled`.

- Pro Ansicht genau ein Primär-Button (`pf-btn--primary`). Der Abschluss-Button im Klassenbuch ist immer Primär.
- `pf-btn--signal` nur, wenn etwas gelöst werden muss (Konflikt, Frist). Nie zwei Amber-Buttons nebeneinander.
- Mindesthöhe `tap-comfort` (48px). `pf-btn--sm` (40px) nur auf Desktop in Tabellen.
- Gedrückt: Taster-Kante entfällt, Button rutscht 2px nach unten. Bei `prefers-reduced-motion` ohne Bewegung.
- Destruktiv: `pf-btn--danger` erst im Bestätigungs-Sheet, nie als erste Aktion einer Liste.
- Beschriftung nie in Großbuchstaben, nie "OK" oder "Submit".

## Chip

Der Chip zeigt einen Zustand in einem Wort; Farbe allein trägt nie die Bedeutung.

**Der Aufrufer liefert:** ein Wort oder eine kurze Angabe plus Icon (check, clock, x, alert).

- Anwesend, Erledigt, Vertretung: `pf-chip--ok` (Kobalt weich). Verspätet, Frist, Hinweis: `pf-chip--late` (Amber weich). Abwesend, Entwurf: `pf-chip--absent`. Fehler: `pf-chip--danger`.
- `pf-chip--solid` (Amber voll) ist für den einen Konflikt, der Aufmerksamkeit verlangt.
- Zeiten und Räume als `pf-chip--mono`.
- Höhe 28px, nicht tippbar. Tippbare Filter-Chips bekommen eine unsichtbare Tippfläche von 44px.

## Card

Die Karte gruppiert zusammengehörige Inhalte; Nachtkarten sind die starken Akzente einer Seite.

**Der Aufrufer liefert:** Titel in `h3`, optional eine Zeile `pf-card__sub`, Inhalt.

- Standard: `pf-card` auf `bg`. Pro Bildschirm höchstens eine `pf-card--night`, sie trägt die wichtigste Information (die aktuelle Stunde).
- `pf-card--signal` für Hinweise mit Handlungsbedarf, `pf-card--brand` für Information.
- Karten nie verschachteln. Statt Karte in Karte Linien `line` oder Abstand `space-4` nutzen.
- Interaktive Karten (`pf-card--interactive`) sind ein einziges `<a>` oder `<button>` mit sichtbarem Fokus.

## Field

Das Eingabefeld ist 52px hoch, hat eine sichtbare Beschriftung darüber und zeigt Fehler mit Icon und Text.

**Der Aufrufer liefert:** `label`, `id`, optional `hint` und `error`. Eingabetyp und `autocomplete` passend setzen.

- Beschriftung immer sichtbar, nie nur Platzhalter.
- Schriftgröße 16px, damit iOS nicht zoomt.
- Fehler: `aria-invalid="true"`, `aria-describedby` auf die Fehlermeldung, Text in `danger-ink` mit Icon. Fehlermeldungen sagen, was zu tun ist ("Der Code muss sechs Ziffern haben"), nicht, was falsch war.
- Codefelder (2FA, Raum) in `mono`.

## KpiTile

Die Kennzahl-Kachel zeigt eine Zahl groß und ihr Wort daneben; so liest die Direktion das Lagebild in einer Sekunde.

**Der Aufrufer liefert:** Zahl (ganzzahlig, tabellarische Ziffern) und ein Substantiv im Plural.

- Standard `pf-kpi` (Kobalt weich). `pf-kpi--signal` nur für Zahlen, die Handlung verlangen (Kollisionen, Fristen).
- Jede Kennzahl ist ein Link in die gefilterte Liste dahinter.
- `pf-kpi--big` (64px) nur einmal pro Dashboard.
- Keine Trendpfeile ohne Vergleichswert, keine Prozentangaben ohne Bezug.

## Stundenplan

Das Stundenplan-Raster zeigt Fächer als bunte Kacheln; Konflikte sind die einzigen Amber-Kacheln.

**Der Aufrufer liefert:** je Zelle Fach, Raum, Fächerfarbe (`is-kobalt`, `is-mint`, `is-himmel`, `is-flieder`, `is-rosa`, `is-limette`, `is-koralle`, `is-sand`) und Zustand (`is-conflict`, `is-subst`).

- Das Fach bestimmt die Farbe (Zuordnung in der Admin-Oberfläche), nie die Stunde. Text immer `on-fach`.
- Konflikt: Amber-Fläche, Nacht-Rand 2.5px, Icon plus Wort "Konflikt". Vertretung: `is-subst` (Amber weich mit Rand).
- Mobil: eine Tagesspalte mit Zeitleiste. Das 5-Tage-Raster erst ab `bp-md`.
- Drag and Drop: Kachel hebt sich (`is-drag`, 3° Neigung), Ziel-Zelle bekommt `brand-soft` bei gültig, `danger-soft` bei hartem Konflikt.
- Mindesthöhe 56px, Lücke `space-2`.

## Klassenbuch

Die Klassenbuch-Zeile macht Anwesenheit zu einem Tap; der Standard ist anwesend.

**Der Aufrufer liefert:** Name, Initial, Status (anwesend, verspätet mit Minuten, abwesend).

- Ein Tap wechselt anwesend → abwesend, langes Drücken öffnet das Sheet für Verspätung mit Minuten.
- Zeilenhöhe mindestens 56px, Abstand `space-2`, Namen in `body-strong` 17px.
- Der Status ist immer Chip mit Wort. Beim Offline-Speichern erscheint ein kleiner Punkt-Hinweis "wartet" statt eines Fehlers.
- "Stunde abschließen" ist ein Primär-Button, unten angeheftet, mit Safe-Area-Abstand.

## Navigation

Die Navigation ist auf Web eine Nacht-Sidebar und auf Mobil eine Tab-Leiste mit erhobener Hauptaktion.

**Der Aufrufer liefert:** je Rolle eine Liste aus Icon, Label, Ziel, optional Zähler.

- Ab `bp-lg` Sidebar (`sidebar-w`), darunter Tab-Leiste (`tabbar-h` plus Safe-Area). Nie beides.
- Maximal fünf Tabs. Der mittlere Tab ist die Hauptaktion der Rolle (Lehrer: Klassenbuch, Eltern: Abwesenheit melden) und wird als Amber-Taste angehoben.
- Aktiver Eintrag: Sidebar Kobalt-Fläche, Tab `brand-soft`-Pille plus `aria-current="page"`.
- Zähler (`pf-nav__count`, Amber) nur für Dinge mit Frist: offene Einträge, Supplierungen.
- Labels in einem Wort, kein Abschneiden mit "…".

## Sheet

Das Sheet führt kurze Aufgaben auf Mobil, ohne die Seite zu verlassen.

**Der Aufrufer liefert:** Titel, Inhalt, genau einen Primär-Button.

- Mobil Bottom-Sheet mit Griff, Radius `radius-xl`, Scrim `overlay`. Auf Web ein zentrierter Dialog mit derselben Füllung.
- Schließen per Wischen, Zurück-Geste, Esc und sichtbarem Schließen-Button. Fokus wird gefangen und zum Auslöser zurückgegeben.
- Höchstens ein Sheet übereinander. Lange Formulare werden eigene Seiten.
- Bestätigung destruktiver Aktionen: Titel als Frage, Primär-Button trägt das Verb ("Eintrag löschen").

## Toast

Der Toast bestätigt eine Aktion kurz und bietet Rückgängig an; der Banner meldet Offline-Zustand dauerhaft.

**Der Aufrufer liefert:** Text, optional eine Aktion.

- Toast: Nachtfläche, 5 Sekunden, Aktion in Amber, immer unterhalb der Kopfzeile bzw. über der Tab-Leiste. `role="status"`.
- Fehler nie nur als Toast, sondern am Ort des Fehlers (Feld oder Zeile).
- Offline: Banner `pf-banner` oben, bleibt bis zur Synchronisation, zeigt die Anzahl wartender Einträge. Nach der Synchronisation ein Toast "Synchronisiert".
- Texte im Perfekt oder als Zustand ("Eintrag gespeichert"), ohne Ausrufezeichen.

## EmptyState

Der Leerzustand erklärt in einem Satz, warum nichts da ist und was als Nächstes geschieht.

**Der Aufrufer liefert:** Titel, ein Satz, optional eine Aktion.

- Grafik ist immer das Kachel-Raster (`pf-empty__tiles`), nie Illustrationen mit Figuren.
- Positive Sprache: "Heute keine Supplierungen" statt "Keine Daten gefunden".
- Beim Laden Skeletons (`pf-skel`) in der Form des Inhalts, nie ein zentrierter Spinner. Ab 1 Sekunde Wartezeit, davor gar nichts zeigen.

## Logo

Das Logo besteht aus dem Raster-P und der Wortmarke PROfessor; die Marke wird nie nachgebaut oder umgefärbt.

**Der Aufrufer liefert:** die Variante je Hintergrund.

- Auf hellen Flächen: Symbol Kobalt mit Amber-Kachel, "PRO" in Kobalt, "fessor" in Nacht. Auf Nacht: Symbol Creme mit Amber-Kachel, "PRO" in Amber, "fessor" in Creme.
- Wortmarke in Bricolage Grotesque 800, Laufweite -0.04em, "PRO" und "fessor" ohne Punkt und ohne Leerzeichen.
- Schutzraum: eine Kachelbreite (ein Zehntel der Symbolhöhe) rundum. Mindesthöhe Symbol 20px, Wortmarke 16px.
- Symbol-SVGs liegen unter Assets (Logo). Das App-Icon ist das Symbol auf Nacht, 1024px, Maskable-Zone 80%.

---

# Token-Übersicht

## Farben

| Token | Hell | Dunkel | Verwendung |
| --- | --- | --- | --- |
| `nacht` | `#0e192d` | `#0e192d` | Markenfarbe Nacht (Tiefblau). Tiefe Flächen, Text auf hellen Flächen. Nie als Textfarbe auf Kobalt. |
| `kobalt` | `#2e53ea` | `#2e53ea` | Markenfarbe Kobalt. Primäre Aktionen, Auswahl, Zustand OK. Als Fläche mit weißem Text (5.9:1). |
| `amber` | `#f3a423` | `#f3a423` | Markenfarbe Amber. Aufmerksamkeit: Konflikt, Verspätung, Highlights. Nie als Text auf hellen Flächen (1.9:1). |
| `creme` | `#f6f5f1` | `#f6f5f1` | Markenfarbe Creme. Helle Seitenfläche und Text auf Nacht. |
| `bg` | `#f6f5f1` | `#0e192d` | Seitenhintergrund der App. |
| `bg-raised` | `#ffffff` | `#16243e` | Karten, Eingabefelder, Sheets auf bg. |
| `bg-sunken` | `#ece9e1` | `#0a1324` | Vertiefte Flächen: leere Stundenplan-Zellen, Segment-Tracks, Skeletons. |
| `bg-night` | `#0e192d` | `#1b2c4c` | Nachtfläche für Hero-Karten, Sidebar, Toasts. Text darauf: ink-on-night. |
| `bg-night-raised` | `#16243e` | `#26385a` | Karten und aktive Zeilen auf bg-night. |
| `ink` | `#0e192d` | `#f6f5f1` | Haupttext auf bg, bg-raised, bg-sunken, brand-soft, signal-soft. |
| `ink-muted` | `#4b566b` | `#aab5cd` | Sekundärtext auf bg, bg-raised, bg-sunken. |
| `ink-subtle` | `#5f687c` | `#8793ae` | Platzhalter, Hilfetexte, Zeitstempel auf bg-raised und bg (ab 12px). |
| `ink-on-night` | `#f6f5f1` | `#f6f5f1` | Haupttext auf bg-night und bg-night-raised. |
| `ink-on-night-muted` | `#b9c3da` | `#b9c3da` | Sekundärtext auf bg-night und bg-night-raised. |
| `line` | `#ddd9ce` | `#26385a` | Haarlinien und Kartenränder. Dekorativ, trägt keine Bedeutung. |
| `line-strong` | `#7a8296` | `#5f7099` | Ränder von Eingabefeldern, Checkboxen, Segmenten (mind. 3:1 auf bg-raised). |
| `brand` | `#2e53ea` | `#4a68f0` | Primärbutton-Fläche, aktive Navigation, Auswahl. Mit on-brand. Im Dunkel aufgehellt, damit die Fläche 3:1 gegen bg erreicht. |
| `on-brand` | `#ffffff` | `#ffffff` | Text und Icons auf brand (5.9:1 hell, 4.6:1 dunkel). |
| `brand-hover` | `#2243cc` | `#3a58e6` | Hover-Zustand von brand, bleibt mit on-brand über 4.5:1. |
| `brand-soft` | `#e3e9fd` | `#1c2e66` | Weiche Kobalt-Fläche: Chips Anwesend, Kennzahlen, Info-Hinweise. Text: ink oder brand-text. |
| `brand-text` | `#2547d0` | `#8fa6ff` | Links und Text in Kobalt auf bg, bg-raised, brand-soft (6.0:1 und mehr in beiden Themes). |
| `signal` | `#f3a423` | `#f3a423` | Amber-Fläche: Konflikt-Kachel, Aufmerksamkeits-Button, Highlights. Mit on-signal. |
| `on-signal` | `#0e192d` | `#0e192d` | Text und Icons auf signal (8.5:1). |
| `signal-soft` | `#fcf0d7` | `#3a2c12` | Weiche Amber-Fläche: Chip Verspätet, Hinweis-Banner, Kennzahl Prüfungskollision. |
| `signal-ink` | `#8a5200` | `#f3a423` | Amber-Text auf signal-soft (5.6:1 hell, 6.5:1 dunkel). Auf anderen Flächen nicht verwenden. |
| `danger` | `#d63a4a` | `#ff7a6b` | Fehler und destruktive Aktionen (Fläche). Mit on-danger. |
| `on-danger` | `#ffffff` | `#0e192d` | Text auf danger (4.6:1 hell, 6.9:1 dunkel). |
| `danger-soft` | `#fce4e6` | `#44202a` | Weiche Fehlerfläche: Formularfehler, Fehlerbanner. |
| `danger-ink` | `#b3202f` | `#ff9aa2` | Fehlertext auf danger-soft (5.5:1 hell, 7.0:1 dunkel). Immer mit Icon und Wort. |
| `neutral-soft` | `#e8e8e4` | `#223352` | Chip Abwesend, Entwurf, inaktiv. Text: ink-muted oder ink. |
| `focus` | `#2e53ea` | `#f3a423` | Fokusring, 3px solid, 3px Abstand. 5.4:1 auf bg (hell), 8.5:1 auf bg (dunkel). Auf bg-night (Sidebar, Toast) im hellen Theme stattdessen signal. |
| `overlay` | `#0e192d99` | `#050a14b3` | Scrim hinter Sheets und Dialogen. |
| `on-fach` | `#0e192d` | `#0e192d` | Text auf allen Fächerfarben (mind. 6.9:1). |
| `fach-kobalt` | `#8fa6ff` | `#8fa6ff` | Fächerfarbe Kobalt hell: Mathematik. |
| `fach-mint` | `#2ec4a0` | `#2ec4a0` | Fächerfarbe Mint: Biologie, Naturkunde. |
| `fach-himmel` | `#5cc8f5` | `#5cc8f5` | Fächerfarbe Himmel: Physik, Chemie. |
| `fach-flieder` | `#b79cff` | `#b79cff` | Fächerfarbe Flieder: Musik, Kunst. |
| `fach-rosa` | `#ff8fb8` | `#ff8fb8` | Fächerfarbe Rosa: Sprachen (Englisch, Französisch). |
| `fach-limette` | `#c6e04a` | `#c6e04a` | Fächerfarbe Limette: Sport, Bewegung. |
| `fach-koralle` | `#ff7a6b` | `#ff7a6b` | Fächerfarbe Koralle: Deutsch. |
| `fach-sand` | `#e6d3a3` | `#e6d3a3` | Fächerfarbe Sand: Geografie, Geschichte, sonstige Fächer. |

## Abstände und Maße

| Token | Wert | Verwendung |
| --- | --- | --- |
| `space-1` | `4px` | Mikro-Abstand, Icon zu Text. |
| `space-2` | `8px` | Enger Abstand in Chips, Kachel-Lücke (Stundenplan). |
| `space-3` | `12px` | Innenabstand kleiner Elemente, Zeilenlücke. |
| `space-4` | `16px` | Standard-Gutter mobil, Kartenpadding mobil. |
| `space-5` | `20px` | Kartenpadding Web. |
| `space-6` | `24px` | Abstand zwischen Karten, Gutter Web. |
| `space-8` | `32px` | Abschnittsabstand. |
| `space-10` | `40px` | Großer Abschnittsabstand. |
| `space-12` | `48px` | Seitenkopf zu Inhalt. |
| `space-16` | `64px` | Hero-Abstände. |
| `tap-min` | `44px` | Mindestgröße jedes tippbaren Ziels. |
| `tap-comfort` | `48px` | Standardhöhe von Buttons und Eingabefeldern, Zeilen im Klassenbuch ab 56px. |
| `topbar-h` | `64px` | Höhe der Web-Topbar und der mobilen Kopfzeile. |
| `tabbar-h` | `68px` | Höhe der mobilen Tab-Leiste ohne Safe-Area. |
| `sidebar-w` | `264px` | Breite der Web-Sidebar ab 1024px. |
| `content-max` | `1200px` | Maximale Inhaltsbreite Web. |

## Radien

| Token | Wert | Verwendung |
| --- | --- | --- |
| `radius-xs` | `6px` | Kleine Marker, Tabellen-Badges. |
| `radius-sm` | `10px` | Chips mit Text, kleine Eingaben. |
| `radius-md` | `14px` | Buttons, Eingabefelder, Stundenplan-Kacheln. |
| `radius-lg` | `20px` | Karten. |
| `radius-xl` | `28px` | Sheets, Telefonrahmen, große Hero-Karten. |
| `radius-pill` | `999px` | Chips, Segmente, Toggles. |

## Ebenen

| Token | Wert | Verwendung |
| --- | --- | --- |
| `z-nav` | `40` | Sidebar, Topbar, Tab-Leiste. |
| `z-sheet` | `60` | Sheets, Dialoge samt Scrim. |
| `z-toast` | `80` | Toasts und Offline-Banner. |

## Breakpoints

| Token | Wert | Verwendung |
| --- | --- | --- |
| `bp-sm` | `640px` | Ab hier zweispaltige Karten. |
| `bp-md` | `768px` | Tablet: Tab-Leiste bleibt, Inhalt zweispaltig. |
| `bp-lg` | `1024px` | Ab hier Sidebar statt Tab-Leiste. |
| `bp-xl` | `1280px` | Dashboards mit drei Spalten. |

## Schatten

| Token | Hell | Dunkel | Verwendung |
| --- | --- | --- | --- |
| `shadow-card` | `0 1px 2px #0e192d0f, 0 12px 28px -14px #0e192d33` | `0 0 0 1px #ffffff0f` | Standard-Karte in Ruhe. |
| `shadow-pop` | `0 24px 48px -16px #0e192d4d` | `0 24px 48px -16px #000000b3` | Sheets, Menüs, Dialoge. |
| `shadow-key-brand` | `0 3px 0 #1a33a6` | `0 3px 0 #1a33a6` | Taster-Kante unter dem Primärbutton. Beim Drücken entfällt sie (translateY 2px). |
| `shadow-key-signal` | `0 3px 0 #b8741a` | `0 3px 0 #b8741a` | Taster-Kante unter dem Amber-Button. |

## Typografie

Familien: `--font-display` Bricolage Grotesque, `--font-text` DM Sans, `--font-mono` JetBrains Mono.

| Stil | Größe / Zeile | Gewicht | Laufweite | Verwendung |
| --- | --- | --- | --- | --- |
| `display-xl` | 72px / 72px | 800 | -0.04em | Hero, Login-Claim, Marketing. Nur Web ab 1024px; mobil display-lg. |
| `display-lg` | 48px / 50px | 800 | -0.035em | Begrüßung Dashboard, mobiler Hero. |
| `h1` | 36px / 40px | 700 | -0.03em | Seitentitel. Mobil 28px/32px. |
| `h2` | 26px / 32px | 700 | -0.02em | Abschnittstitel. Mobil 22px/28px. |
| `h3` | 20px / 26px | 700 | -0.015em | Kartentitel, Sheet-Titel. |
| `numeral-xl` | 64px / 64px | 800 | -0.04em | Kennzahl im Direktions-Dashboard. Immer mit tabellarischen Ziffern. |
| `numeral-lg` | 40px / 44px | 800 | -0.035em | Kennzahlen mobil, Preise. |
| `body-lg` | 18px / 28px | 400 | 0 | Einleitungen, Hero-Fließtext. |
| `body` | 16px / 24px | 400 | 0 | Standardtext. Eingabefelder immer mindestens 16px (verhindert iOS-Zoom). |
| `body-strong` | 16px / 24px | 600 | 0 | Namen in Listen, Button-Text. |
| `body-sm` | 14px / 20px | 400 | 0 | Hilfetexte, Tabellen, Meta-Zeilen. |
| `label` | 14px / 20px | 600 | 0 | Feldbeschriftungen, Tabs, Menüpunkte. |
| `caption` | 12px / 16px | 500 | 0 | Chips, Zeitstempel. Nie kleiner. |
| `overline` | 12px / 16px | 700 | 0.12em | Abschnittsmarke in Großbuchstaben (DAS PROBLEM, ROLLEN), Farbe brand-text oder signal-ink. |
| `mono` | 14px / 20px | 500 | 0 | Uhrzeiten (08:00), Räume, Codes, Domains. |
| `mono-sm` | 12px / 16px | 500 | 0 | Stundenraster-Beschriftung, Audit-Log. |
