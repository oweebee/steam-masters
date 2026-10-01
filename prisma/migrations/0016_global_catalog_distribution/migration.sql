-- Réunit Jeux + Studios dans une distribution globale unique. Cette migration
-- est séparée de 0014 car 0014 peut déjà avoir été appliquée en production.
-- Elle repurge aussi les DEF 0 qui auraient été importées après 0014.
CREATE TEMP TABLE "_DefZeroGames16" ON COMMIT DROP AS
SELECT id FROM "SteamGame" WHERE def <= 0;

DELETE FROM "Bid" AS bid
USING "Auction" AS auction, "_DefZeroGames16" AS invalid
WHERE bid."auctionId" = auction.id AND auction."gameId" = invalid.id;

DELETE FROM "Auction" AS auction
USING "_DefZeroGames16" AS invalid
WHERE auction."gameId" = invalid.id;

DELETE FROM "TradeCard" AS trade_card
USING "Card" AS card, "_DefZeroGames16" AS invalid
WHERE trade_card."cardId" = card.id AND card."gameId" = invalid.id;

DELETE FROM "Card" AS card
USING "_DefZeroGames16" AS invalid
WHERE card."gameId" = invalid.id;

DELETE FROM "SteamGame" AS game
USING "_DefZeroGames16" AS invalid
WHERE game.id = invalid.id;

WITH studio_stats AS (
  SELECT
    studio.id,
    COUNT(game.id)::INTEGER AS game_count,
    COALESCE(ROUND(AVG(game."reviewScore")), 0)::INTEGER AS avg_score,
    COALESCE(SUM(game."ownerEstimate"), 0)::INTEGER AS total_owners,
    COALESCE(
      ARRAY_AGG(game.name ORDER BY game.name) FILTER (WHERE game.id IS NOT NULL),
      ARRAY[]::TEXT[]
    ) AS game_names
  FROM "Studio" AS studio
  LEFT JOIN "SteamGame" AS game ON studio.name = ANY(game.developers)
  GROUP BY studio.id
)
UPDATE "Studio" AS studio
SET
  "gameCount" = stats.game_count,
  "avgReviewScore" = stats.avg_score,
  "totalOwnerEstimate" = stats.total_owners,
  games = stats.game_names,
  atk = stats.avg_score,
  def = stats.total_owners
FROM studio_stats AS stats
WHERE studio.id = stats.id;

CREATE TEMP TABLE "_EmptyStudios16" ON COMMIT DROP AS
SELECT id FROM "Studio" WHERE "gameCount" = 0;

DELETE FROM "Bid" AS bid
USING "Auction" AS auction, "Card" AS card, "_EmptyStudios16" AS invalid
WHERE bid."auctionId" = auction.id
  AND auction."cardId" = card.id
  AND card."studioId" = invalid.id;

DELETE FROM "Auction" AS auction
USING "Card" AS card, "_EmptyStudios16" AS invalid
WHERE auction."cardId" = card.id AND card."studioId" = invalid.id;

DELETE FROM "TradeCard" AS trade_card
USING "Card" AS card, "_EmptyStudios16" AS invalid
WHERE trade_card."cardId" = card.id AND card."studioId" = invalid.id;

DELETE FROM "Card" AS card
USING "_EmptyStudios16" AS invalid
WHERE card."studioId" = invalid.id;

DELETE FROM "Studio" AS studio
USING "_EmptyStudios16" AS invalid
WHERE studio.id = invalid.id;

CREATE TEMP TABLE "_GlobalCatalogRarity" ON COMMIT DROP AS
WITH catalog AS (
  SELECT 'GAME'::TEXT AS kind, id FROM "SteamGame"
  UNION ALL
  SELECT 'STUDIO'::TEXT AS kind, id FROM "Studio"
), ranked AS (
  SELECT kind, id, ROW_NUMBER() OVER (ORDER BY random()) AS position, COUNT(*) OVER () AS total
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
FROM "_GlobalCatalogRarity" AS assigned
WHERE assigned.kind = 'GAME' AND game.id = assigned.id;

UPDATE "Studio" AS studio
SET rarity = assigned.rarity
FROM "_GlobalCatalogRarity" AS assigned
WHERE assigned.kind = 'STUDIO' AND studio.id = assigned.id;
