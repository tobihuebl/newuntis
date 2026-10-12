-- Fächerfarben des PROfessor Design Systems (ADR 0010, Entscheidung F3): statt freier Hex-Farbe eine der acht
-- Fächerfarben. Bestehende Fächer erhalten die Standardzuordnung nach Kürzel und Name (wie defaultFachColor in
-- @sp/shared); danach lässt die Schule nur noch diese Werte zu.
UPDATE "Subject" SET "color" = CASE
  WHEN "code" ~* '^(m|ma|mathe|mathematik)$' OR "name" ~* 'mathemat|^mathe' THEN 'kobalt'
  WHEN "code" ~* '^(d|de)$' OR "name" ~* 'deutsch' THEN 'koralle'
  WHEN "code" ~* '^(e|en|f|fr|l|la|it)$' OR "name" ~* 'englisch|franz|latein|spanisch|italienisch|sprache' THEN 'rosa'
  WHEN "code" ~* '^(bio|biu|bu|nawi)$' OR "name" ~* 'biolog|naturkunde|umweltkunde' THEN 'mint'
  WHEN "code" ~* '^(ph|ch)$' OR "name" ~* 'physik|chemie' THEN 'himmel'
  WHEN "code" ~* '^(mu|me|be|bk|ku)$' OR "name" ~* 'musik|kunst|bildnerisch' THEN 'flieder'
  WHEN "code" ~* '^(bsp|spo|bus)$' OR "name" ~* 'sport|bewegung|turnen' THEN 'limette'
  ELSE 'sand'
END;

ALTER TABLE "Subject" ADD CONSTRAINT "Subject_color_fach" CHECK (
  "color" IS NULL OR "color" IN ('kobalt', 'mint', 'himmel', 'flieder', 'rosa', 'limette', 'koralle', 'sand')
);
