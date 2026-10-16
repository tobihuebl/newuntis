# ADR 0024: Prüfungen und schulfreie Tage im Stundenplan

Status: angenommen (2026-10-16)

## Kontext

Schulfreie Tage erschienen im Plan nur als leerer Tag, ohne Grund. Prüfungen standen nur im Prüfungskalender und
unter "Heute" als Liste. In der Oberstufe dauern Schularbeiten oft drei bis vier Stunden; Untis zeigt sie als
Block mit goldenem Rahmen und dem Fach, die anderen Stunden der Klasse entfallen in dieser Zeit.

## Entscheidung

1. **Schulfreie Tage** stehen in der Plan-Antwort (`freeDays`, je Kalendertag mit Bezeichnung) und unter
   "Heute" (`freeDay`) und werden wie ein eigener Termin gezeigt: "Schulfrei · Herbstferien".
2. **Prüfungen mit Stunden:** Die Lehrkraft wählt beim Eintragen optional "von Stunde" und "bis Stunde"
   (`Exam.periodStart`, `periodCount`); ohne Angabe gilt die Prüfung wie bisher nur für den Tag.
3. **Verdrängung (Entscheidung der Schule: automatisch):** Termine der Klasse in diesen Stunden entfallen
   (`status CANCELLED`, `Occurrence.displacedByExamId`), außer dem Prüfungsfach selbst und Terminen mit
   Klassenbuch, Anwesenheit, Vermerken oder Supplierung. Ändern oder Löschen der Prüfung nimmt den Entfall zurück.
   Die betroffenen Lehrkräfte bekommen die Benachrichtigung "Stundenplan geändert". Neu erzeugte Termine
   (`generate`) und geplante Termine jenseits des Fensters werden ebenso behandelt.
4. **Anzeige:** Die Plan-Antwort enthält `exams` (Klassen- und Schülerpläne: Prüfungen der Klasse bzw. Gruppe;
   Lehrerpläne: selbst eingetragene). Mit Stunden erscheinen sie als Block mit goldenem Rahmen (`ring-signal`)
   und Fach, der die überdeckten Stunden der Klasse ersetzt; ohne Stunden als Hinweis am Tag. Verdrängte Stunden
   zeigen im Lehrerplan "Entfällt (Schularbeit M)".
5. **Handy:** Der Plan lässt sich zwischen Tagesliste und Wochenraster umschalten; die Wahl merkt sich das Gerät.

## Folgen

- Gruppen-Termine (z. B. Religion über mehrere Klassen) werden nicht verdrängt, nur Termine der Klasse.
- Eine Aufsicht statt Entfall trägt die Direktion wie bisher als Supplierung ein.
