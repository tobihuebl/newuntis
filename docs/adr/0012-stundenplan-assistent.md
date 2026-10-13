# ADR 0012: Stundenplan-Assistent (M7, SP-08)

Status: akzeptiert (M7, Okt. 2026)

## Kontext

Die Administration soll einen Stundenplan nicht mehr Stunde für Stunde bauen, sondern aus den Soll-Stunden
(Lehrfächerverteilung, `LessonRequirement`) vorschlagen lassen und nur noch korrigieren (Spec Abschnitt 14, M7).
Planungswünsche sollen auch in Worten eingegeben werden können; die Planung selbst muss nachvollziehbar und
reproduzierbar bleiben. Das Design System beschreibt den Ablauf in fünf Schritten (Eingabe, Vorschlag,
Regelprüfung, Feinschliff, Freigabe) mit dem Satz "Die AI schlägt vor, die Schule entscheidet."

## Entscheidungen

1. **Solver in TypeScript, deterministisch** (Entscheidung der Produktverantwortung, 13. Okt. 2026): reine Funktion
   `solveTimetable` in `packages/shared/src/planning`, ohne Datenbank, ausgeführt als Hintergrund-Job (pg-boss).
   Ablauf: Soll-Stunden in Einheiten zerlegen (Doppelstunden bei `preferDouble`), schwierigste zuerst platzieren
   (wenigste freie Plätze), bei Sackgassen gezielt verdrängen und neu platzieren, danach lokale Suche gegen die
   weichen Regeln. Zufall nur über einen gespeicherten Startwert (`seed`): gleiche Eingabe und gleicher Startwert
   ergeben denselben Plan. Kein zusätzlicher Dienst im Betrieb; ausgelegt auf Schulen bis etwa 40 Klassen.
2. **Harte Regeln sind die aus Abschnitt 10** (Lehrkraft, Raum, Schüler:innen doppelt, Raster, Doppelstunde über
   Pausen) plus harte Planungswünsche (Sperrzeiten, freie Tage, Fachräume, Fach nicht in bestimmten Stunden,
   Höchststunden je Tag). Der Solver verletzt sie nie; was nicht passt, bleibt mit Begründung ungeplant.
3. **Weiche Regeln (SP-06)** werden Teil von `validateTimetable`: `GAP_STUDENT`, `GAP_TEACHER`, `DAY_LOAD`,
   `SAME_SUBJECT_TWICE` (Doppelstunden ausgenommen). Der Solver minimiert eine gewichtete Summe daraus; der
   Editor zeigt sie als Warnungen.
4. **Planungswünsche als Daten** (`PlanningConstraint`, je Schuljahr): Art, betroffene Lehrkraft, Klasse, Fach
   oder Räume, Wochentag, Stunden, Höchstwert, hart oder weich, Herkunft (Formular, Text, KI) und der
   ursprüngliche Satz. Jede Regel ist sichtbar, prüfbar und abschaltbar.
5. **Teilplanung:** Stunden einer Version lassen sich festpinnen (`Lesson.pinned`). Ein Lauf plant nur den
   gewählten Umfang (alles, eine Klasse, eine Lehrkraft) neu; festgepinnte und nicht betroffene Stunden bleiben.
6. **Ergebnis ist immer ein neuer Entwurf** (`TimetableVersion` mit Status `DRAFT`), nie direkt live. Der Lauf
   (`PlanningRun`) hält Startwert, Umfang, Kennzahlen und nicht einplanbare Stunden mit Begründung fest.
   Vor dem Veröffentlichen prüft die App zusätzlich Soll gegen Ist ("zu wenige/zu viele Stunden").
7. **Wünsche in Worten:** Ein Übersetzer macht aus einem Satz eine oder mehrere `PlanningConstraint`, die die
   Administration vor dem Speichern bestätigt. Zwei Stufen: ein regelbasierter Übersetzer für typische Sätze
   (läuft immer, auch ohne Schlüssel und in Tests) und optional ein KI-Modell über das **Vercel AI Gateway** mit
   fester EU-Region (`inferenceRegion` `eu`), Zero Data Retention und ohne Training. Das Modell bekommt nur
   Kürzel (Lehrkraft, Klasse, Fach, Raum) und das Raster, nie Namen; die Antwort ist ein Schema (Zod), das gegen
   die Stammdaten geprüft wird. Schlüssel nur in der Umgebung (`AI_GATEWAY_API_KEY`), nie im Code.
8. **Freischaltung je Schule** (Paket "Komplett"): `features.autoPlanning` in den Schuleinstellungen, gesetzt vom
   Betrieb (nicht von der Schule selbst); in der Demoschule an. Rechte wie der Editor (`timetable.edit`).

## Folgen

- Neue Tabellen `PlanningConstraint` und `PlanningRun` (mit RLS), Spalte `Lesson.pinned`.
- Die weichen Regeln erscheinen auch im bestehenden Editor als Warnungen.
- Laufzeit und Qualität des Solvers sind an der Demoschule gemessen (Test); für sehr große Schulen kann später
  ein externer Solver (z. B. OR-Tools) hinter derselben Schnittstelle folgen.
- Hinweis: Das Gateway nimmt Anfragen laut Vercel derzeit noch in beliebigen Vercel-Regionen an, bevor es sie in
  der EU verarbeiten lässt; deshalb gehen ausschließlich Kürzel ohne Personenbezug hinaus.
