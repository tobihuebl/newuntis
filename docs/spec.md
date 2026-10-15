# Spezifikation: PROfessor, Schulplattform (für Claude Code)

Oct 11, 2026 · @Tobi

Diese Spezifikation beschreibt Produkt, Design, Datenmodell, API und Umsetzungsplan einer modernen Schulplattform als WebUntis-Alternative. Sie ist so aufgebaut, dass Claude Code das MVP Schritt für Schritt daraus bauen kann.

## 1. Produktüberblick

**Ziel:** Eine Schulplattform für Österreich, die Stundenplan, Klassenbuch, Abwesenheiten, Supplierung und Kommunikation in einer schnellen, modernen Oberfläche vereint. Jede Rolle (Schüler, Eltern, Lehrer, Klassenvorstand, Direktion, Administration) hat ein eigenes Dashboard auf denselben Daten.

**Grundentscheidung:** Es gibt keine Abhängigkeit von Untis. Der Stundenplan wird in der Plattform selbst erstellt und gepflegt. Ein Untis-Import ist ein späteres Zusatzfeature.

**MVP-Umfang (Meilensteine M0 bis M6):**

- Mandantenfähige Plattform (eine Schule = ein Mandant), Login mit Rollen
- Stammdaten: Schuljahr, Klassen, Gruppen, Fächer, Räume, Personen, Eltern-Kind-Verknüpfung
- Stundenplan-Editor mit Konfliktprüfung und Veröffentlichung
- Heute-Ansicht und Stundenplan für alle Rollen, Kalender-Sync (iCal)
- Klassenbuch (Anwesenheit, Stoff, Hausübung) in unter 10 Sekunden
- Abwesenheit melden und entschuldigen (Eltern), prüfen (Klassenvorstand)
- Supplierung und Entfall mit Push-Benachrichtigung
- Nachrichten und Rundschreiben mit Lesebestätigung
- Direktions-Lagebild "Heute" und einfache Auswertungen
- PWA mit Web-Push und Offline-Modus für das Klassenbuch

**Nicht-Ziele im MVP:** automatische Stundenplan-Optimierung, Zeugnisse, Anbindung an Sokrates, Untis-Import, native App-Store-Apps, Zahlungsabwicklung, Lernplattform-Funktionen (Aufgaben abgeben, Videounterricht).

**Annahmen (bitte prüfen):**

- Zielgruppe zu Beginn: kleinere Mittelschulen und AHS mit überschaubarem Stundenplan
- Sprache Deutsch (Österreich), Zeitzone Europe/Vienna, später mehrsprachig
- Noten nach österreichischem System 1 bis 5 (Volksschule später verbal)
- Hosting ausschließlich in der EU, keine US-Dienste für Schüler- und Elterndaten
- Rechtliche Vorgaben zu Klassenbuch, Entschuldigungsfristen und Datenschutz werden vor dem Pilotstart juristisch geprüft und sind pro Schule konfigurierbar

## 2. Namensideen

**Entschieden (Okt. 2026): PROfessor** (Domain `pro.fessor.app`, siehe Design System). Die folgende Liste bleibt als Verlauf.

Verfügbarkeit von Domain und Marke ist nicht geprüft. Vor der Entscheidung Domain (.at und .com), Markenregister (Österreichisches Patentamt, EUIPO) und App-Stores durchsuchen. Empfehlung: **Stundo** oder **Klassl**, weil beide kurz, merkbar und gut aussprechbar sind.

| Name | Idee | Stolperstein |
| --- | --- | --- |
| Stundo | Stunde mit modernem Suffix, passt zum Fokus Stundenplan und "Heute" | Klingt eher nach Tool als nach Schule |
| Klassl | Österreichisch-verniedlichend für "Klasse", sympathisch und regional | Weniger passend für Deutschland, wirkt informell für Direktionen |
| Pult | Lehrerpult, kurz und prägnant | Sehr generisch, schwer zu finden |
| Kreide | Schultafel, warm und wiedererkennbar | Wirkt analog statt modern |
| Glocke | Schulglocke als Taktgeber des Tages | Wenig Bezug zu Digitalem |
| Schulwerk | Seriös, gut für Schulerhalter und Behörden | Wirkt konservativ, Name evtl. belegt |
| Klarplan | "Klar" und "Plan", betont Einfachheit | Sehr nah an bestehenden Planer-Namen |
| Takt | Stundentakt, kurz und modern | Generisch, viele Treffer |
| Pausenhof | Verspielt, merkbar, passt zu Kommunikation | Weniger passend für Direktions-Funktionen |
| Lehro | Kurz, erinnert an Lehrer und Lernen | Klingt nach Spielzeug-App |

Im Code und Repository wird der Arbeitstitel `schulplattform` mit Paketpräfix `@sp/` verwendet. Der Produktname ist später ein Austausch von Konstanten und Texten, nicht von Struktur.

## 3. Rollen und Rechte

Rollen sind additiv: Eine Person kann Lehrer und Klassenvorstand sein, oder Lehrer und Elternteil. Rechte ergeben sich aus Rolle **und** Zuordnung (z. B. nur die eigenen Klassen, nur die verknüpften Kinder). Die Matrix ist die Grundlage für das zentrale Policy-Modul und für die Berechtigungstests.

| Berechtigung | Schüler | Eltern | Lehrer | Klassenvorstand | Direktion | Administration |
| --- | --- | --- | --- | --- | --- | --- |
| Eigenen Stundenplan sehen | ja | Kinder | ja | ja | ja | ja |
| Fremde Pläne (Klasse, Lehrer, Raum) sehen | nein | nein | ja | ja | ja | ja |
| Klassenbuch eintragen | nein | nein | eigene Stunden | eigene Stunden | Korrektur | nein |
| Anwesenheit einsehen | eigene | Kinder | eigene Klassen | eigene Klasse | alle | alle |
| Abwesenheit melden | optional | Kinder | nein | nein | nein | ja (für andere) |
| Entschuldigung prüfen und annehmen | nein | nein | nein | eigene Klasse | ja | ja |
| Lehrerabwesenheit melden | nein | nein | sich selbst | sich selbst | ja | ja |
| Prüfungen einsehen | eigene | Kinder | eigene Klassen | eigene Klasse | ja | ja |
| Prüfung eintragen | nein | nein | eigene Fächer | eigene Fächer | ja | nein |
| Noten eintragen | nein | nein | eigene Fächer | eigene Fächer | nein | nein |
| Noten einsehen | eigene | Kinder | eigene Fächer | eigene Klasse | alle (lesen) | alle (lesen) |
| Nachrichten an Klasse oder Eltern senden | nein | an Lehrer | ja | ja | ja | ja |
| Rundschreiben an alle oder Gruppen | nein | nein | nein | nein | ja | ja |
| Einverständniserklärung verschicken | nein | nein | eigene Klassen | eigene Klasse | ja | ja |
| Einverständniserklärung beantworten | nein | Kinder | nein | nein | nein | nein |
| Supplierung planen und veröffentlichen | nein | nein | nein | nein | ja | ja |
| Stundenplan bearbeiten | nein | nein | nein | nein | freigeben | ja |
| Personen, Klassen, Fächer, Räume verwalten | nein | nein | nein | nein | lesen | ja |
| Zugangsbriefe für Schüler:innen ausstellen | nein | nein | nein | eigene Klasse | nein | ja |
| Auswertungen der Schule | nein | nein | nein | Klasse | ja | ja |
| Audit-Log einsehen | nein | nein | nein | nein | ja | ja |
| Rollen vergeben, Datenschutz-Anfragen | nein | nein | nein | nein | nein | ja |

**Regeln für die Umsetzung:**

- Ein zentrales Modul `policy` beantwortet `can(user, action, resource)`. Controller prüfen nie selbst Rollen.
- Jeder Endpunkt deklariert die benötigte Aktion, ein Test erzeugt aus der Matrix automatisch Erlaubt- und Verboten-Fälle.
- Eltern-Rechte gelten nur für verknüpfte Kinder (Tabelle `GuardianLink`), mit Widerruf und Gültigkeitsdauer.
- Altersgrenzen für Schülerrechte (z. B. selbst entschuldigen, Noten sehen) sind pro Schule konfigurierbar.
- Das Rollenmodell ist in `packages/shared/src/permissions.ts` als einzige Quelle definiert und wird von API und Web genutzt.

## 4. Features nach Modul

Priorität: **MVP** = im ersten Release, **V1** = direkt danach, **V2** = später. Die IDs dienen als Referenz in Aufgaben und Commits.

### Konto und Plattform (PL)

- PL-01 MVP: Login mit E-Mail und Passwort, Passwort-Reset, Einladung per Link oder Code; Schüler:innen ohne E-Mail mit Benutzername und persönlichem Zugangscode (Zugangsbrief mit QR-Code vom Klassenvorstand, ADR 0020)
- PL-02 MVP: Zwei-Faktor-Login (TOTP), Pflicht für Lehrer, Direktion und Administration
- PL-03 MVP: Profil, Benachrichtigungseinstellungen, Dark Mode, Sprache
- PL-04 MVP: Eltern mit mehreren Kindern: Umschalten mit einem Tap
- PL-05 V1: Single Sign-on (Microsoft, Google, OIDC der Schule)
- PL-06 V1: Globale Suche (Strg/Cmd+K) nach Personen, Klassen, Räumen — umgesetzt, Treffer nach Rechten der Rolle (ADR 0016)
- PL-07 V1: Datenauskunft und Kontolöschung durch die Person selbst

### Stammdaten (SD)

