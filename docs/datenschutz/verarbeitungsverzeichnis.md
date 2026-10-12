# Verarbeitungsverzeichnis (Entwurf, Art. 30 DSGVO)

Verantwortliche: die Schule (Name, Anschrift, Kontakt, Datenschutzbeauftragte:r eintragen).
Auftragsverarbeiter: Betreiber der Schulplattform (Name, Anschrift eintragen).

| Verarbeitung | Zweck | Betroffene | Datenkategorien | Empfänger | Speicherdauer (Standard, je Schule einstellbar) |
| --- | --- | --- | --- | --- | --- |
| Benutzerkonten | Anmeldung, Rechteverwaltung | Schüler:innen, Eltern, Lehrkräfte, Verwaltung | Name, E-Mail, Rollen, Passwort-Hash (Argon2id), 2FA-Geheimnis (verschlüsselt), Geräte/Sitzungen | Schule | bis Austritt, danach Anonymisierung |
| Stammdaten | Schulorganisation | Schüler:innen, Eltern, Lehrkräfte | Name, Geburtsdatum, Schülernummer, Klasse, Gruppen, Eltern-Kind-Verknüpfung | Schule | bis Austritt, danach Anonymisierung |
| Stundenplan und Supplierung | Unterrichtsorganisation | Lehrkräfte, Klassen | Unterrichtszuteilung, Abwesenheiten von Lehrkräften (Art: krank/Fortbildung/…), Vertretungen | Schule, betroffene Klassen | Schuljahr + gesetzliche Fristen |
| Klassenbuch | Dokumentation des Unterrichts | Schüler:innen, Lehrkräfte | Anwesenheit, Verspätung, Stoff, Hausübung, Notizen | Lehrkräfte der Klasse, Klassenvorstand, Direktion; Eltern/Schüler:innen nur eigene Anwesenheit | gesetzliche Aufbewahrung (Schulunterlagen) |
| Fehlzeiten und Entschuldigungen | Nachweis und Entschuldigung von Abwesenheiten | Schüler:innen, Eltern | Zeitraum, Grund (Auswahl, Freitext), optional Foto/PDF einer Bestätigung, Entscheidung | Klassenvorstand, Direktion, Administration | Fehlzeiten 5 Jahre, Anhänge 1 Jahr |
| Prüfungskalender | Planung von Prüfungen | Klassen | Datum, Fach, Art | Klasse, Eltern | Schuljahr |
| Nachrichten und Rundschreiben | Kommunikation Schule–Eltern–Schüler:innen | alle Rollen | Inhalt, Absender, Empfänger, Lesestatus/Lesebestätigung | Teilnehmende | 1 Jahr |
| Benachrichtigungen | Hinweise per App, Push, E-Mail | alle Rollen | Art des Hinweises, Zeitpunkt, Push-Abo (Geräteadresse) | Push-Dienste der Browser (nur verschlüsselter Hinweis ohne Namen) | 180 Tage |
| Protokoll (Audit-Log) | Nachvollziehbarkeit, Sicherheit | alle Nutzer:innen | Aktion, Zeitpunkt, handelnde Person, betroffener Datensatz (Id) | Direktion, Administration | 3 Jahre (mindestens 90 Tage) |
| Einwilligungen/Kenntnisnahmen | Nachweis | alle Nutzer:innen | Art, Fassung, Zeitpunkt | Schule | bis Austritt |

Rechtsgrundlagen (zu prüfen): Art. 6 Abs. 1 lit. c und e DSGVO in Verbindung mit dem Schulunterrichtsgesetz und
dem Bildungsdokumentationsgesetz; Push freiwillig (lit. a bzw. berechtigtes Interesse an der Zustellung).
Technische und organisatorische Maßnahmen: siehe [tom.md](tom.md).
