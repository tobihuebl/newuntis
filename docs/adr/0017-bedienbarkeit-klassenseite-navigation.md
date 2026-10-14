# ADR 0017: Bedienbarkeit – eine Klassenseite, schlankere Navigation der Direktion

Status: angenommen (2026-10-14)

## Kontext

Ein Durchgang durch die App (alle Rollen, Rundgang über alle Links) zeigte: Es gab drei Klassenansichten
(`/admin/klassen/[id]` Stammdaten, `/klassen/[id]` Lehrkräfte, `/klasse` mit Entschuldigungen), keine zeigte, wer
heute da ist. Die Direktion hatte 18 Menüpunkte, darunter Dubletten ("Plan" und "Stundenpläne", "Freigaben" als
leere Teilmenge von "Stundenpläne", "Entschuldigungen" mit dem Titel "Klassenvorstand – Klasse wählen") und
Stammdaten, die sie nur lesen darf. Zwei Links im Lagebild der Administration führten auf "Kein Zugriff".

## Entscheidung

1. **Eine Klassenseite `/klassen/[id]`** für alle Rollen mit Leserecht (`attendance.read` für die Klasse). Oben
   "Heute": Zahlen und Namen, die fehlen oder zu spät sind; Regel `todayStatus` in `@sp/shared` (zuletzt erfasste
   Stunde zählt, gemeldete Fehlzeit geht vor). Schülerliste mit dem Stand von heute statt Konto-Status.
2. **Reiter der Klasse** (Übersicht, Entschuldigungen, Fehlzeiten, Vermerke) für Klassenvorstand, Direktion und
   Administration auf allen vier Seiten; "Meine Klasse" führt zur Übersicht. Die Stammdaten-Seite verlinkt sie.
3. **Direktion:** Schule = Stundenplan, Klassen, Personen, Räume, Protokoll, Einstellungen. Stammdaten (Schuljahr,
   Raster, Fächer, Räume) und die Stundenplan-Versionen bleiben über Links erreichbar. "Freigaben" sammelt, was auf
   die Direktion wartet: Stundenplan-Entwürfe und gemeldete Entschuldigungen je Klasse.
4. **Administration:** Lagebild-Links (Prüfungen, Klassenbuch lesen) sind erlaubt; die Prüfungsseite lädt die
   Auswahl zum Eintragen nur für Rollen mit `exam.write`.
5. **E2E `links.spec.ts`**: Rundgang je Rolle; kein Link darf auf 404, "Kein Zugriff", "Kommt bald" oder einen
   Fehler führen, keine API-Anfrage scheitern.
6. `SegmentedNav` zeigt mehr als drei Ansichten mobil als 2×2-Raster statt umbrechender Pillenleiste.
