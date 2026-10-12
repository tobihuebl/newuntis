# Wiederherstellung (Backup und Restore)

## Sicherung

- Täglich 02:15 per cron: `infra/backup.sh` → `pg_dump -Fc`, verschlüsselt mit `age` (öffentlicher Schlüssel auf dem
  Server, privater Schlüssel offline bei zwei verantwortlichen Personen), abgelegt im EU-S3-Speicher, 30 Tage aufbewahrt.
- Zusätzlich empfohlen: Point-in-Time-Recovery mit WAL-Archivierung (z. B. `wal-g` in denselben Speicher) oder ein
  verwalteter Postgres-Dienst in der EU mit PITR.
- Dateien (Anhänge) liegen im S3-Speicher; dort Versionierung aktivieren.

## Restore (vollständig)

1. Wartungshinweis an die Schule(n); Web und API stoppen: `docker compose -f infra/docker-compose.prod.yml stop web api`.
2. Sicherung holen und entschlüsseln (auf einem Rechner mit dem privaten Schlüssel):
   `aws --endpoint-url $BACKUP_S3_ENDPOINT s3 cp $BACKUP_BUCKET/db/schulplattform-<Zeit>.dump.age .`
   `age -d -i key.txt -o restore.dump schulplattform-<Zeit>.dump.age`
3. Datenbank neu anlegen und einspielen:
   `docker compose … exec -T postgres dropdb -U $POSTGRES_USER schulplattform`
   `docker compose … exec -T postgres createdb -U $POSTGRES_USER schulplattform`
   `docker compose … exec -T postgres pg_restore -U $POSTGRES_USER -d schulplattform --no-owner < restore.dump`
4. Migrationen und Rolle `sp_app`: `docker compose … run --rm migrate` (setzt auch die Rechte neu).
5. Dienste starten, Stichprobe (Anmeldung, Heute, Klassenbuch), `restore.dump` sicher löschen.
6. Nach einem Restore auf einen älteren Stand: Lehrkräfte informieren, dass Offline-Einträge auf den Geräten
   automatisch erneut gesendet werden (Outbox, idempotent); Eltern-Meldungen seit dem Sicherungszeitpunkt fehlen.

## Monatlicher Test

Restore in eine Testumgebung (eigener Server oder lokal mit Docker), danach `pnpm e2e`-Stichprobe bzw. manuelle
Prüfung. Ergebnis mit Datum, Dauer und Auffälligkeiten im Betriebsprotokoll festhalten.
