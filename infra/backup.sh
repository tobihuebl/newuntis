#!/usr/bin/env bash
# Tägliche, verschlüsselte Datenbank-Sicherung (Spec Abschnitt 13, Betrieb). Läuft auf dem Server per cron:
#   15 2 * * * /opt/schulplattform/infra/backup.sh >> /var/log/schulplattform-backup.log 2>&1
# Braucht: docker, age (Verschlüsselung), aws-cli (S3-kompatibler EU-Speicher, z. B. Hetzner Object Storage).
# Umgebung: BACKUP_AGE_RECIPIENT (öffentlicher age-Schlüssel), BACKUP_BUCKET (s3://…), BACKUP_S3_ENDPOINT,
#           BACKUP_KEEP_DAYS (Standard 30). Der private age-Schlüssel liegt NICHT auf dem Server.
set -euo pipefail
cd "$(dirname "$0")"
: "${BACKUP_AGE_RECIPIENT:?fehlt}" "${BACKUP_BUCKET:?fehlt}" "${BACKUP_S3_ENDPOINT:?fehlt}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
FILE="/tmp/schulplattform-${STAMP}.dump.age"

docker compose -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d schulplattform -Fc' \
  | age -r "$BACKUP_AGE_RECIPIENT" -o "$FILE"

aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 cp "$FILE" "${BACKUP_BUCKET}/db/"
rm -f "$FILE"

# Alte Sicherungen löschen
CUTOFF="$(date -u -d "-${KEEP_DAYS} days" +%Y-%m-%d 2>/dev/null || date -u -v-"${KEEP_DAYS}"d +%Y-%m-%d)"
aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 ls "${BACKUP_BUCKET}/db/" | while read -r _ _ _ name; do
  day="${name#schulplattform-}"; day="${day:0:10}"
  if [[ "$day" < "$CUTOFF" ]]; then
    aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 rm "${BACKUP_BUCKET}/db/${name}"
  fi
done
echo "Sicherung ${STAMP} abgeschlossen"
