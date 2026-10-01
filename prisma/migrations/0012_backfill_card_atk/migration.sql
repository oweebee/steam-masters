-- Backfill de l'ATK des Card créées avant la migration 0011 (atk=0 par défaut) :
-- roule chaque exemplaire dans la bande % de sa rareté DÉJÀ tirée (inchangée,
-- ce backfill ne touche PAS rarity). Bandes identiques à rollAtkForRarity :
-- LEGENDARY 98-100 / EPIC 96-97 / RARE 91-95 / UNCOMMON 85-90 / COMMON 0-84.
DO $$
DECLARE
  r RECORD;
  band_min INT;
  band_max INT;
BEGIN
  FOR r IN SELECT id, rarity FROM "Card" WHERE atk = 0 LOOP
    CASE r.rarity
      WHEN 'LEGENDARY' THEN band_min := 98; band_max := 100;
      WHEN 'EPIC'      THEN band_min := 96; band_max := 97;
      WHEN 'RARE'      THEN band_min := 91; band_max := 95;
      WHEN 'UNCOMMON'  THEN band_min := 85; band_max := 90;
      ELSE                  band_min := 0;  band_max := 84;
    END CASE;

    UPDATE "Card" SET atk = band_min + floor(random() * (band_max - band_min + 1))::int
      WHERE id = r.id;
  END LOOP;
END $$;
