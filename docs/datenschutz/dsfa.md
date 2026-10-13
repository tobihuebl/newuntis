# Datenschutz-Folgenabschätzung (Entwurf, Art. 35 DSGVO)

> Die Verarbeitung betrifft Daten Minderjähriger in größerem Umfang (Anwesenheit, Fehlzeiten, Kommunikation). Eine DSFA
> ist daher voraussichtlich erforderlich. Dieser Entwurf liefert die technische Grundlage; die Bewertung erfolgt durch
> die Schule bzw. den Schulerhalter.

## Beschreibung

Digitale Schulverwaltung: Stundenplan, Klassenbuch (Anwesenheit, Stoff, Hausübung), Abwesenheiten mit Entschuldigung,
Supplierung, Prüfungskalender, Nachrichten und Rundschreiben, Benachrichtigungen. Details:
[Verarbeitungsverzeichnis](verarbeitungsverzeichnis.md).

## Notwendigkeit und Verhältnismäßigkeit

- Zweckbindung: nur Schulorganisation und gesetzlich vorgesehene Dokumentation; keine Werbung, kein Profiling.
- Datenminimierung: Rechte je Rolle und Zuordnung; Eltern sehen nur eigene Kinder, Lehrkräfte nur eigene Klassen;
  Nachrichten an Klassen als Einzelgespräche je Familie (keine Offenlegung anderer Eltern).
- Speicherbegrenzung: Fristen je Datentyp, Löschjob, Anonymisierung.
- Betroffenenrechte: Selbstauskunft im Profil, Anfragen über die Administration.

## Risiken und Maßnahmen

| Risiko                                                                                  | Eintritt/Schwere (vor Maßnahmen) | Maßnahmen                                                                                            | Restrisiko               |
| --------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------ |
| Unbefugter Zugriff auf Fehlzeiten oder Nachrichten (z. B. fremde Schule, fremde Klasse) | mittel/hoch                      | RLS je Mandant, Policy-Matrix mit automatischen Tests, 2FA für Personal, Protokoll lesender Zugriffe | gering                   |
| Kontoübernahme (Phishing, schwache Passwörter)                                          | mittel/hoch                      | Argon2id, Sperre bei Fehlversuchen, 2FA für Personal, Geräteliste, "überall abmelden"                | mittel (Eltern ohne 2FA) |
| Offenlegung über verlorene Geräte                                                       | mittel/mittel                    | Offline-Speicher nur wenige Tage, Löschen bei Abmeldung/Nichtnutzung, keine Anhänge offline          | gering                   |
| Gesundheitsdaten in Freitexten (Grund der Abwesenheit)                                  | mittel/mittel                    | Auswahl statt Freitext als Standard, Hinweis, Zugriff nur Klassenvorstand/Direktion, Fristen         | gering                   |
| Weitergabe an Dritte über Push                                                          | gering/mittel                    | Push-Texte ohne Namen und Inhalte, freiwillig je Gerät                                               | gering                   |
| Datenverlust                                                                            | gering/hoch                      | tägliche verschlüsselte Sicherung, Restore-Tests, Offline-Warteschlange                              | gering                   |
| Missbrauch durch Berechtigte                                                            | gering/mittel                    | Protokoll (nur anhängbar), Rechte nach Rolle, Kontrolle durch Direktion                              | gering                   |

## Ergebnis (vorläufig)

Mit den Maßnahmen ist das Restrisiko aus technischer Sicht vertretbar. Offene Punkte für die Bewertung: Altersgrenzen
für eigene Schülerzugänge, Einsatz von 2FA für Eltern (optional anbieten), Aufbewahrungsfristen laut Schulrecht.
