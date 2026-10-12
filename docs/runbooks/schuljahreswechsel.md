# Schuljahreswechsel

Der Assistent (SD-05) kommt in V1. Bis dahin in dieser Reihenfolge, am besten in den Sommerferien:

1. **Neues Schuljahr anlegen** (`/admin/schuljahr`): Name, Beginn, Ende, Ferien und schulfreie Tage. Noch nicht als
   aktuell markieren.
2. **Klassen** des neuen Schuljahres anlegen (`/admin/klassen`), Klassenvorstände zuordnen.
3. **Schüler:innen** umschreiben: per CSV-Import (Spalte Klasse = neue Klasse) oder je Person; Abgänger:innen
   bekommen ein Austrittsdatum (Einschreibung "bis gestern"). Neue Schüler:innen und Eltern einladen.
4. **Gruppen** (Wahlfächer, Teilungen) neu anlegen und befüllen.
5. **Stundenplan**: neue Version für das neue Schuljahr (als Kopie der alten möglich), prüfen, Gültig-ab = erster
   Schultag, veröffentlichen. Die alte Version wird ab diesem Datum archiviert.
6. Am ersten Schultag das neue Schuljahr als **aktuell** markieren.
7. **Aufräumen** nach den Aufbewahrungsfristen erledigt der tägliche Job; Personen ohne Schulbezug (Abgänger:innen,
   Eltern ohne Kinder) auf Wunsch anonymisieren (`/admin/datenschutz`).
8. Kurz prüfen: Heute-Ansicht einer Lehrkraft und eines Elternteils am ersten Schultag.
