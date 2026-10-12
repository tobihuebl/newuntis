# Ausfall des Push-Dienstes

Web-Push läuft über die Dienste der Browser-Hersteller (Google FCM, Apple, Mozilla). Fällt einer aus oder lehnt
er ab, kommen Hinweise verspätet oder gar nicht an. Die Liste in der App und der Echtzeit-Stream sind nicht betroffen.

## Erkennen

- Metrik `sp_push_total{result="failed"}` steigt, Warnung > 20 % über 15 Minuten.
- `sp_jobs_ready{queue="notify"}` wächst (Wiederholungen mit steigendem Abstand, bis zu 6 Versuche).
- Logs der API: "Push fehlgeschlagen (Status)".

## Einordnen

| Status | Bedeutung | Maßnahme |
| --- | --- | --- |
| 404/410 | Abo ungültig (App gelöscht, Berechtigung entzogen) | nichts, das Abo wird automatisch gelöscht |
| 401/403 | VAPID-Schlüssel passen nicht | Umgebung prüfen: dieselben Schlüssel wie bei der Anmeldung der Geräte? Schlüssel nie wechseln, sonst müssen alle Geräte Push neu einschalten |
| 413 | Nachricht zu groß | Fehler im Code melden (Texte sind kurz, darf nicht vorkommen) |
| 429/5xx/Netz | Dienst überlastet oder gestört | abwarten, pg-boss wiederholt; Statusseiten der Anbieter prüfen |

## Überbrücken

- Wichtiges (Entfall am nächsten Morgen) zusätzlich als Rundschreiben mit Lesebestätigung schicken: Pflichtmitteilungen
  gehen immer auch per E-Mail.
- Schulen informieren: Hinweise erscheinen weiterhin in der App unter der Glocke.
- Nach mehr als 48 Stunden werden alte Hinweise nicht mehr gepusht (bewusst, damit keine veralteten Meldungen kommen).

## Nachbereitung

Ursache, Dauer und betroffene Schulen im Betriebsprotokoll festhalten; bei Schlüsselproblemen die Umgebung korrigieren.
