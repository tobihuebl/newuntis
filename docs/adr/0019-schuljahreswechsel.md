# ADR 0019: Schuljahreswechsel (SD-05)

Status: angenommen (2026-10-14)

## Kontext

Zum Schuljahresende müssen Klassen ins neue Schuljahr übernommen werden. Nicht alle steigen auf: Wer die Stufe
nicht schafft, wiederholt; wer eine Wiederholungsprüfung hat, steigt vorläufig auf und entscheidet sich im Herbst
(gerade in der Oberstufe häufig); manche verlassen die Schule, die letzte Stufe schließt ab.

## Entscheidung

1. **Entscheidung je Schüler:in** (`PromotionDecision`, je endendem Schuljahr): steigt auf (Standard ohne Eintrag;
   in der letzten Stufe "schließt ab"), wiederholt, Wiederholungsprüfung, verlässt die Schule, optional mit
   Anmerkung (z. B. Beschluss der Klassenkonferenz). Eintragen: Klassenvorstand der Klasse, Direktion,
   Administration (`promotion.decide`). Fächer mit gewichtetem Durchschnitt über 4,5 erscheinen als Hinweis;
   entschieden wird in der Klassenkonferenz, nicht von der App.
2. **Stufe aus dem Klassennamen** (führende Zahl, "3A" → 3). Die höchste Stufe der Schule gilt als letzte Stufe.
   Folgeklasse als Vorschlag: Stufe plus eins ("2A" → "3A"); sie merkt sich ihre Vorgängerin
   (`SchoolClass.previousClassId`).
3. **Assistent der Administration** (`/admin/schuljahreswechsel`): Folgeklassen anlegen (Klassenvorstand auf
   Wunsch mitnehmen, neue erste Klassen dazu), Stand der Entscheidungen prüfen, Schüler:innen übernehmen. Ziele:
   aufsteigen und Wiederholungsprüfung → Folgeklasse; wiederholen → Klasse gleichen Namens im neuen Jahr, sonst
   gleiche Stufe; fehlt ein Ziel, wählt die Administration. Neue Einschreibung ab Beginn des neuen Schuljahres,
   die alte endet mit dem alten. Die Übernahme ist wiederholbar (Erledigte bleiben unverändert).
4. **Wiederholungsprüfung im Herbst:** Auf der Klassenseite der neuen Klasse "bestanden" oder "nicht bestanden";
   nicht bestanden wechselt ab sofort in eine Klasse der bisherigen Stufe.
5. **Umstellen des Schuljahres** (aktuelles Schuljahr setzen) entfernt die Klassenvorstand-Rollen der alten
   Klassen; die neuen entstehen beim Anlegen der Folgeklassen.
6. Gruppen (Wahlfächer, Religion), Stundenplan und Lehrfächerverteilung werden nicht übernommen; der Assistent
   verweist auf Lehrkräfte (Stundenausmaß), Stundenplan und Umstellen.

## Folgen

- Schulen mit Klassennamen ohne Stufe ("Sonnenklasse") müssen Folgeklassen selbst benennen und Wiederholende
  zuordnen; der Assistent zeigt dann die fehlenden Ziele.
- Modulare Oberstufe (Semesterprüfungen je Modul) ist nicht eigens abgebildet; Besonderheiten stehen in der
  Anmerkung.