- SD-01 MVP: Schuljahr, Semester, Ferien und schulfreie Tage — Semester: Beginn des 2. Semesters am Schuljahr oder aus den Semesterferien, Notenfilter und Frühwarnung je Semester (ADR 0022)
- SD-02 MVP: Klassen, Gruppen (z. B. Wahlfach), Fächer, Räume
- SD-03 MVP: Personen per CSV importieren mit Vorschau und Fehlerbericht
- SD-04 MVP: Eltern-Kind-Verknüpfung per Einladungscode
- SD-05 V1: Schuljahreswechsel-Assistent — umgesetzt: Entscheidung je Schüler:in (aufsteigen, wiederholen, Wiederholungsprüfung, verlassen), Folgeklassen und Übernahme durch die Administration (ADR 0019)
- SD-06 V2: Sokrates- und Untis-Import
- SD-07 V1: Lehrkräfte mit Fächern (Lehrbefähigung) und Stundenausmaß (Beschäftigungsausmaß, davon Unterricht); Grundlage für die Auslastung in der Lehrfächerverteilung und für Supplier-Vorschläge — umgesetzt (ADR 0013)

### Stundenplan (SP)

- SP-01 MVP: Unterrichtsraster (Stunden, Pausen, Zeiten) pro Schule
- SP-02 MVP: Editor mit Raster, Drag and Drop, Ansicht je Klasse, Lehrer und Raum
- SP-03 MVP: Harte Konfliktprüfung (Lehrer, Raum, Klasse, Gruppe) in Echtzeit
- SP-04 MVP: Entwurf und Veröffentlichung mit Gültig-ab-Datum, Doppelstunden
- SP-05 MVP: Kalender-Sync per iCal-Link (Apple, Google, Outlook)
- SP-06 V1: Weiche Regeln mit Warnungen (Hohlstunden, Tagesbelastung), Wochenmuster A/B
- SP-07 V1: Raumbuchung außerhalb des Stundenplans
- SP-08 V2: Automatische Planung (Solver mit KI-Unterstützung für Planungswünsche, Meilenstein M7), Untis-Import

### Klassenbuch (KB)

- KB-01 MVP: "Heute"-Liste der eigenen Stunden, Stunde mit einem Tap öffnen
- KB-02 MVP: Anwesenheit per Tap (anwesend als Standard, verspätet mit Minuten, abwesend)
- KB-03 MVP: Stoff und Hausübung erfassen, Stunde abschließen
- KB-04 MVP: Hinweis auf nicht abgeschlossene Klassenbuch-Einträge
- KB-05 MVP: Offline-Erfassung mit späterer Synchronisation
- KB-06 MVP: Supplierstunde mit vorausgefüllter Klasse, Fach und Raum
- KB-07 V1: Notizen und besondere Vorkommnisse (nur Lehrer und Klassenvorstand) — umgesetzt: Notiz zur Stunde und Vermerke je Schüler:in, sichtbar auch für die Direktion (Korrektur), nicht für die Administration (ADR 0014)
- KB-08 V2: Sitzplan

### Abwesenheit (AB)

- AB-01 MVP: Eltern melden Abwesenheit (Zeitraum, Grund, optional Foto)
- AB-02 MVP: Klassenvorstand nimmt an oder lehnt ab, mit Kommentar
- AB-03 MVP: Erinnerung bei fehlender Entschuldigung, Fristen pro Schule konfigurierbar
- AB-04 MVP: Lehrer-Abwesenheit (Krankmeldung) löst Supplierung aus
- AB-05 V1: Frühwarnung bei Häufung von Fehlzeiten — umgesetzt: Schwellen je Schule, Hinweis an den Klassenvorstand, Karte im Lagebild (ADR 0015)
- AB-06 V1: Freistellungen und Fortbildungen mit Genehmigung durch die Direktion

### Supplierung (SU)

- SU-01 MVP: Betroffene Stunden bei Lehrerausfall automatisch erkennen
- SU-02 MVP: Vorschläge (freie Lehrer, passendes Fach, Fairness-Zähler)
- SU-03 MVP: Aktionen Vertretung, Entfall, Raumwechsel, Betreuung
- SU-04 MVP: Veröffentlichung mit Push an Betroffene
- SU-05 V1: Monitor-Ansicht für Displays im Schulhaus

### Prüfungen und Noten (PN)

- PN-01 MVP: Prüfungskalender mit Kollisionswarnung (Grenzwerte pro Schule)
- PN-02 V1: Notenerfassung 1 bis 5 mit Gewichtung, Notenspiegel — umgesetzt: Gewichtung in Prozent je Notenart, Freigabe durch die Lehrkraft (ADR 0018)
- PN-03 V2: Zeugnisse und verbale Beurteilung

### Kommunikation (KO)

- KO-01 MVP: Nachrichten zwischen Lehrern, Eltern und Schülern innerhalb der erlaubten Rollen
- KO-02 MVP: Rundschreiben mit Lesebestätigung
- KO-03 V1: Vorlagen, Anhänge, Ruhezeiten
- KO-04 V1: Elternsprechtag-Buchung
- KO-05 V1: Digitale Einverständniserklärungen mit Bestätigung — umgesetzt: Lehrkräfte, KV, Direktion und Administration verschicken an Eltern ausgewählter Schüler:innen, Antwort je Kind mit Frist, Erinnerung und Nachtrag auf Papier (ADR 0021)
- KO-06 V2: Übersetzung von Mitteilungen

### Dashboards und Auswertung (DB)

- DB-01 MVP: "Heute" für jede Rolle (Schüler, Eltern, Lehrer)
- DB-02 MVP: Direktions-Lagebild (Fehlende, Entfall, offene Supplierungen)
- DB-03 V1: Auswertungen (Anwesenheit, Supplierstunden, Nachrichten) mit Export als CSV und PDF

### Administration und Datenschutz (AD)

- AD-01 MVP: Rollen und Rechte verwalten, Audit-Log
- AD-02 V1: Datenauskunft und Löschung, Aufbewahrungsfristen
- AD-03 V1: Formulare und Bescheinigungen als PDF
- AD-04 V2: API-Schlüssel und Webhooks, Systemstatus

## 5. Screens und Navigation

Navigation nach dem Design System (`docs/design-system/README.md`, Abschnitt "Web und Mobile"; Entscheidung F2 im Design-Audit): mobil Tab-Leiste mit genau fünf Tabs, der mittlere ist die Hauptaktion der Rolle (erhobene Amber-Taste), rechts "Mehr" (Sheet mit weiteren Seiten, Profil, Rolle wechseln, Darstellung, Abmelden). Ab 1024 px Nacht-Seitenleiste mit Abschnitten ("Stammdaten", "Schule") und Topbar mit Seitensuche (Strg/Cmd+K), Offline-Status, Glocke und Profil-Menü. Einzige Quelle ist `packages/shared/src/navigation.ts`. Wer mehrere Rollen hat, wechselt die Ansicht im Mehr-Sheet (Cookie `pf-role`); erlaubt sind immer die Routen aller Rollen.

| Rolle | Tab-Leiste (mobil, Mitte = Hauptaktion) | Startseite | Seitenleiste (zusätzlich) |
| --- | --- | --- | --- |
| Schüler | Plan, Hausübungen, **Heute**, Chat, Mehr (F5) | `/heute` | Stundenplan, Hausübungen, Nachrichten |
| Eltern | Heute, Plan, **Abwesenheit**, Nachrichten, Mehr | `/heute` | Abwesenheit, Termine |
| Lehrer | Heute, Plan, **Klassenbuch**, Chat, Mehr | `/heute` | Prüfungen; Schule: Klassen, Räume, Krankmeldung |
| Klassenvorstand | wie Lehrer | `/heute` | Meine Klasse; Schule: Auswertung |
| Direktion | Lagebild, Supplierung, **Freigaben**, Nachrichten, Mehr | `/lagebild` | Prüfungskalender, Auswertung, Rundschreiben; Schule: Stundenplan, Klassen, Personen, Räume, Protokoll, Einstellungen (Freigaben sammeln Stundenplan-Entwürfe und gemeldete Entschuldigungen; Stammdaten nur über Links, ADR 0017) |
| Administration | Übersicht, Stundenplan, **Import**, Nachrichten, Mehr | `/admin` | Rechte; Stammdaten: Personen, Klassen, Fächer, Räume, Schuljahr, Raster; Schule: Lagebild, Auswertung, Supplierung, Rundschreiben, Abwesenheit melden, Datenschutz, Protokoll, Einstellungen |

Die Rolle Schul-IT aus dem Design System gibt es im Datenmodell nicht; ihre Punkte (Import, Datenschutz, Protokoll) liegen bei der Administration. `/admin` ist die Übersicht mit der Checkliste "Schule einrichten" (Schuljahr und Ferien, Raster, Klassen/Fächer/Räume, Personen, Rechte und Einladungen, Stundenplan veröffentlicht).

Für alle Rollen zusätzlich `/profil` und `/benachrichtigungen` (Glocke in der Kopfzeile), dazu `/nachrichten/neu`, `/nachrichten/[id]` (Gespräch) und `/nachrichten/rundschreiben/[id]` (Rundschreiben lesen und bestätigen). Nach dem ersten Login führt `/willkommen` durch das Onboarding der Rolle (ADR 0020): Datenschutzhinweis und Benachrichtigungen, dann die Einrichtung der Rolle (Lehrkraft: Fächer, Stunden und Stundenplan bestätigen; Schüler:in: Avatar und Klasse; Eltern: Kinder und Benachrichtigungen; Direktion: Benachrichtigungen), am Ende der Weg zur ersten echten Aktion. Danach zeigt die Startseite die Checkliste "Erste Schritte" mit Coachmarks (`?tour=`), am Computer zusätzlich in der Seitenleiste. "Hilfe und Tour" im Profil wiederholt die Einführung (`/willkommen?wiederholen`). Öffentlich: `/zugang` (Zugangscode einlösen). Klassenvorstand: `/klasse/[id]/zugang` (Zugangsbriefe).

