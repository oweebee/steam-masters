-- Backfill des Card créées avant la migration 0008 (rarity=COMMON par défaut) :
-- roule chaque exemplaire avec le même algorithme que src/lib/rarityRoll.ts
-- (loot table 0.5/5/10/20/reste + plafonds par jeu/studio, downgrade en cascade).
-- Ne touche que les Card encore à COMMON (pour ne pas re-rouler un override admin
-- ou un tirage déjà fait par le nouveau code depuis le déploiement de 0008).
DO $$
DECLARE
  r RECORD;
  roll DOUBLE PRECISION;
  chosen "Rarity";
  cap INT;
  current_count INT;
BEGIN
  FOR r IN SELECT id, "gameId", "studioId" FROM "Card" WHERE rarity = 'COMMON' ORDER BY "createdAt" LOOP
    roll := random() * 100;
    IF roll < 0.5 THEN chosen := 'LEGENDARY';
    ELSIF roll < 5.5 THEN chosen := 'EPIC';
    ELSIF roll < 15.5 THEN chosen := 'RARE';
    ELSIF roll < 35.5 THEN chosen := 'UNCOMMON';
    ELSE chosen := 'COMMON';
    END IF;

    LOOP
      cap := CASE chosen
        WHEN 'LEGENDARY' THEN 1
        WHEN 'EPIC' THEN 5
        WHEN 'RARE' THEN 10
        WHEN 'UNCOMMON' THEN 20
        ELSE NULL
      END;
      EXIT WHEN cap IS NULL; -- COMMON, illimité

      SELECT COUNT(*) INTO current_count FROM "Card"
        WHERE rarity = chosen
          AND ((r."gameId" IS NOT NULL AND "gameId" = r."gameId")
            OR (r."studioId" IS NOT NULL AND "studioId" = r."studioId"));

      EXIT WHEN current_count < cap;

      chosen := CASE chosen
        WHEN 'LEGENDARY' THEN 'EPIC'
        WHEN 'EPIC' THEN 'RARE'
        WHEN 'RARE' THEN 'UNCOMMON'
        WHEN 'UNCOMMON' THEN 'COMMON'
      END;
    END LOOP;

    UPDATE "Card" SET rarity = chosen WHERE id = r.id;
  END LOOP;
END $$;
