# ADR 0009: Kommunikation, Lagebild, Datenschutz und Pilotreife (M6)

Status: akzeptiert (M6)

## Nachrichten (KO-01)

- **Wer wem schreibt** entscheidet die Aktion `message.send` der Rechte-Matrix, die Empfängerliste berechnet `allowedRecipients` (apps/api/src/modules/messages/recipients.ts):
  - Direktion und Administration: alle Erreichbaren der Schule.
  - Lehrkräfte und Klassenvorstand: alle Lehrkräfte und die Verwaltung, dazu Schüler:innen und Eltern der Klassen, die sie unterrichten bzw. führen.
  - Eltern (`TO_TEACHERS`): Lehrkräfte und Klassenvorstand der Klassen ihrer Kinder sowie die Direktion.
  - Schüler:innen: kein neues Gespräch. Sie antworten in Gesprächen, in die eine Lehrkraft sie aufgenommen hat (die Matrix verbietet nur "an Klasse oder Eltern senden").
  - Erreichbar ist, wer ein Konto (eingeladen oder aktiv) hat, nicht anonymisiert ist und keine Einschränkung der Verarbeitung hat.
- **Nachricht an eine Klasse** legt je Familie ein eigenes Gespräch an (Eltern eines Kindes gemeinsam, `aboutStudentId`), bzw. je Schüler:in. Antworten bleiben privat; Eltern sehen nie die Adressen anderer Eltern. Das ersetzt die WhatsApp-Klassengruppe ohne deren Datenschutzproblem. Mehrere einzeln gewählte Personen ergeben ein gemeinsames Gespräch.
- Gelesen-Stand über `ThreadParticipant.lastReadAt`; Ungelesen-Zähler per SQL (eigene Nachrichten zählen nicht). `Thread.lastMessageAt` sortiert den Posteingang.
- Keine Anhänge und Vorlagen im MVP (KO-03 ist V1). Push-Text ohne Inhalt und Namen ("Eine neue Nachricht ist eingegangen.").

## Rundschreiben (KO-02)

- Zielgruppe `audience = { roles, classIds, groupIds }` (Rollen: Schüler:innen, Eltern, Lehrkräfte); ohne Klassen und Gruppen gilt die ganze Schule.
- **Ergänzung zur Spec:** `AnnouncementRead` hält je Empfänger:in eine Zeile, angelegt bei der Veröffentlichung (`readAt` leer = ungelesen). So bleibt die Statistik "x von y gelesen" stabil, auch wenn sich Klassen später ändern. `Announcement` erhält `createdById` und `remindedAt`.
- Mit Lesebestätigung: Typ `announcement.required` – Push und E-Mail sind **Pflichtkanäle** (`MANDATORY_CHANNELS`), nicht abschaltbar; Ruhezeiten gelten. Erinnerung an Ausstehende manuell (höchstens einmal in 20 h) und einmal automatisch nach `settings.communication.announcementReminderAfterDays` (Job täglich 17:00).
- Ohne Lesebestätigung gilt das Öffnen als gelesen.

## Lagebild und Auswertungen (DB-02, DB-03)

- `GET /dashboard/principal?date` nur mit schulweitem Geltungsbereich (`hasScope(user, 'reports.read', 'ALL')`). Karten: fehlende Lehrkräfte, offene Supplierungen, Entfall, fehlende Klassenbuch-Einträge (letzte 7 Tage, beendet, nicht abgeschlossen), abwesende Schüler:innen, offene Entschuldigungen; dazu der Zeitstrahl der betroffenen Stunden.
- `GET /reports/attendance` (je Klasse, mit `classId` je Schüler:in; Klassenvorstand nur für die eigene Klasse, wird protokolliert) und `GET /reports/substitutions` (Vertretungs-, Betreuungs- und Ausfallstunden je Lehrkraft). `format=csv` liefert Excel-taugliches CSV (Strichpunkt, UTF-8 mit BOM, Schutz vor Formel-Injektion). PDF-Berichte (DB-03) folgen in V1.

