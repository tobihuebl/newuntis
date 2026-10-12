# Betrieb: Aufsetzen, Ausrollen, Überwachen

Zielbild (Spec Abschnitt 7 und 13): ein EU-Server (z. B. Hetzner, Rechenzentrum Falkenstein/Nürnberg/Helsinki),
Docker Compose mit Postgres, API, Web, ClamAV und Caddy (TLS). Dateien in einem S3-kompatiblen EU-Speicher
(z. B. Hetzner Object Storage), E-Mail über einen EU-SMTP-Anbieter.

## Erstes Aufsetzen

1. Server mit aktuellem Debian/Ubuntu, Docker und Compose-Plugin, verschlüsselte Datenträger, Firewall: nur 22, 80, 443.
2. DNS: je Schule ein Eintrag `schule.beispiel.at` → Server-IP (oder Wildcard `*.beispiel.at`).
3. Umgebungsdatei `/etc/schulplattform/env` (Rechte 600, gehört root) nach `.env.example` anlegen:
   - `DATABASE_URL` (Eigentümer, nur für Migrationen), `DATABASE_APP_URL` (Rolle `sp_app`, eigenes Passwort)
   - `POSTGRES_USER`, `POSTGRES_PASSWORD`
   - `SESSION_SECRET` (mind. 32 Zeichen), `ENCRYPTION_KEY` (32 Byte Base64, `openssl rand -base64 32`)
   - `APP_URL`, `API_URL=http://api:4000`, `BASE_DOMAIN` (z. B. `beispiel.at`)
   - `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` (`pnpm --filter @sp/api vapid`, einmal je Umgebung)
   - `SMTP_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
   - `METRICS_TOKEN` (mind. 24 Zeichen), `SCHOOL_HOSTS`, `ACME_EMAIL`
4. Images bauen (oder aus der CI laden):
   `docker build -f infra/Dockerfile --target api -t ghcr.io/tobihuebl/newuntis/api .` (ebenso `web`, `migrate`).
5. Datenbank und Migrationen:
   `docker compose -f infra/docker-compose.prod.yml up -d postgres`
   `docker compose -f infra/docker-compose.prod.yml run --rm migrate`
6. Dienste starten: `docker compose -f infra/docker-compose.prod.yml up -d`
7. Schule anlegen: `docker compose -f infra/docker-compose.prod.yml run --rm migrate pnpm tenant:create --name "…" --slug … --admin-email … --admin-first … --admin-last …`
8. Prüfen: `https://<schule>/login`, `docker compose … exec api node -e "fetch('http://127.0.0.1:4000/readyz').then(r=>r.text()).then(console.log)"`.
9. Backup einrichten (siehe [wiederherstellung.md](wiederherstellung.md)) und den ersten Restore-Test machen.

## Ausrollen einer neuen Version

Außerhalb der Schulzeit (werktags nach 17 Uhr oder am Wochenende).

1. Sicherung ziehen (`infra/backup.sh`).
2. Neue Images holen bzw. bauen, `IMAGE_TAG` setzen.
3. `docker compose … run --rm migrate` (Migrationen sind vorwärtsgerichtet; Rückweg = Restore).
4. `docker compose … up -d api web`; Health-Checks abwarten (`docker compose … ps`).
5. Stichprobe: Anmeldung, Heute, Klassenbuch einer Teststunde, Benachrichtigung.

## Überwachung

- **Verfügbarkeit von außen:** externer Check (EU-Anbieter) alle 1–5 Minuten auf `https://<schule>/login`.
- **Metriken:** `GET /metrics` der API mit `Authorization: Bearer $METRICS_TOKEN` (nur im internen Netz; bei Bedarf über einen eigenen Caddy-Pfad mit IP-Freigabe). Warnungen:
  - Fehlerrate: Anteil `sp_http_requests_total{status="5xx"}` > 1 % über 5 Minuten
  - Job-Rückstau: `sp_jobs_ready{queue="notify"}` > 500 oder über 15 Minuten steigend
  - Fehlgeschlagene Jobs: `sp_jobs_failed` steigt
  - Push: Anteil `sp_push_total{result="failed"}` > 20 % über 15 Minuten → [push-ausfall.md](push-ausfall.md)
  - E-Mail: `sp_mail_total{result="failed"}` steigt
- **Logs:** `docker compose … logs -f api` (pino/JSON, ohne Personendaten). Aufbewahrung der Logs höchstens 30 Tage.
- **Zeitgesteuerte Jobs** (Europe/Vienna): Termine 02:45 und nachts, Aufbewahrung 03:30, Fehlzeiten 06:30,
  offene Klassenbuch-Einträge werktags 15:00, Rundschreiben-Erinnerung 17:00.

## Lasttest vor dem Pilotstart

Gegen Staging mit Demo-Daten (nie gegen Produktion), siehe `loadtest/`:

```bash
LOAD_BASE_URL=https://demo.staging.beispiel.at LOAD_PASSWORD=… LOAD_READERS="…" LOAD_TEACHERS="mail:SECRET,…" node loadtest/sessions.mjs
docker run --rm -i --network host -v "$PWD":/w -w /w grafana/k6 run -e BASE_URL=https://demo.staging.beispiel.at -e SESSIONS=loadtest/sessions.json loadtest/stundenbeginn.js
```

Ziele: Lesen p95 < 200 ms, Klassenbuch speichern p95 < 300 ms, Fehlerrate < 1 %.

## Wartung

- Updates von Abhängigkeiten über Dependabot (wöchentlich), Sicherheitsupdates sofort.
- Betriebssystem-Updates monatlich außerhalb der Schulzeit.
- Monatlicher Restore-Test, halbjährlich Zugänge (Server, S3, SMTP) prüfen.
