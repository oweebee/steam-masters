-- Migration 0016 : rareté catalogue (SteamGame + Studio) déterminée par reviewScore
-- au lieu du tirage aléatoire. Bandes identiques à ATK_BANDS :
--   LEGENDARY >= 98, EPIC >= 96, RARE >= 91, UNCOMMON >= 85, COMMON < 85.

-- SteamGame : recalculer rarity à partir de reviewScore
UPDATE "SteamGame"
SET rarity = (CASE
  WHEN "reviewScore" >= 98 THEN 'LEGENDARY'
  WHEN "reviewScore" >= 96 THEN 'EPIC'
  WHEN "reviewScore" >= 91 THEN 'RARE'
  WHEN "reviewScore" >= 85 THEN 'UNCOMMON'
  ELSE 'COMMON'
END)::"Rarity";

-- Studio : recalculer rarity à partir de avgReviewScore
UPDATE "Studio"
SET rarity = (CASE
  WHEN "avgReviewScore" >= 98 THEN 'LEGENDARY'
  WHEN "avgReviewScore" >= 96 THEN 'EPIC'
  WHEN "avgReviewScore" >= 91 THEN 'RARE'
  WHEN "avgReviewScore" >= 85 THEN 'UNCOMMON'
  ELSE 'COMMON'
END)::"Rarity";
