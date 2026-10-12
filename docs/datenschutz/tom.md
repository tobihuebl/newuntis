# Technisch-organisatorische Maßnahmen (Entwurf, Art. 32 DSGVO)

## Vertraulichkeit

- **Zutritt/Zugang:** Server in zertifizierten EU-Rechenzentren; Administration nur per SSH-Schlüssel, Firewall nur 22/80/443.
- **Zugriff:** Rollen- und Rechtemodell (Matrix in `packages/shared/src/permissions.ts`), Rechte je Zuordnung
  (eigene Klassen, eigene Kinder). Mandantentrennung zusätzlich in der Datenbank (Row-Level-Security, Laufzeitrolle
  ohne Eigentümerrechte), automatisch für jeden Endpunkt getestet.
- **Anmeldung:** Passwörter mit Argon2id, Zwei-Faktor (TOTP) Pflicht für Lehrkräfte, Direktion und Administration,
  Sperre nach wiederholten Fehlversuchen, Sitzungsablauf bei Inaktivität, Geräteliste mit "überall abmelden".
- **Verschlüsselung:** TLS für alle Verbindungen (HSTS), verschlüsselte Datenträger, TOTP-Geheimnisse zusätzlich auf
  Anwendungsebene verschlüsselt, Sicherungen mit `age` verschlüsselt.
- **Trennung:** Test- und Entwicklungsdaten sind Demo-Daten; Produktionsdaten werden nicht in Testsysteme kopiert.

## Integrität

- Protokoll (Audit-Log) nur anhängbar: die Anwendung darf Einträge weder ändern noch löschen; Löschung nach Frist nur
  über eine geprüfte Datenbankfunktion (nicht jünger als 90 Tage).
- Lesende Zugriffe auf Personendaten, Fehlzeiten und Auswertungen werden protokolliert.
- Eingaben werden überall geprüft (Zod), Uploads nach Inhalt (nicht Endung) typgeprüft, auf Viren gescannt, nur über
  kurzlebige signierte Links abrufbar.
- Web-Härtung: Content-Security-Policy ohne Fremdquellen, CSRF-Schutz, Ratenbegrenzung pro IP und Nutzer.

## Verfügbarkeit und Belastbarkeit

- Tägliche verschlüsselte Sicherung, monatlicher Wiederherstellungstest ([Runbook](../runbooks/wiederherstellung.md)).
- Überwachung von Erreichbarkeit, Fehlerrate, Job-Rückstau und Push-Zustellung.
- Offline-Fähigkeit des Klassenbuchs (lokale Warteschlange, spätere Synchronisation).
- Lasttest vor dem Pilotstart (Stundenbeginn), Wartung außerhalb der Schulzeit.

## Datenminimierung und Löschung

- Push-Texte ohne Namen und Inhalte; Logs ohne Personendaten.
- Aufbewahrungsfristen je Datentyp, täglicher Löschjob; Löschung von Personen als Anonymisierung.
- Gerätespeicher (Offline) nur für die nächsten Tage, wird beim Abmelden und nach Nichtnutzung geleert; keine Anhänge offline.

## Organisation

- Betriebshandbuch (`docs/runbooks/`), Datenschutzanfragen über `/admin/datenschutz` mit Protokoll.
- Abhängigkeiten werden automatisch auf Schwachstellen geprüft (Dependabot, `pnpm audit` in der CI).
- Zugänge zu Server und Speicher nur für namentlich benannte Personen; halbjährliche Überprüfung.
