# Unterauftragsverarbeiter (Entwurf)

Nur Anbieter mit Verarbeitung in der EU/im EWR, keine Drittlandübermittlung. Die konkrete Auswahl steht vor dem
Pilotstart fest; die Liste wird der Schule vor jeder Änderung mitgeteilt (Widerspruchsrecht laut AVV).

| Zweck                                | Anbieter (Vorschlag)                                          | Ort                  | Daten                                                                   | Grundlage         |
| ------------------------------------ | ------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------- | ----------------- |
| Server, Datenbank                    | Hetzner Online GmbH                                           | Deutschland/Finnland | alle Plattformdaten (verschlüsselte Datenträger)                        | AVV des Anbieters |
| Dateispeicher (Anhänge, Sicherungen) | Hetzner Object Storage                                        | Deutschland          | Fotos/PDF von Bestätigungen, verschlüsselte Datenbank-Sicherungen       | AVV des Anbieters |
| E-Mail-Versand                       | EU-SMTP-Anbieter (z. B. mit Sitz und Rechenzentrum in der EU) | EU                   | E-Mail-Adresse, Betreff und Text von Hinweisen (ohne Namen von Kindern) | AVV des Anbieters |
| Verfügbarkeitsprüfung                | EU-Anbieter                                                   | EU                   | keine Personendaten (nur Aufruf der Login-Seite)                        | –                 |

**Nicht Unterauftragsverarbeiter, aber zu nennen:** Web-Push läuft technisch über die Push-Dienste der
Browser-Hersteller (Google, Apple, Mozilla). Übermittelt werden nur ein verschlüsselter Hinweis ohne Namen und
Inhalt ("Eine neue Nachricht ist eingegangen.") und die Geräteadresse des Abos. Die Nutzung ist freiwillig und wird
pro Gerät eingeschaltet; ohne Push gibt es Hinweise in der App und per E-Mail.

Keine Tracker, keine externen Schriften oder CDNs, keine Analyse-Dienste.
