-- 0018 fixait la rareté catalogue par SEUIL fixe sur le reviewScore (>=98 =>
-- LEGENDARY). Le catalogue n'important que des jeux déjà bien notés, la quasi
-- totalité des lignes s'est retrouvée à 98-100% => quasi tout Légendaire.
-- On repasse en classement PAR PERCENTILE sur Jeux+Studios réunis (mêmes
-- proportions que le tirage carte instance : 0.5% Légendaire / 5% Épique /
-- 10% Rare / 20% Peu commun / 64.5% Commun), classement déterministe
-- (score DESC, id ASC pour départager), rejouable à l'identique côté appli
-- (voir src/lib/catalogRarity.ts).
CREATE TEMP TABLE "_CatalogRarityByPercentile" ON COMMIT DROP AS
WITH catalog AS (
  SELECT 'GAME'::TEXT AS kind, id, "reviewScore" AS score FROM "SteamGame"
  UNION ALL
  SELECT 'STUDIO'::TEXT AS kind, id, "avgReviewScore" AS score FROM "Studio"
), ranked AS (
  SELECT kind, id, ROW_NUMBER() OVER (ORDER BY score DESC, id ASC) AS position, COUNT(*) OVER () AS total
  FROM catalog
)
SELECT kind, id, CASE
  WHEN position <= ROUND(total * 0.005) THEN 'LEGENDARY'::"Rarity"
  WHEN position <= ROUND(total * 0.055) THEN 'EPIC'::"Rarity"
  WHEN position <= ROUND(total * 0.155) THEN 'RARE'::"Rarity"
  WHEN position <= ROUND(total * 0.355) THEN 'UNCOMMON'::"Rarity"
  ELSE 'COMMON'::"Rarity"
END AS rarity
FROM ranked;

UPDATE "SteamGame" AS game
SET rarity = assigned.rarity
FROM "_CatalogRarityByPercentile" AS assigned
WHERE assigned.kind = 'GAME' AND game.id = assigned.id;

UPDATE "Studio" AS studio
SET rarity = assigned.rarity
FROM "_CatalogRarityByPercentile" AS assigned
WHERE assigned.kind = 'STUDIO' AND studio.id = assigned.id;