**Klassenseite (ADR 0017):** Es gibt eine Klassenseite `/klassen/[id]` für Lehrkräfte, Klassenvorstand, Direktion und Administration. Oben steht "Heute" (wer ist da, fehlt, gemeldet, verspätet, noch nicht erfasst), darunter die Schülerliste mit dem Stand von heute sowie Fächer und Lehrkräfte. Klassenvorstand, Direktion und Administration sehen die Reiter Übersicht, Entschuldigungen, Fehlzeiten und (KV, Direktion) Vermerke. "Meine Klasse" führt dorthin.

Ergänzungen aus M6 (ADR 0009): Lehrkräfte `/klassen` und `/klassen/[id]` (Schülerliste, Fächer, Nachricht an Eltern), `/raeume` (Belegung je Raum); Klassenvorstand `/auswertung` (eigene Klasse); Direktion `/rundschreiben/neu`, `/rundschreiben/[id]` (Lesestand), `/admin/einstellungen` (lesen); Administration `/admin/einstellungen` (Fristen, Grenzwerte, Aufbewahrung), `/admin/rollen` (Rollenträger:innen und Rechte-Matrix), dazu Lagebild und Auswertung unter "Mehr".

**Schlüssel-Screens (Layout):**

- **Heute (Schüler und Eltern):** Oben die nächste Stunde als große Karte mit Fach, Raum, Lehrer und Uhrzeit. Darunter die restlichen Stunden des Tages als Liste. Entfall und Supplierung sind farbig markiert und stehen oben. Darunter: Hausübungen bis morgen, Prüfungen diese Woche, ungelesene Mitteilungen.
- **Heute (Lehrer):** Liste der eigenen Stunden. Aktuelle Stunde hervorgehoben mit der Schaltfläche "Klassenbuch öffnen". Oben ein Banner mit Aufgaben, z. B. "2 Klassenbucheinträge offen" und "1 Supplierung für dich".
- **Klassenbuch-Stunde:** Kopf mit Klasse, Fach, Datum, Stunde. Darunter die Schülerliste mit großen Tap-Flächen (anwesend ist Standard, ein Tap = abwesend, langer Druck = verspätet). Unten feste Leiste mit Feldern Stoff und Hausübung und der Schaltfläche "Abschließen". Speichern passiert automatisch, mit sichtbarem Status (gespeichert, offline, synchronisiert).
- **Abwesenheit melden (Eltern):** Ein Bildschirm mit Kind, Zeitraum (heute, gestern, Zeitraum), Grund (Auswahl und Freitext), optional Foto. Ein Button "Senden".
- **Lagebild (Direktion):** Karten für Fehlende Lehrer, Entfallende Stunden, Offene Supplierungen, fehlende Klassenbuch-Einträge. Darunter ein Zeitstrahl des Tages mit den betroffenen Stunden. Jede Karte führt per Tap zur Aktion.
- **Stundenplan-Editor (Administration):** Raster mit Tagen als Spalten und Stunden als Zeilen, Ansichtswechsel Klasse, Lehrer, Raum oben. Links eine Leiste mit noch nicht eingeplanten Unterrichtseinheiten. Konflikte werden im Raster rot markiert und in einem Panel erklärt. Oben Rückgängig, Wiederholen, Entwurf speichern, Veröffentlichen.

## 6. Design-System

Verbindlich ist das **PROfessor Design System** in `docs/design-system/` (README mit CI-Handbuch, UI-Grundlagen, Web und Mobile, Screens und Umsetzung; `tokens.json` als einzige Quelle aller Farben, Abstände, Radien, Schatten und Schriftstile; `bundle.css` als Referenz der Komponenten). Umsetzung als Meilenstein M6.5 (Phasen D0 bis D6, ADR 0010, Bestand und Fortschritt in `docs/design-audit.md`).

- **Marke:** PROfessor (PRO groß, fessor klein). Claim „Schulsoftware darf einfach sein.“ Logo Raster-P mit einer Amber-Kachel.
- **Farbe:** Fläche Creme (`bg`) oder Nacht (`bg-night`), Handlung Kobalt (`brand`), Aufmerksamkeit Amber (`signal`, sparsam), Rot (`danger`) nur für Fehler und Zerstörendes. Hell, Dunkel und System gleichwertig.
- **Schrift:** Bricolage Grotesque (Überschriften, Zahlen), DM Sans (Text, Bedienung), JetBrains Mono (Uhrzeiten, Räume, Codes), selbst gehostet über `next/font`.
- **Status:** Anwesend, erledigt, Vertretung `ok` (Kobalt weich); verspätet, Frist, Hinweis, Entfall, Raumwechsel `late` (Amber weich); abwesend, Entwurf `absent` (neutral); Fehler `danger`; ein Konflikt je Ansicht `solid` (Amber). Immer Wort und Icon.
- **Fächerfarben:** acht feste Farben (`fach-*`), Zuordnung je Fach durch die Schule; Amber ist Konflikten vorbehalten.
- **Anrede:** du für Schüler:innen, Lehrkräfte und Klassenvorstände; Sie für Eltern, Direktion und Administration.
- **Technik:** `scripts/gen-theme.mjs` erzeugt `packages/ui/src/styles/tokens.css`, `theme.css` (Tailwind-Anbindung, Schriftstile als `text-h1`, `text-body-sm` …) und `packages/shared/src/design-tokens.ts` (Farben für Manifest, E-Mail, PDF). Komponenten im UI-Paket setzen die `pf-*`-Klassen aus `bundle.css`. Tailwinds Standardfarben und -schriftgrößen sind abgeschaltet; Hex-Werte und px-Rohwerte gehören nicht in den App-Code.
- **Barrierefreiheit:** WCAG 2.2 AA, Tippflächen ab 44 px, Fokusring 3 px (`--focus`, auf Nachtflächen Amber), Bewegung 120 bis 320 ms und abgeschaltet bei `prefers-reduced-motion`.

## 7. Tech-Stack und Projektstruktur

Leitlinie: wenige, bewährte Bausteine, alles typsicher, alles in der EU betreibbar. Claude Code darf bei gleichwertigen Alternativen entscheiden, muss die Entscheidung aber als ADR in `docs/adr/` festhalten.

| Bereich | Wahl | Hinweis |
| --- | --- | --- |
| Monorepo | pnpm Workspaces, Turborepo | Ein Repository, geteilte Pakete |
| Sprache | TypeScript (strict) | Überall, auch Skripte |
| Web | Next.js (App Router), React, Tailwind, shadcn/ui | PWA mit Service Worker und Web-Push |
| Client-Daten | TanStack Query, React Hook Form, Zod | Schemas kommen aus `packages/shared` |
| Offline | IndexedDB (Dexie), Outbox-Queue | Nur Klassenbuch und Heute-Ansicht |
| API | NestJS mit Fastify, REST, OpenAPI | Validierung mit Zod, Client-Typen generiert |
| Datenbank | PostgreSQL 16, Prisma | Row-Level-Security pro Mandant |
| Jobs | pg-boss (Queue in Postgres) | Kein zusätzlicher Redis-Dienst nötig |
| Echtzeit | Server-Sent Events | Push-Ereignisse an offene Clients |
| Push | Web-Push (VAPID) | Native Push später über Capacitor-Wrapper |
| Auth | Session-Cookies (httpOnly), Argon2id, TOTP | OIDC-SSO in V1 |
| E-Mail | SMTP eines EU-Anbieters, React-Email-Vorlagen | Einladungen, Resets, Digest |
| Dateien | S3-kompatibler EU-Speicher, signierte URLs | Virenscan bei Uploads |
| PDF | Playwright oder react-pdf | Formulare, Berichte |
| Kalender | iCal-Feeds mit Token pro Person | Read-only |
| Tests | Vitest, Playwright, Testcontainers | Siehe Abschnitt 13 |
| CI/CD | GitHub Actions, Docker | Deploy auf EU-Server (z. B. Hetzner) |
| Beobachtbarkeit | pino-Logs, OpenTelemetry, Fehler-Tracking mit EU-Hosting | Keine personenbezogenen Daten in Logs |
| Sprache der App | next-intl, Standard `de-AT` | Alle Texte in Übersetzungsdateien |

**Repository-Struktur:**

```text
schulplattform/
├─ apps/
│  ├─ web/                  Next.js PWA (alle Rollen-Oberflächen)
│  └─ api/                  NestJS API
│     └─ src/modules/       auth, tenants, people, classes, timetable,
│                           occurrences, classbook, attendance, absence,
│                           substitution, exams, messages, notifications,
│                           audit, files, reports
├─ packages/
│  ├─ db/                   Prisma-Schema, Migrationen, Seed-Daten
│  ├─ shared/               Zod-Schemas, Typen, permissions.ts, Konstanten
│  ├─ ui/                   Design-System (Komponenten, Tokens)
│  └─ config/               ESLint, tsconfig, Tailwind-Preset
├─ infra/                   docker-compose.yml, Dockerfiles, Caddyfile, Deploy
├─ docs/                    Spezifikation, ADRs
├─ CLAUDE.md                Arbeitsanweisungen für Claude Code
├─ turbo.json
└─ pnpm-workspace.yaml
```

