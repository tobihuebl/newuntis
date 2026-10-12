# ADR 0008: Abwesenheit, Supplierung und Benachrichtigungen (M5)

Status: akzeptiert (M5)

## Benachrichtigungen

- `NotificationsService.emit(tx, …)` legt die Zeilen für die Liste in der App an, sendet `notification.new` über den Echtzeit-Stream und stellt je Kanal (Push, E-Mail) einen pg-boss-Job **in derselben Transaktion** ein (pg-boss `db`-Option über `tx.$queryRawUnsafe`). Abgebrochene Änderungen erzeugen so keinen Versand.
- **Bündelung:** Queue-Policy `stately` mit `singletonKey = Mandant:Person:Typ:Kanal` und `startAfter` = 60 s. Solange ein Job wartet, gehen weitere gleichartige Ereignisse in ihm auf; der Job stellt alle noch offenen Hinweise als eine Nachricht zu ("3 Änderungen im Stundenplan").
- **Einstellungen:** `NotificationPreference` je Typ und Kanal (Standard laut Spec-Tabelle), Ruhezeiten als eigene Zeile (`type = quiet`). In Ruhezeiten wird der Job auf das Ende verschoben. Die Liste in der App ist immer befüllt.
- **Texte** (Push, E-Mail, Liste) stehen zentral in `@sp/shared/notifications.ts` (de-AT), ohne Namen oder Noten.
- **Zustellung:** Als zugestellt gilt ein Hinweis erst nach erfolgreichem Versand; scheitern alle Geräte, wiederholt pg-boss mit steigendem Abstand. Push-Abos mit 404/410 werden gelöscht. Web-Push über `web-push` (VAPID, Schlüssel je Umgebung: `pnpm --filter @sp/api vapid`).
- **E-Mail:** React-Email-Vorlagen (`apps/api/src/modules/mail/templates.tsx`), Versand über die Queue mit verschlüsseltem Inhalt (Einladungs- und Reset-Links sind Geheimnisse). Ohne laufende Queue (Tests) direkt.
- `QueueService` ist die einzige Stelle, die pg-boss startet; Fachmodule melden ihre Queues in `onModuleInit` an.

## Abwesenheit

- **Ergänzung zur Spec:** Status `OPEN` (aus dem Klassenbuch, Entschuldigung ausständig) und Feld `origin` (`CLASSBOOK`/`REPORT`). Ohne `OPEN` wäre eine Fehlzeit aus dem Klassenbuch vor Ablauf der Frist nicht von einer Elternmeldung zu unterscheiden.
- Klassenbuch-Änderungen berechnen die offenen Fehlzeiten des Tages neu; Meldungen und Entscheidungen werden nie verändert.
- Entschuldigen dürfen Eltern mit `canExcuse`, Schüler:innen ab `settings.ageLimits.selfExcuseFrom` und die Administration. Ab `attachmentRequiredFromDays` Tagen wird die fehlende Bestätigung angezeigt.
- Täglicher Job 06:30: Erinnerungen nach `settings.absence.reminderAfterDays` (Standard 1 und 4 Tage), nach `excuseDeadlineDays` `UNEXCUSED`.
- **Uploads:** Typ am Inhalt erkannt (JPEG, PNG, WebP, HEIC, PDF), höchstens 5 MB, Virenscan über clamd (`CLAMAV_URL`; in Produktion Pflicht, lokal optional `docker compose --profile scan`), Ablage im S3-Speicher, nur signierte Links (120 s).

## Supplierung

- Lehrkräfte melden nur sich selbst und nur Krankheit/Sonstiges; Freistellungen trägt die Direktion ein (Genehmigung AB-06 folgt in V1). Neue Aktionen in der Rechte-Matrix: `teacherAbsence.report`, `exam.read`.
- Eine Lehrerabwesenheit erzeugt offene Supplierungen für betroffene künftige Termine (auch nächtlich nach der Terminerzeugung). Termine bleiben bis zum Veröffentlichen unverändert.
- Vorschläge: frei (kein Unterricht, keine Abwesenheit, keine andere Zuweisung zur selben Zeit), sortiert nach "unterrichtet das Fach", "unterrichtet die Klasse", Fairness-Zähler (veröffentlichte Vertretungen und Betreuungen im Schuljahr), Name (`rankSuggestions`).
- Ergänzung: `POST /substitutions` für Änderungen ohne Abwesenheit (Entfall wegen Ausflug, Raumwechsel).
- Rücknahme: Entfällt die Abwesenheit oder die Supplierung, wird ein veröffentlichter Termin auf den Plan zurückgesetzt und als Korrektur gemeldet.
- Echtzeit-Ereignisse über NOTIFY sind auf 8000 Byte begrenzt: bei großen Empfängerkreisen geht das Ereignis an die ganze Schule (nur Ids).

## Weitere Entscheidungen

- Profil (PL-03): Farbschema als Cookie `sp_theme` (ohne Personenbezug, verhindert Flackern), Sprache vorerst nur de-AT, Geräteliste mit "abmelden" und "überall abmelden".
- Formulare mit Zugangsdaten senden per POST: auch vor dem Laden von JavaScript landen Passwörter und Codes nie in der URL.
- E2E-Läufe schalten die Ratenbegrenzung über `SP_E2E_NO_RATELIMIT` ab (viele Anmeldungen von einer IP); nie in Betrieb setzen.
