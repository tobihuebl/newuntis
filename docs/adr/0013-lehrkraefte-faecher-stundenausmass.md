# ADR 0013: Fächer und Stundenausmaß von Lehrkräften

Status: angenommen (2026-10-14)

## Kontext

Für die Lehrfächerverteilung und den Stundenplan-Assistenten (M7) fehlte, welche Fächer eine Lehrkraft unterrichten
kann und in welchem Ausmaß sie beschäftigt ist. Beispiel: Eine Lehrkraft arbeitet 20 Wochenstunden, davon sind 10
Unterricht an der Schule. Ohne diese Angaben lässt sich nicht prüfen, ob die Lehrfächerverteilung eine Lehrkraft
über- oder unterplant.

## Entscheidung

1. **Zwei Stundenwerte an der Person:** `employmentHours` (Beschäftigungsausmaß laut Vertrag) und `teachingHours`
   (davon Unterricht, Soll je Woche). Ganze oder halbe Stunden, Unterricht höchstens so viel wie die Beschäftigung.
   Beide sind optional; ohne Wert entfällt die Prüfung.
2. **Fächer als eigene Tabelle `TeacherSubject`** (mit `tenantId` und RLS). Leere Liste heißt "nicht gepflegt", nicht
   "darf nichts unterrichten".
3. **Hinweise statt Sperren:** Abweichungen vom Soll und Fächer ohne Lehrbefähigung erscheinen als Hinweise (CSV-Import
   der Lehrfächerverteilung, Abschnitt "Auslastung der Lehrkräfte" im Assistenten, Personen-Ansicht mit dem Ist laut
   veröffentlichtem Stundenplan). Schulen planen in der Praxis auch fachfremd oder mit Mehrdienstleistungen.
4. **Der Solver ändert nichts an der Zuteilung:** Welche Lehrkraft welche Stunden hat, steht in der
   Lehrfächerverteilung. Das Stundenausmaß prüft diese Zuteilung, nicht die Lage im Raster.
5. **Supplier-Vorschläge** zählen ein Fach als passend, wenn es hinterlegt ist oder die Lehrkraft es im Stundenplan
   unterrichtet.
6. **Werte gelten für die Person, nicht je Schuljahr.** Der Schuljahreswechsel-Assistent (SD-05) soll sie zur Prüfung
   vorlegen.
7. Pflege über `PUT /admin/persons/:id/teaching` (`masterdata.write`); Lesen mit `masterdata.read`. Anonymisieren
   entfernt Fächer und Stunden.

## Folgen

- Personen-CSV-Import kennt die neuen Felder noch nicht; Pflege einzeln in der Personen-Ansicht.
- Werteinheiten oder Lehrverpflichtungsgruppen (unterschiedlich gewichtete Fächer) sind nicht abgebildet; gezählt wird
  in Wochenstunden.