**Umgebungsvariablen** (`.env.example` mitliefern): `DATABASE_URL`, `SESSION_SECRET`, `APP_URL`, `API_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SMTP_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `DEFAULT_TIMEZONE=Europe/Vienna`. Geheimnisse werden nie eingecheckt.

**Lokale Entwicklung:** `docker compose up` startet Postgres, Mailpit (Test-Mailserver) und MinIO (S3). `pnpm dev` startet Web und API. `pnpm db:seed` legt eine Demoschule mit Klassen, Lehrern, Schülern, Eltern und einem Stundenplan an.

## 8. Datenmodell

**Grundregeln:** Jede Tabelle außer `Tenant` hat `tenantId`, `createdAt`, `updatedAt`. Zeitpunkte liegen als UTC (`timestamptz`), Kalendertage als `@db.Date`, Unterrichtszeiten als lokale Zeit im Raster (Zeitzone Europe/Vienna). Löschen von Personen ist ein Anonymisieren, kein hartes Löschen, damit Klassenbuch-Einträge gültig bleiben. Das Schema ist die verbindliche Feldliste. Einzeilig notierte Modelle sind Kurzschreibweise: In der echten \`schema.prisma\` steht jedes Feld in einer eigenen Zeile, und \`createdAt\` und \`updatedAt\` kommen überall dazu. Claude Code ergänzt die Gegenrelationen und Indizes `@@index([tenantId, …])`.

```prisma
enum Role { STUDENT GUARDIAN TEACHER HOMEROOM PRINCIPAL ADMIN }
enum PersonKind { STUDENT TEACHER GUARDIAN STAFF }
enum WeekPattern { EVERY A B }
enum TimetableStatus { DRAFT PUBLISHED ARCHIVED }
enum OccurrenceStatus { SCHEDULED CANCELLED SUBSTITUTED ROOM_CHANGED }
enum AttendanceStatus { PRESENT LATE ABSENT }
enum AbsenceStatus { OPEN REPORTED EXCUSED REJECTED UNEXCUSED } // OPEN: aus dem Klassenbuch, Entschuldigung ausständig (M5, ADR 0008)
enum TeacherAbsenceKind { SICK TRAINING LEAVE OTHER }
enum SubstitutionKind { SUBSTITUTE CANCEL ROOM_CHANGE SUPERVISION }
enum SubstitutionStatus { OPEN ASSIGNED PUBLISHED }

model Tenant {
  id String @id @default(cuid())
  name String
  slug String @unique
  timezone String @default("Europe/Vienna")
  settings Json @default("{}") // Fristen, Grenzwerte, Altersgrenzen
  createdAt DateTime @default(now())
}

model Person {
  id String @id @default(cuid())
  tenantId String
  kind PersonKind
  firstName String
  lastName String
  birthDate DateTime? @db.Date
  externalId String? // z. B. Schülernummer aus CSV
  anonymizedAt DateTime?
  restrictedAt DateTime? // Einschränkung der Verarbeitung (M6): keine Nachrichten, Rundschreiben, Benachrichtigungen
  employmentHours Float? // Lehrkräfte: Beschäftigungsausmaß in Wochenstunden (SD-07)
  teachingHours Float? // Lehrkräfte: davon Unterricht, Soll je Woche (SD-07)
  user User?
  roles RoleAssignment[]
  teacherSubjects TeacherSubject[] // Fächer mit Lehrbefähigung (SD-07)
}

model User {
  id String @id @default(cuid())
  tenantId String
  personId String @unique
  email String
  passwordHash String?
  totpSecret String? // verschlüsselt gespeichert
  totpEnabled Boolean @default(false)
  lastLoginAt DateTime?
  onboardedAt DateTime? // Einführung nach dem ersten Login abgeschlossen (M6)
  @@unique([tenantId, email])
}

model RoleAssignment {
  id String @id @default(cuid())
  tenantId String
  personId String
  role Role
  classId String? // nur bei HOMEROOM (Klassenvorstand)
}

model GuardianLink {
  id String @id @default(cuid())
  tenantId String
  guardianId String // Person
  studentId String // Person
  canExcuse Boolean @default(true)
  validFrom DateTime @db.Date
  validTo DateTime? @db.Date
}

model SchoolYear {
  id String @id @default(cuid())
  tenantId String
  name String // "2026/27"
  startsOn DateTime @db.Date
  endsOn DateTime @db.Date
  isCurrent Boolean @default(false)
}

model SchoolFreeDay {
  id String @id @default(cuid())
  tenantId String
  schoolYearId String
  fromDate DateTime @db.Date
  toDate DateTime @db.Date
  label String // Ferien, Feiertag, schulautonom frei
}

model SchoolClass {
  id String @id @default(cuid())
  tenantId String
  schoolYearId String
  name String // "3A"
  homeroomTeacherId String? // Person
  @@unique([tenantId, schoolYearId, name])
}

model Enrollment {
  id String @id @default(cuid())
  tenantId String
  studentId String
  classId String
  fromDate DateTime @db.Date
  toDate DateTime? @db.Date
}

model Group { // Wahlfach, Teilungsgruppe, Förderkurs
  id String @id @default(cuid())
  tenantId String
  schoolYearId String
  name String
  members GroupMember[]
}
model GroupMember { id String @id @default(cuid()) tenantId String groupId String studentId String }

model Subject { id String @id @default(cuid()) tenantId String name String code String color String? }
model Room { id String @id @default(cuid()) tenantId String name String capacity Int? kind String? }

model Period { // Unterrichtsraster
  id String @id @default(cuid())
  tenantId String
  number Int
  startTime String // "08:00" lokal
  endTime String // "08:50"
  @@unique([tenantId, number])
}

model TimetableVersion {
  id String @id @default(cuid())
  tenantId String
  schoolYearId String
  status TimetableStatus @default(DRAFT)
  validFrom DateTime @db.Date
  publishedAt DateTime?
  publishedById String?
  lessons Lesson[]
}

model Lesson { // Regel: wiederkehrende Unterrichtseinheit
  id String @id @default(cuid())
  tenantId String
  versionId String
  subjectId String
  classId String? // genau eines von classId oder groupId
  groupId String?
  roomId String?
  weekday Int // 1 = Montag bis 5 = Freitag
  periodStart Int
  periodCount Int @default(1) // 2 = Doppelstunde
  weekPattern WeekPattern @default(EVERY)
  teachers LessonTeacher[]
}
model LessonTeacher { lessonId String teacherId String tenantId String @@id([lessonId, teacherId]) }

model Occurrence { // konkreter Termin an einem Datum
  id String @id @default(cuid())
  tenantId String
  lessonId String?
  date DateTime @db.Date
  periodStart Int
  periodCount Int
  startsAt DateTime
  endsAt DateTime
  classId String?
  groupId String?
  subjectId String
  roomId String? // wirksamer Raum nach Änderungen
  status OccurrenceStatus @default(SCHEDULED)
  teachers OccurrenceTeacher[] // wirksame Lehrer nach Supplierung
  @@unique([lessonId, date])
}
model OccurrenceTeacher { occurrenceId String teacherId String tenantId String @@id([occurrenceId, teacherId]) }

model ClassbookEntry {
  id String @id @default(cuid())
  tenantId String
  occurrenceId String @unique
  topic String?
  homework String?
  homeworkDueOn DateTime? @db.Date
  note String? // nur Lehrer und Klassenvorstand
  closedAt DateTime?
  closedById String?
  version Int @default(1) // optimistische Sperre
}

model Attendance {
  id String @id @default(cuid())
  tenantId String
  occurrenceId String
  studentId String
  status AttendanceStatus @default(PRESENT)
  lateMinutes Int?
  recordedById String
  clientMutationId String? // Idempotenz bei Offline-Sync
  @@unique([occurrenceId, studentId])
}

model Absence { // Fehlzeit eines Schülers mit Entschuldigung
  id String @id @default(cuid())
  tenantId String
  studentId String
  fromAt DateTime
  toAt DateTime
  reason String?
  status AbsenceStatus @default(REPORTED)
  reportedById String
  reviewedById String?
  reviewedAt DateTime?
  reviewComment String?
  attachmentId String? // FileAsset
}

model TeacherAbsence {
  id String @id @default(cuid())
  tenantId String
  teacherId String
  fromAt DateTime
  toAt DateTime
  kind TeacherAbsenceKind
  approvedById String?
}

model Substitution {
  id String @id @default(cuid())
  tenantId String
  occurrenceId String @unique
  kind SubstitutionKind
  substituteTeacherId String?
  newRoomId String?
  note String?
  status SubstitutionStatus @default(OPEN)
  publishedAt DateTime?
}

model Exam {
  id String @id @default(cuid())
  tenantId String
  classId String?
  groupId String?
  subjectId String
  date DateTime @db.Date
  title String
  kind String // Schularbeit, Test, Mündlich
  createdById String
}

model Thread { id String @id @default(cuid()) tenantId String subject String createdById String aboutStudentId String? classId String? lastMessageAt DateTime createdAt DateTime @default(now()) } // M6: Gespräch je Familie bei Nachrichten an eine Klasse
model Message { id String @id @default(cuid()) tenantId String threadId String senderId String body String createdAt DateTime @default(now()) }
model ThreadParticipant { threadId String personId String tenantId String lastReadAt DateTime? @@id([threadId, personId]) }