## Datenschutz

- **Export** (`GET /me/export`, `GET /admin/privacy/persons/:id/export`) als JSON und PDF (react-pdf, Standardschrift ohne externe Quellen) mit derselben Gliederung. Enthält nur Daten der Person selbst (keine Nachrichten anderer).
- **Anfragen** (`PrivacyRequest`: Auskunft, Berichtigung, Löschung, Einschränkung) unter `/admin/datenschutz`. Löschung = Anonymisierung (gemeinsame Funktion `anonymizePerson`, entfernt jetzt auch Benachrichtigungen). Einschränkung setzt `Person.restrictedAt`: keine Nachrichten, Rundschreiben oder Benachrichtigungen mehr; die Daten bleiben.
- **Aufbewahrung** (Job täglich 03:30) nach `settings.retention`: Nachrichten und Rundschreiben, Anhänge (auch im S3-Speicher), Fehlzeiten, Benachrichtigungen (neu, Standard 180 Tage) und Protokoll. Klassenbuch und Anwesenheit bleiben als Schulunterlagen.
- **Audit-Log bleibt nur anhängbar:** Löschen nach Frist ausschließlich über die Datenbankfunktion `prune_audit_log(cutoff)` (SECURITY DEFINER, nur gesetzter Mandant, nie jünger als 90 Tage). Die Mindestfrist ist auch im Schema verankert.
- **Einführung** nach dem ersten Login (`/willkommen`): Kenntnisnahme des Datenschutzhinweises als `Consent` (Art, Version, Zeitpunkt), Push-Einrichtung mit iOS-Anleitung in zwei Schritten und E-Mail als Rückfall, kurze Hinweise je Rolle. Neue Fassung (`PRIVACY_NOTICE_VERSION`) fragt erneut.

## Schuleinstellungen

- **Ergänzung zur Spec:** `GET/PATCH /admin/settings` (lesen `masterdata.read`, ändern `masterdata.write`) und Seite `/admin/einstellungen`. Fristen und Grenzwerte sind laut Spec "pro Schule konfigurierbar"; bisher ging das nur über die Datenbank. `sp_app` hat weiterhin kein UPDATE auf `Tenant`; gespeichert wird über `update_tenant_settings(jsonb)` (SECURITY DEFINER, nur der gesetzte Mandant), geprüft mit `tenantSettingsSchema`. Teiländerungen ersetzen ganze Abschnitte.

## Pilotreife

- **Web-Härtung:** Content-Security-Policy mit Nonce je Anfrage (`apps/web/proxy.ts`, `'strict-dynamic'`, keine Fremdquellen, `frame-ancestors 'none'`), dazu HSTS (Produktion), COOP/CORP, Permissions-Policy. Die API ist nicht öffentlich (nur über die Web-App bzw. Caddy) und setzt eigene Header über helmet.
- **Ratenbegrenzung pro IP und Nutzer:** Routen mit `@RateLimit` zählen je IP und zusätzlich je Sitzung; alle anderen Routen haben ein Grundlimit je Sitzung (Lesen 1200, Schreiben 300 je 5 Minuten).
- **Überwachung:** `GET /metrics` (Prometheus-Textformat, Bearer `METRICS_TOKEN`, ohne Token aus): Anfragen je Statusklasse, Push- und E-Mail-Ergebnisse, Job-Rückstau je Queue. Keine Pfade, Ids oder Namen in Labels.
- **Betrieb:** Dockerfiles für API und Web, Caddy als TLS-Proxy, Compose-Datei für einen EU-Server, Runbooks in `docs/runbooks/`, Datenschutz-Dokumente als Entwurf in `docs/datenschutz/`, Lasttest mit k6 in `loadtest/`.
- **Neue Routen** für Lehrkräfte (`/klassen`, `/klassen/[id]`, `/raeume`), Direktion (`/freigaben` für Stundenplan-Entwürfe) und Administration (`/admin/rollen` mit Rechte-Matrix, `/admin/einstellungen`).
