# ADR 0021: Digitale Einverständniserklärungen (KO-05)

Status: angenommen (2026-10-15)

## Kontext

Für Ausflüge, Schikurse, Schwimmunterricht oder Fotos geht heute ein Zettel nach Hause, der unterschrieben
zurückkommen soll. Die Lehrkraft sammelt, zählt und fragt nach. KO-05 ersetzt das durch eine Bitte in der App,
die Eltern mit einem Tap beantworten.

## Entscheidung

1. **Wer verschickt:** Lehrkräfte für Schüler:innen ihrer Klassen (aus dem veröffentlichten Stundenplan),
   Klassenvorstand für die eigene Klasse, Direktion und Administration für alle (`consentForm.manage`).
   Ausgewählt werden ganze Klassen oder einzelne Schüler:innen (z. B. nur die Teilnehmenden am Schikurs).
2. **Eine Antwort je Kind** (`ConsentFormAnswer`, beim Verschicken festgehalten wie bei Rundschreiben): Ja oder
   Nein, optional mit Anmerkung (z. B. Allergien). Jeder verknüpfte Elternteil darf antworten
   (`consentForm.answer`, eigene Kinder); die letzte Antwort gilt und zeigt, wer wann geantwortet hat. Bis zur
   Frist (einschließlich) lässt sie sich ändern.
3. **Papier bleibt möglich:** Für Kinder ohne Eltern mit Konto (oder wenn der Zettel doch zurückkommt) trägt die
   Lehrkraft die Antwort nach, gekennzeichnet als "Papier"; auch nach der Frist. Eine Antwort aus der App
   überschreibt sie nicht.
4. **Erinnerung:** manuell höchstens einmal in 20 Stunden, automatisch am Tag vor der Frist (Job
   `consent-forms-daily`, 17 Uhr) an die Eltern offener Kinder. Benachrichtigungen `consent.requested` und
   `consent.reminder` ohne Namen und Inhalt, standardmäßig per Push und E-Mail.
5. **Sichtbarkeit:** Wer verschickt hat, sieht alle Antworten; Lehrkräfte und Klassenvorstand sehen die Kinder
   ihrer Klassen, Direktion und Administration alle. Schüler:innen sehen nichts davon.
6. **Abschließen** (wer verschickt hat, Direktion, Administration) beendet Antworten in der App.
7. **Datenschutz:** Antworten stehen im Datenexport (über das Kind und als Elternteil). Beim Anonymisieren
   werden Antworten über das Kind gelöscht; als Elternteil gegebene Antworten verlieren Namen und Anmerkung.

## Folgen

- Eltern sehen offene Erklärungen unter "Heute" und unter "Einverständnis".
- Anhänge (z. B. ein PDF mit Details) und Vorlagen folgen mit KO-03.
- Schüler:innen ab 14 bestätigen derzeit nicht selbst; das hängt an der offenen juristischen Prüfung (ADR 0020).