model Announcement { // Rundschreiben
  id String @id @default(cuid())
  tenantId String
  title String
  body String
  audience Json // { roles, classIds, groupIds }
  requiresRead Boolean @default(false)
  createdById String
  publishedAt DateTime?
  remindedAt DateTime? // letzte Erinnerung an fehlende Lesebestätigungen
}
// Eine Zeile je Empfänger:in, angelegt bei Veröffentlichung; readAt leer = ungelesen (M6, ADR 0009)
model AnnouncementRead { announcementId String personId String tenantId String readAt DateTime? @@id([announcementId, personId]) }

model Notification { id String @id @default(cuid()) tenantId String personId String type String payload Json readAt DateTime? createdAt DateTime @default(now()) }
model NotificationPreference { id String @id @default(cuid()) tenantId String personId String type String channel String enabled Boolean quietFrom String? quietTo String? }
model PushSubscription { id String @id @default(cuid()) tenantId String personId String endpoint String @unique keys Json userAgent String? }
model CalendarToken { id String @id @default(cuid()) tenantId String personId String tokenHash String @unique }
model FileAsset { id String @id @default(cuid()) tenantId String key String mime String size Int ownerId String createdAt DateTime @default(now()) }

enum PrivacyRequestKind { ACCESS RECTIFICATION ERASURE RESTRICTION }
enum PrivacyRequestStatus { OPEN DONE REJECTED }
model PrivacyRequest { id String @id @default(cuid()) tenantId String personId String kind PrivacyRequestKind status PrivacyRequestStatus @default(OPEN) note String? createdById String resolvedById String? resolvedAt DateTime? } // M6
model Consent { id String @id @default(cuid()) tenantId String personId String kind String version String acceptedAt DateTime @default(now()) @@unique([personId, kind, version]) } // M6: z. B. Datenschutzhinweis

model AuditLog {
  id String @id @default(cuid())
  tenantId String
  actorId String?
  action String // z. B. "absence.excuse", "person.read"
  entity String
  entityId String?
  meta Json?
  createdAt DateTime @default(now())
  @@index([tenantId, createdAt])
}
```

**Mandantentrennung in der Datenbank:** Row-Level-Security auf jeder Tabelle. Die API setzt pro Anfrage innerhalb der Transaktion `SET LOCAL app.tenant_id = '<id>'`.

```sql
ALTER TABLE "Lesson" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Lesson"
  USING ("tenantId" = current_setting('app.tenant_id', true));
```

Noten (`Grade`, `GradeCategory`) kommen in V1 hinzu und folgen denselben Regeln.

## 9. API und Echtzeit

**Konventionen:**

- Basis `/api/v1`, JSON, OpenAPI wird aus den Zod-Schemas generiert, der Web-Client nutzt generierte Typen.
- **Mandant** wird aus der Subdomain abgeleitet (`schule.beispiel.at`), nie aus einem Header oder Parameter des Clients.
- **Auth:** Session-Cookie (httpOnly, Secure, SameSite=Lax) plus CSRF-Token bei Schreibzugriffen. API-Schlüssel für Dritte erst in V2.
- **Rechte:** Jeder Endpunkt deklariert seine Aktion (z. B. `@Can('classbook.write')`), das `policy`-Modul entscheidet.
- **Fehler:** `application/problem+json` (RFC 9457) mit `type`, `title`, `status`, `detail` und Feldfehlern.
- **Paginierung:** Cursor-basiert, `?limit=50&cursor=…`, Antwort `{ data, nextCursor }`.
- **Zeit:** Zeitpunkte als ISO 8601 mit Offset, Kalendertage als `YYYY-MM-DD`.
- **Idempotenz:** Schreibende Aufrufe aus der Offline-Queue tragen `Idempotency-Key` oder `clientMutationId`. Wiederholungen liefern dasselbe Ergebnis.
- **Konflikte:** Veränderbare Ressourcen haben `version`. Bei `If-Match`-Abweichung antwortet die API mit 409 und dem aktuellen Stand.
- **Ratenbegrenzung:** pro IP und Nutzer, strenger bei Login und Passwort-Reset.
- **Audit:** Lesende Zugriffe auf Personendaten, Fehlzeiten und Noten werden protokolliert.

**Endpunkte (MVP):**

| Bereich | Endpunkte | Rollen |
| --- | --- | --- |
| Konto | `POST /auth/login`, `POST /auth/2fa/verify`, `POST /auth/logout`, `POST /auth/invite/accept`, `POST /auth/password/reset-request`, `POST /auth/password/reset`, `POST /auth/access-code/check`, `POST /auth/access-code/redeem` | alle |
| Profil | `GET /me`, `GET/PATCH /me/preferences`, `GET /me/sessions`, `DELETE /me/sessions/:id`, `GET /me/homework`, `GET /me/export?format=json\|pdf`, `POST /me/onboarding`, `GET /me/onboarding`, `POST /me/onboarding/steps`, `PUT /me/avatar` | alle |
| Heute | `GET /today` (rollenabhängige Zusammenfassung) | alle |
| Pläne | `GET /me/timetable?from&to`, `GET /classes/:id/timetable`, `GET /teachers/:id/timetable`, `GET /rooms/:id/timetable`, `GET /calendar/:token.ics` | alle, je nach Recht |
| Klassenbuch | `GET /occurrences/:id`, `PUT /occurrences/:id/classbook`, `PUT /occurrences/:id/attendance`, `POST /occurrences/:id/close`, `GET /classbook/open` | Lehrer, Klassenvorstand, Direktion |
| Abwesenheit | `POST /absences`, `GET /absences`, `PATCH /absences/:id/review`, `POST /absences/:id/attachments`, `GET /absences/:id/attachment` (signierter Link) | Eltern, Klassenvorstand, Direktion, Administration |
| Lehrerabwesenheit | `POST /teacher-absences`, `GET /teacher-absences`, `PUT/DELETE /teacher-absences/:id` | Lehrer (nur sich selbst), Direktion, Administration |
| Supplierung | `GET /substitutions?date`, `GET /substitutions/:id/suggestions`, `PATCH /substitutions/:id`, `POST /substitutions/publish`, `POST /substitutions` (Änderung ohne Abwesenheit, z. B. Entfall), `DELETE /substitutions/:id` | Direktion, Administration (lesen: alle Betroffenen) |
| Prüfungen | `GET /exams`, `GET /exams/options`, `POST /exams`, `PATCH /exams/:id`, `DELETE /exams/:id` | Lehrer, Direktion (lesen: Schüler, Eltern) |
| Nachrichten | `GET /threads`, `GET /threads/unread`, `GET /threads/recipients`, `POST /threads`, `GET /threads/:id`, `POST /threads/:id/messages`, `POST /threads/:id/read`, `GET /announcements?view=inbox\|sent`, `POST /announcements`, `POST /announcements/preview`, `GET /announcements/:id`, `POST /announcements/:id/read`, `POST /announcements/:id/remind` | je nach Rechte-Matrix (Lesen und Antworten: Teilnehmer:innen) |
| Einverständnis | `GET /consent-forms`, `GET /consent-forms/options`, `POST /consent-forms`, `GET /consent-forms/:id`, `POST /consent-forms/:id/remind`, `POST /consent-forms/:id/close`, `PUT /consent-forms/:id/answers/:studentId` (Papier), `GET /me/consent-forms`, `PUT /me/consent-forms/:id/answers/:studentId` | Lehrer, Klassenvorstand, Direktion, Administration; Eltern (eigene Kinder) |
| Klassen der Lehrkraft | `GET /my-classes`, `GET /my-classes/:id` | Lehrer, Klassenvorstand, Direktion |
| Benachrichtigungen | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET/PATCH /me/preferences`, `POST /push/subscribe`, `DELETE /push/subscribe` | alle |
| Echtzeit | `GET /events` (Server-Sent Events) | alle |
| Stammdaten | `GET/POST/PATCH/DELETE /admin/{persons,classes,groups,subjects,rooms,school-years,periods}`, `POST /admin/guardian-links`, `POST /admin/invitations` | Administration |
| Import | `POST /admin/import/persons?dryRun=true`, `POST /admin/import/persons/commit` | Administration |
| Stundenplan | `GET/POST /admin/timetable-versions`, `GET /admin/timetable-versions/:id`, `POST …/lessons`, `PATCH/DELETE …/lessons/:lessonId`, `POST …/validate`, `POST …/publish` | Administration, Veröffentlichung auch Direktion |
| Auswertung | `GET /dashboard/principal?date`, `GET /reports/attendance?from&to&classId&format=json\|csv`, `GET /reports/substitutions?from&to&format` | Direktion, Administration (Anwesenheit: Klassenvorstand für die eigene Klasse) |
| Audit und Datenschutz | `GET /admin/audit`, `GET/POST /admin/privacy/requests`, `PATCH /admin/privacy/requests/:id`, `GET /admin/privacy/persons/:id/export` | Administration, Direktion (Audit lesen) |
| Schule | `GET/PATCH /admin/settings` (Fristen, Grenzwerte, Aufbewahrung), `GET /admin/roles` | Administration (Einstellungen lesen: Direktion) |
| Betrieb | `GET /healthz`, `GET /readyz`, `GET /metrics` (Bearer `METRICS_TOKEN`) | ohne Mandant |

**Echtzeit:** `GET /events` ist ein Server-Sent-Events-Stream pro angemeldetem Gerät, mit `Last-Event-ID` für die Wiederaufnahme. Ereignisse: `occurrence.updated`, `substitution.published`, `absence.reviewed`, `message.new`, `announcement.published`, `notification.new`. Der Client macht daraufhin die betroffenen TanStack-Query-Abfragen ungültig, es gibt keine Daten im Ereignis selbst außer Ids. Der Stream ist ein Hinweis, Push-Benachrichtigungen laufen getrennt über Web-Push.

