# ADR 0005: Stammdaten, Eltern-Codes und CSV-Import (M2)

Status: akzeptiert (M2)

## Datenmodell

- **`Person.email`** (neu): Kontakt- und Einladungsadresse. Die Konto-E-Mail steht weiter in `User`. Nötig, damit Importe und Einladungen funktionieren, bevor ein Konto existiert. Kein Unique-Index (Eltern teilen sich teils eine Adresse).
- **`GuardianCode`** (neu): Einladungscode je Kind für den Elternbrief (SD-04). Nur der SHA-256-Hash liegt in der Datenbank, der Klartext erscheint einmal bei der Erzeugung. Format `XXXX-XXXX-XX` ohne verwechselbare Zeichen (31 Zeichen, 10 Stellen, etwa 49 Bit), standardmäßig 30 Tage gültig und höchstens zweimal einlösbar (zwei Erziehungsberechtigte). Einlösen ist ratenbegrenzt.
- Eltern ohne Konto lösen den Code auf `/eltern-code` ein und legen dabei Konto und Verknüpfung an; angemeldete Eltern fügen mit `POST /me/guardian-codes/redeem` weitere Kinder hinzu.

## Regeln

- **Löschen = Anonymisieren** (Spec Abschnitt 8): Name und Kontaktdaten werden ersetzt, Konto, Einladungen, Codes, Push- und Kalender-Tokens und Rollen entfernt. Das eigene Konto und die letzte Administration sind geschützt.
- **Klassenvorstand** ergibt sich aus `SchoolClass.homeroomTeacherId`; die Rollenzuordnung `HOMEROOM` wird bei jeder Änderung nachgeführt. `extraRoles` einer Person (`PRINCIPAL`, `ADMIN`) lassen sich nur dort ändern; der eigene Admin-Zugang und die letzte Administration können nicht entzogen werden.
- **Enden von Gültigkeiten:** Einschreibungen und Eltern-Verknüpfungen enden "gestern", weil `toDate`/`validTo` einschließlich gilt. Ein Widerruf wirkt dadurch sofort.
- **Raster:** Stundennummern sind eindeutig (409), Zeiten dürfen sich nicht überlappen und müssen mit der Nummer aufsteigen (400).
- Direktion liest alle Stammdaten (`masterdata.read`), die Oberfläche zeigt sie ohne Schaltflächen zum Ändern. Lesende Zugriffe auf Personen werden im Audit-Log protokolliert (`person.read`).

## CSV-Import (SD-03)

- **Eigenes Format statt Sokrates/WebUntis**: Es liegen keine Beispieldateien vor (Spec: Import-Formate erst klären, wenn eine Schule Testdaten liefert). Spalten: Vorname, Nachname, Rolle, Klasse, E-Mail, Schülernummer, Geburtsdatum, bei Eltern Kind-Schülernummer.
- **Tolerant beim Einlesen:** Trennzeichen (`;` `,` Tab) und Zeichensatz (UTF-8, sonst Windows-1252, entschieden im Browser) werden erkannt, Spaltennamen über Aliase (`IMPORT_ALIASES` in `@sp/shared`), nicht erkannte Pflichtspalten lassen sich in der Vorschau zuordnen. Neue Aliase für echte Exporte sind eine kleine Ergänzung.
- **Vorschau und Übernehmen teilen dieselbe Prüfung** (`analyze`); beim Übernehmen wird die Datei neu geprüft, nie die Vorschau des Clients vertraut. Fehler blockieren das Übernehmen (422 mit Vorschau), außer "Fehlerhafte Zeilen überspringen". Alles geschieht in einer Transaktion (alles oder nichts, 120 s Zeitlimit).
- **Wiederholbar:** Schüler werden über Schülernummer (sonst Name und Geburtsdatum) gefunden, Lehrer und Eltern über E-Mail (sonst eindeutigen Namen). Leere Felder überschreiben nichts. Dieselbe Datei erneut ergibt "unverändert".
- **Einladungen** werden nach dem Übernehmen gesendet (nicht in der Transaktion), derzeit direkt über SMTP; mit pg-boss (M5) laufen sie später im Hintergrund. Schüler:innen erhalten keine Einladung per Import.
- **Grenzen:** 5 MB je Datei (Fastify `bodyLimit` 6 MB), Vorschau zeigt höchstens 500 Zeilen, die Klassenvorstand-Auswahl lädt höchstens 100 Lehrkräfte (Suchfeld folgt, wenn eine Schule mehr hat).

## Entwicklung

- **Migrationen:** `REVOKE ... "_prisma_migrations"` in der M1-Migration war nicht in Prismas Shadow-Datenbank lauffähig und ist jetzt in einen Existenz-Check gefasst, damit `prisma migrate dev` wieder funktioniert. Bei bestehenden Datenbanken gleicht man die Prüfsumme in `_prisma_migrations` an (einmalig, für die lokale Dev-DB bereits geschehen).