## 10. Stundenplan-Editor

**Prinzip:** Der Plan besteht aus **Regeln** (`Lesson`: Fach, Klasse oder Gruppe, Lehrer, Raum, Wochentag, Stunde, Dauer, Wochenmuster) in einer **Version** (`TimetableVersion`). Aus der veröffentlichten Version erzeugt ein Job konkrete **Termine** (`Occurrence`). Klassenbuch, Anwesenheit und Supplierung hängen immer am Termin, nie an der Regel.

Ergänzungen zum Schema aus Abschnitt 8:

```prisma
model LessonRequirement { // Soll-Stunden, Grundlage für den Pool "noch nicht eingeplant"
  id String @id @default(cuid())
  tenantId String
  versionId String
  subjectId String
  classId String?
  groupId String?
  teacherId String
  hoursPerWeek Int
  preferDouble Boolean @default(false)
}
// Period erhält: blocksDouble Boolean @default(false) (Doppelstunde über diese Grenze nicht erlaubt)
// Tenant.settings enthält: abWeekReferenceMonday (Datum eines Montags einer A-Woche)
```

**Konfliktregeln:**

| Code | Schwere | Regel |
| --- | --- | --- |
| `TEACHER_DOUBLE` | hart | Derselbe Lehrer in zwei überlappenden Regeln (Wochentag, Stunden, Wochenmuster) |
| `ROOM_DOUBLE` | hart | Derselbe Raum in zwei überlappenden Regeln |
| `STUDENT_DOUBLE` | hart | Ein Schüler in zwei überlappenden Regeln, über Klasse oder Gruppenmitgliedschaft |
| `OUT_OF_GRID` | hart | Stunde oder Dauer außerhalb des Rasters, oder Doppelstunde über eine Grenze mit `blocksDouble` |
| `MISSING_RESOURCE` | hart (Veröffentlichung) | Regel ohne Fach, ohne Lehrer oder ohne Klasse/Gruppe |
| `ROOM_CAPACITY` | weich | Raumkapazität kleiner als Klassengröße |
| `GAP_STUDENT`, `GAP_TEACHER` | weich (V1) | Hohlstunden |
| `DAY_LOAD` | weich (V1) | Mehr als eine einstellbare Zahl Stunden am Tag |
| `SAME_SUBJECT_TWICE` | weich (V1) | Gleiches Fach zweimal am Tag, außer als Doppelstunde |

Wochenmuster: `EVERY` überlappt mit `A` und `B`, `A` überlappt nicht mit `B`.

**Validierung:** Die Funktion `validateTimetable(versionId, change?)` liefert eine Liste `{ code, severity, lessonIds, message }`. Sie bildet Buckets je (Wochentag, Stunde, Wochenmuster) und prüft darin Doppelbelegungen je Lehrer, Raum und Schülermenge. Die Laufzeit ist linear in der Zahl der Regeln. Mit dem optionalen Parameter `change` prüft der Editor eine einzelne Änderung live (Ziel: unter 100 ms), die Gesamtprüfung läuft vor dem Veröffentlichen.

**Editor-Verhalten:**

- Raster mit Tagen als Spalten und Stunden als Zeilen, Ansichtswechsel Klasse, Lehrer, Raum
- Links der Pool der noch nicht eingeplanten Soll-Stunden mit Fortschritt (z. B. "3 von 4 eingeplant")
- Drag and Drop, Größe ziehen für Doppelstunden, Kopieren mit Alt oder Strg
- Konflikte sofort rot im Raster, Panel mit Erklärung und Link zu den beteiligten Regeln
- Rückgängig und Wiederholen (Befehlsstapel im Client), Speichern als Entwurf, automatisches Zwischenspeichern
- Mehrere Administratoren gleichzeitig: Änderungen pro Regel mit `version`, bei Konflikt Hinweis statt stillem Überschreiben

**Veröffentlichen:**

1. Vollprüfung. Harte Konflikte blockieren.
2. Auswahl **Gültig ab** (Datum, nicht in der Vergangenheit).
3. Status `PUBLISHED`, vorherige Version `ARCHIVED` ab diesem Datum.
4. Job `generate-occurrences` läuft für das gleitende Fenster.
5. Benachrichtigung "Stundenplan geändert ab \<Datum>" an Betroffene.

**Job `generate-occurrences`:** Läuft nächtlich und beim Veröffentlichen. Für jeden Tag von heute bis heute plus 28 Tage ohne `SchoolFreeDay` und für jede passende Regel (Wochentag, Wochenmuster nach ISO-Woche gegenüber `abWeekReferenceMonday`) wird per `upsert` auf `(lessonId, date)` ein `Occurrence` angelegt. `startsAt` und `endsAt` werden aus den Rasterzeiten in Europe/Vienna berechnet (sommerzeitsicher, z. B. mit Luxon). Der Job ist idempotent und verändert keine Termine, die bereits ein Klassenbuch, eine Anwesenheit oder eine Supplierung haben.

**Tests:** Property-Tests für die Konfliktprüfung (zufällige Pläne, Doppelbelegungen müssen immer gefunden werden), Tests für die Terminerzeugung über die Zeitumstellung am 25.10.2026, Wochenmuster A/B über Jahresgrenzen und Ferien.

## 11. Abläufe: Abwesenheit und Supplierung

Beide Abläufe haben feste Zustände, jede Zustandsänderung wird im Audit-Log festgehalten und löst eine Benachrichtigung aus.

&#91;embedded content: Zustände · Abwesenheit und Supplierung\]

**Abwesenheit:**

- Eine Fehlzeit entsteht, wenn ein Lehrer im Klassenbuch "abwesend" setzt (Status `OPEN`, aufeinanderfolgende Stunden eines Tages ergeben einen Block). Melden Eltern vorab, startet der Ablauf direkt bei `REPORTED`; noch nicht entschuldigte Fehlzeiten im gemeldeten Zeitraum gehen in der Meldung auf.
- Fehlt die Meldung, erhalten Eltern Erinnerungen. Zeitpunkte und die Frist (`settings.absence.excuseDeadlineDays`) sind pro Schule einstellbar.
- Nach Ablauf der Frist setzt ein Job den Status `UNEXCUSED`. Eltern können danach weiterhin nachmelden, der Ablauf beginnt dann wieder bei `REPORTED`.
- Der Klassenvorstand entscheidet `EXCUSED` oder `REJECTED`, immer mit optionalem Kommentar. Eltern werden per Push informiert, nach einer Ablehnung können sie erneut melden.
- Ab einer einstellbaren Dauer ist ein Anhang (Foto der Bestätigung) Pflicht.

**Supplierung:**

- Eine `TeacherAbsence` erzeugt per Job für jeden betroffenen Termin eine `Substitution` im Status `OPEN`. Der Termin selbst bleibt bis zur Veröffentlichung unverändert.
- **Vorschläge** (`GET /substitutions/:id/suggestions`): Lehrer, die in dieser Stunde frei und nicht abwesend sind. Sortiert nach Eignung (Fach oder Klasse bekannt) und nach dem Fairness-Zähler (bisherige Supplierstunden im Schuljahr, aufsteigend).
- **Aktionen:** `SUBSTITUTE` ersetzt den Lehrer am Termin, `CANCEL` setzt den Termin auf `CANCELLED`, `ROOM_CHANGE` ändert den Raum, `SUPERVISION` weist eine Betreuung zu.
- **Veröffentlichen** (`POST /substitutions/publish`) läuft in einer Transaktion: Termine aktualisieren, Benachrichtigungen für Schüler, Eltern und Lehrer anlegen, Ereignis `substitution.published` senden.
- **Rücknahme:** Wird eine Lehrerabwesenheit verkürzt oder gelöscht, werden die Supplierungen neu berechnet. Bereits veröffentlichte Änderungen werden als Korrektur erneut veröffentlicht.

## 12. Benachrichtigungen und Offline-Sync

### Benachrichtigungen

| Ereignis | Empfänger | Kanal (Standard) |
| --- | --- | --- |
| `substitution.published` | Schüler und Eltern der Klasse, betroffene Lehrer | Push, In-App |
| `timetable.published` | alle Rollen der Schule | Push, In-App |
| `absence.reminder` (Fehlzeit ohne Entschuldigung) | Eltern | Push, E-Mail |
| `absence.reported` | Klassenvorstand | In-App |
| `absence.reviewed` | Eltern | Push, In-App |
| `classbook.open` (offener Eintrag) | Lehrer | In-App, Push optional |
| `exam.created` | Schüler, Eltern | In-App |
| `message.new` | Empfänger | Push, In-App |
| `announcement.published` | Zielgruppe | Push, In-App |
| `announcement.required` (Rundschreiben mit Lesebestätigung, auch Erinnerung) | Zielgruppe | Push, E-Mail, In-App – Pflichtmitteilung, nicht abschaltbar |
| `invitation.created` | eingeladene Person | E-Mail |

**Ablauf:** Fachmodule rufen `notifications.emit(type, recipients, payload)` auf. Der Dienst legt `Notification`-Zeilen an und stellt pro Kanal einen Job in pg-boss ein. Der Job beachtet `NotificationPreference` und Ruhezeiten, sendet per Web-Push (VAPID) oder E-Mail und wiederholt bei Fehlern mit steigendem Abstand. Antwortet der Push-Dienst mit "Gone" (410), wird die `PushSubscription` gelöscht.

**Regeln:**

- **Datensparsamkeit:** Push-Texte enthalten keine Namen oder Noten, nur allgemeine Hinweise ("Neue Supplierung für Mittwoch"). Details lädt die App nach dem Öffnen.
- **Bündelung:** Mehrere gleichartige Ereignisse innerhalb kurzer Zeit werden zu einer Benachrichtigung zusammengefasst ("3 Änderungen heute").
- **Einstellungen:** Pro Ereignistyp und Kanal ein- und ausschaltbar, Ruhezeiten pro Person, Pflichtmitteilungen (z. B. Rundschreiben mit Lesebestätigung) nicht abschaltbar.
- **iOS:** Web-Push funktioniert nur, wenn die App zum Home-Bildschirm hinzugefügt wurde. Das Onboarding erklärt das in zwei Schritten, E-Mail dient als Rückfall.

### Offline und Synchronisation

Offline-Fähigkeit gilt im MVP für **Heute-Ansicht, Stundenplan und Klassenbuch**. Alles andere zeigt bei fehlender Verbindung einen Hinweis.

- **Zwischenspeicher:** Service Worker für App-Hülle, IndexedDB (Dexie) für die Termine der nächsten 7 Tage und, bei Lehrern, die Schülerlisten der eigenen Klassen.
- **Outbox:** Jede Änderung (Anwesenheit, Stoff, Hausübung, Abschließen) wird zuerst lokal gespeichert und als Mutation mit `clientMutationId` in die Outbox gelegt. Die Oberfläche zeigt sofort den neuen Stand (optimistisch).
- **Senden:** Sobald eine Verbindung besteht (Ereignis `online`, App im Vordergrund, wo verfügbar Background Sync), arbeitet die Outbox in Reihenfolge ab. Die Idempotenz auf dem Server verhindert Doppelungen.
- **Konflikte:** Anwesenheit ist pro Schüler und Termin "letzte Änderung gewinnt" (mit Zeitstempel des Clients). Stoff und Hausübung nutzen `version`: Bei Konflikt zeigt die App beide Stände und lässt wählen.
- **Statusanzeige:** Immer sichtbar: gespeichert, wartet auf Verbindung (Anzahl offener Änderungen), synchronisiert, Fehler mit Wiederholen.
- **Datenschutz auf dem Gerät:** Nur Daten, die der Lehrer für die nächsten Tage braucht. Beim Abmelden und nach einer einstellbaren Zeit ohne Nutzung wird der lokale Speicher geleert. Keine Fotos oder Anhänge offline.

## 13. Sicherheit, Datenschutz, Tests und Betrieb

### Sicherheit

- **Konten:** Passwörter mit Argon2id, TOTP-Zwei-Faktor mit Wiederherstellungscodes, temporäre Sperre bei wiederholten Fehlversuchen, Geräteliste mit "überall abmelden".
- **Sitzungen:** Rotierende Session-ID, Ablauf bei Inaktivität (einstellbar), httpOnly, Secure, SameSite=Lax, CSRF-Schutz.
- **Web-Härtung:** Strenge Content-Security-Policy ohne Fremdquellen (Nonce je Anfrage, `apps/web/proxy.ts`), HSTS, Security-Header, striktes CORS (API nur über die Web-App erreichbar).
- **Mandantentrennung:** Row-Level-Security und Policy-Modul. Ein Test prüft für jeden Endpunkt, dass Mandant A keine Daten von Mandant B sieht.
- **Eingaben und Dateien:** Zod-Validierung überall, Uploads mit Typ- und Größenprüfung, Virenscan, nur signierte URLs, kein öffentlicher Speicher.
- **Verschlüsselung:** TLS überall, Datenträgerverschlüsselung der Datenbank, TOTP-Geheimnisse zusätzlich auf Anwendungsebene verschlüsselt, Backups verschlüsselt.
- **Audit-Log:** Nur anhängen. Die Datenbankrolle der Anwendung hat auf `AuditLog` kein UPDATE und kein DELETE.
- **Lieferkette:** Abhängigkeiten per Dependabot und `pnpm audit` überwacht, Lockfile eingecheckt, keine Geheimnisse im Repository.
- **Logs:** Strukturiert (pino), ohne personenbezogene Daten, Namen und E-Mails maskiert.

### Datenschutz

- Hosting nur in der EU, keine Drittlandübermittlung, Liste der Unterauftragsverarbeiter in `docs/datenschutz/`.
- Keine Drittanbieter-Skripte, keine externen Schriften, keine Tracker. Optionale Nutzungsstatistik nur selbst gehostet und ohne Personenbezug.
- **Betroffenenrechte:** Auskunft als Export (JSON und PDF), Berichtigung, Löschung als Anonymisierung (`Person.anonymizedAt`), Einschränkung der Verarbeitung. Verwaltung über `/admin/datenschutz`, Selbstbedienung über `GET /me/export`.
- **Aufbewahrung:** `settings.retention` pro Datentyp (Nachrichten, Fehlzeiten, Anhänge, Benachrichtigungen, Audit-Log mindestens 90 Tage). Ein täglicher Job löscht oder anonymisiert nach Ablauf; das Audit-Log nur über die Datenbankfunktion `prune_audit_log` (M6). Fristen stellt die Administration unter `/admin/einstellungen` ein.
- **Dokumente für die Schule:** Vorlage Auftragsverarbeitungsvertrag, Verarbeitungsverzeichnis, technisch-organisatorische Maßnahmen und Datenschutz-Folgenabschätzung als Entwurf im Repository.
- **Minderjährige:** Altersgrenzen und Elternrechte in `settings`, Einwilligungen mit Zeitstempel und Version des Textes gespeichert.
- Die rechtliche Bewertung (Klassenbuchpflicht, Entschuldigungsfristen, Datenschutz im Schulbereich) erfolgt vor dem Pilotstart durch eine fachkundige Stelle.

### Tests und Qualität

| Ebene | Werkzeug | Was getestet wird |
| --- | --- | --- |
| Unit | Vitest | Konfliktprüfung (auch als Property-Tests), Terminerzeugung, Policy-Matrix, Supplierungsvorschläge |
| Integration | Vitest, Testcontainers (Postgres) | API-Endpunkte inklusive Row-Level-Security und Mandantentrennung |
| End-to-End | Playwright | Login mit 2FA, Klassenbuch offline und danach synchron, Abwesenheit melden und entschuldigen, Supplierung veröffentlichen, Stundenplan veröffentlichen |
| Barrierefreiheit | axe in Playwright | Alle Kernseiten ohne Verstöße |
| Last | k6 | Klassenbuch-Speichern und Heute-Ansicht zu Stundenbeginn |

**Ziele (zu validieren):** API-Lesezugriffe p95 unter 200 ms, Klassenbuch speichern p95 unter 300 ms, Heute-Ansicht auf einem Mittelklasse-Smartphone im Mobilfunk in unter 2 Sekunden nutzbar, Abdeckung der Kernlogik (Konflikte, Policy, Terminerzeugung) nahe 100 %, insgesamt mindestens 80 %.

### Betrieb

- **Umgebungen:** lokal (Docker Compose), Staging, Produktion. Migrationen laufen in der Pipeline mit `prisma migrate deploy`.
- **CI/CD:** GitHub Actions mit Lint, Typprüfung, Tests, Build, Docker-Images und Deployment. Hauptzweig geschützt, Änderungen nur per Pull Request.
- **Backups:** Tägliche Datenbank-Sicherung plus Point-in-Time-Recovery, Aufbewahrung einstellbar, monatlicher Test der Wiederherstellung.
- **Überwachung:** `/healthz` und `/readyz`, Metriken (`/metrics`), Warnungen bei Fehlerrate, Job-Rückstau und fehlgeschlagenen Pushes, externer Verfügbarkeitscheck.
- **Verfügbarkeit:** Ziel in der Schulzeit werktags morgens (zu validieren), Wartung außerhalb der Schulzeit.
- **Mandanten anlegen:** `pnpm tenant:create` erzeugt Schule, Raster-Vorlage, Administrator und Einladung.
- **Betriebshandbuch** in `docs/runbooks/`: Betrieb (Aufsetzen, Ausrollen, Überwachen, Lasttest), Schuljahreswechsel, Wiederherstellung, Ausfall des Push-Dienstes, Datenschutzanfrage. Images und Compose-Datei in `infra/`.

## 14. Umsetzungsplan für Claude Code

Die Meilensteine bauen aufeinander auf. Jeder endet mit einem lauffähigen, getesteten Stand. Claude Code arbeitet einen Meilenstein nach dem anderen ab und hakt die Aufgaben ab.

**Starter-Prompt:**

```text
Lies docs/spec.md vollständig und CLAUDE.md. Setze Meilenstein M0 um.
Halte dich an die Spezifikation. Bei Widersprüchen oder fehlenden Angaben
frage nach, statt zu raten. Halte Entscheidungen als ADR in docs/adr/ fest.
Zum Schluss: lint, typecheck und alle Tests müssen grün sein, dann fasse
zusammen, was gebaut wurde und was als Nächstes folgt.
```

### M0: Fundament

- [x] Monorepo (pnpm, Turborepo) mit `apps/web`, `apps/api`, `packages/db`, `packages/shared`, `packages/ui`, `packages/config`
- [x] Docker Compose mit Postgres, Mailpit, S3-kompatiblem Speicher (SeaweedFS statt MinIO, ADR 0002), `.env.example`
- [x] Prisma-Schema aus Abschnitt 8 und 10, erste Migration, Seed einer Demoschule
- [x] Design-Tokens, Tailwind-Preset, Grundkomponenten in `packages/ui`
- [x] CI-Pipeline mit Lint, Typprüfung, Tests, Build

**Fertig wenn:** `pnpm dev` startet Web und API, die Demoschule ist geladen, CI ist grün.

### M1: Mandanten, Login, Rechte

- [x] Mandantenauflösung per Subdomain, Row-Level-Security mit `SET LOCAL app.tenant_id`
- [x] Login, Einladung, Passwort-Reset, Sessions, CSRF
- [x] TOTP-Zwei-Faktor mit Wiederherstellungscodes
- [x] `policy`-Modul und `permissions.ts` nach der Matrix aus Abschnitt 3, automatische Matrix-Tests
- [x] Audit-Log, App-Rahmen mit rollenabhängiger Navigation

**Fertig wenn:** Alle Rollen der Demoschule können sich anmelden und sehen nur ihre Navigation, Mandantentest ist grün.

### M2: Stammdaten und Import

- [x] Verwaltung von Schuljahr, Ferien, Klassen, Gruppen, Fächern, Räumen, Raster
- [x] Personen-CSV-Import mit Vorschau, Fehlerbericht und Einladungen
- [x] Eltern-Kind-Verknüpfung per Einladungscode
- [x] Admin-Oberfläche `/admin/*` für alle Stammdaten

**Fertig wenn:** Eine Schule lässt sich aus CSV-Dateien vollständig anlegen.

### M3: Stundenplan

- [x] `LessonRequirement`, Versionen, Regeln, `validateTimetable` mit Property-Tests
- [x] Editor mit Raster, Drag and Drop, Pool, Rückgängig, Konfliktpanel
- [x] Veröffentlichen mit Gültig-ab, Job `generate-occurrences`, Terminerzeugung
- [x] Pläne für Klasse, Lehrer, Raum, eigener Plan, iCal-Feed

**Fertig wenn:** Ein Plan lässt sich ohne harte Konflikte veröffentlichen, alle Rollen sehen ihren Plan, Zeitumstellungstest ist grün.

### M4: Heute und Klassenbuch

- [x] Heute-Ansicht für Schüler, Eltern, Lehrer
- [x] Klassenbuch-Screen mit Anwesenheit per Tap, Stoff, Hausübung, Abschließen
- [x] Hinweis auf offene Einträge, Supplierstunde mit Vorbelegung
- [x] PWA, Offline-Zwischenspeicher, Outbox, Konfliktbehandlung, Statusanzeige
- [x] Echtzeit-Stream (SSE) und Aktualisierung der Ansichten

**Fertig wenn:** Ein Lehrer trägt eine Klasse offline ein und sie synchronisiert danach fehlerfrei, E2E-Test dafür ist grün.

### M5: Abwesenheit, Supplierung, Benachrichtigungen

- [x] Abwesenheit melden, prüfen, Erinnerungen, Fristen-Job
- [x] Lehrerabwesenheit, Supplierungsvorschläge, Aktionen, Veröffentlichen
- [x] Benachrichtigungsdienst mit Web-Push, E-Mail, Einstellungen, Ruhezeiten, Bündelung
- [x] Prüfungskalender mit Kollisionswarnung

**Fertig wenn:** Der Ablauf aus Abschnitt 11 funktioniert Ende zu Ende, Push kommt auf Android und installiertem iOS-PWA an.

### M6: Kommunikation, Direktion, Pilotreife

- [x] Nachrichten und Rundschreiben mit Lesebestätigung
- [x] Direktions-Lagebild und Basis-Auswertungen
- [x] Datenschutzfunktionen (Export, Anonymisierung, Aufbewahrungsjobs)
- [x] Barrierefreiheits-Durchlauf, Lasttest, Sicherheitsdurchlauf (intern: CSP, Ratenbegrenzung, RLS-Tests, `pnpm audit`; ein externer Penetrationstest steht vor dem Pilotbetrieb aus), Betriebshandbuch
- [x] Onboarding-Abläufe für alle Rollen (Engine mit Flows je Rolle, ADR 0020)

**Fertig wenn:** Eine Pilotschule kann den Alltag ohne WebUntis-Klassenbuch und ohne WhatsApp-Gruppen abbilden.

### M7: Stundenplan-Assistent (automatische Planung, SP-08)

Ziel: Die Administration erstellt einen Stundenplan nicht mehr Stunde für Stunde, sondern lässt ihn aus den Soll-Stunden vorschlagen und korrigiert nur noch.

- [x] Lehrfächerverteilung (Soll-Stunden) per CSV importieren, Prüfung "zu wenige/zu viele Stunden eingeplant" vor dem Veröffentlichen
- [x] Planungswünsche erfassen: Sperrzeiten und freie Tage von Lehrkräften, Fachräume, maximale Stunden pro Tag, Doppelstunden, keine Hohlstunden für Schüler:innen
- [x] Solver erzeugt einen Vorschlag als neuen Entwurf: harte Regeln aus Abschnitt 10 werden immer eingehalten, weiche Regeln (Hohlstunden, Tagesbelastung, gleiches Fach zweimal am Tag) werden minimiert
- [x] Teilplanung: bestehende Stunden festpinnen, nur den Rest planen lassen (z. B. eine Klasse oder eine Lehrkraft neu)
- [x] Erklärung für nicht einplanbare Stunden ("Mathe 3A: keine freie Zeit, in der Lehrkraft und Klasse gleichzeitig frei sind")
- [x] KI-Unterstützung: Planungswünsche in natürlicher Sprache eingeben ("Frau Huber hat freitags frei", "Turnen nicht in der ersten Stunde"), werden in überprüfbare Regeln übersetzt; die eigentliche Planung bleibt deterministisch (Solver), damit Ergebnisse nachvollziehbar und reproduzierbar sind
- [x] Datenschutz: an ein KI-Modell gehen nur Planungsdaten ohne Personenbezug (Kürzel statt Namen), Anbieter mit EU-Verarbeitung

**Fertig wenn:** Für die Demoschule entsteht aus den Soll-Stunden ohne Handarbeit ein Entwurf ohne harte Konflikte, und die Administration kann Wünsche in Worten nachreichen.

### CLAUDE.md (in das Repository-Stammverzeichnis legen)

```markdown
# Schulplattform: Arbeitsanweisungen

Quelle der Wahrheit ist docs/spec.md. Bei Abweichung zuerst nachfragen oder
die Spezifikation anpassen, dann bauen.

## Befehle
- pnpm install, pnpm dev, pnpm lint, pnpm typecheck, pnpm test
- pnpm db:migrate, pnpm db:seed, pnpm tenant:create

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
```

## 15. Offene Fragen und Risiken

**Offene Fragen (vor oder während M0 bis M2 klären):**

- [ ] Produktname und Marke (Abschnitt 2), Domain, Markenrecherche
- [ ] Pilotschule: Schulform, Größe, Bereitschaft, den Stundenplan direkt in der Plattform zu pflegen
- [ ] Rechtliche Vorgaben: digitales Klassenbuch, Entschuldigungsfristen, Aufbewahrungsfristen, Datenschutz im Schulbereich, nötige Freigaben von Schulerhalter oder Bildungsdirektion
- [x] Identität der Eltern: Brief mit Code (Eltern-Code, auch im Zugangsbrief des Klassenvorstands) oder Einladung per E-Mail (ADR 0020)
- [ ] Ab welchem Alter dürfen Schüler eigene Logins und eigene Rechte haben? Derzeit: eigener Zugang per Zugangsbrief ohne eigenen Schritt für unter 14-Jährige (ADR 0020); die Einwilligung unter 14 Jahren ist juristisch zu prüfen
- [x] Notensystem und Gewichtungen für V1: österreichisch 1 bis 5, Gewichtung je Notenart (ADR 0018); verbale Beurteilung folgt mit PN-03
- [ ] Hosting und Betrieb: Anbieter, Selbstbetrieb oder verwaltet, Kosten, Support-Zeiten
- [ ] Native Apps nötig oder reicht die PWA (Einschränkungen von Push auf iOS)? Das Onboarding ist für die PWA gebaut (Push-Erklärung vor dem System-Dialog, "Zum Home-Bildschirm" statt Widgets, ADR 0020)
- [ ] Sokrates- und Untis-Schnittstellen für V2: Exportformate und Zugang erst klären, wenn eine Schule Testdaten liefert

**Risiken:**

| Risiko | Auswirkung | Gegenmaßnahme |
| --- | --- | --- |
| Stundenplan-Erfassung ist für Schulen aufwendig | Pilotschule bricht ab | Kleine Pilotschule, CSV-Import, Editor mit Pool und Konfliktpanel, später Import und Auto-Planung |
| Rechtliche Anforderungen unklar | Verzögerung oder Umbau | Früh klären, Fristen und Rechte konfigurierbar halten |
| Offline-Synchronisation ist komplex | Datenverlust im Klassenbuch | In M4 früh und ausführlich E2E-testen, Idempotenz und Konfliktanzeige |
| Web-Push auf iOS nur für installierte PWA | Eltern erhalten keine Meldungen | Onboarding mit Anleitung, E-Mail als Rückfall, später Capacitor-Wrapper |
| Ausfall zu Schulbeginn | Vertrauensverlust | Lasttest, Staging, Überwachung, Runbooks |
| Umfang wächst | MVP verspätet sich | Abschnitt 1 (Nicht-Ziele) als Grenze, neue Wünsche nur als V1 oder V2 |
| Wissen und Betrieb hängen an einer Person | Ausfallrisiko | Betriebshandbuch, ADRs, automatisierte Pipeline |
