-- Une carte Jeu catalogue n'est valide que si sa DEF est strictement positive.
CREATE TEMP TABLE "_DefZeroGames" ON COMMIT DROP AS
SELECT id FROM "SteamGame" WHERE def <= 0;

DELETE FROM "Bid" AS bid
USING "Auction" AS auction, "_DefZeroGames" AS invalid
WHERE bid."auctionId" = auction.id AND auction."gameId" = invalid.id;

DELETE FROM "Auction" AS auction
USING "_DefZeroGames" AS invalid
WHERE auction."gameId" = invalid.id;

DELETE FROM "TradeCard" AS trade_card
USING "Card" AS card, "_DefZeroGames" AS invalid
WHERE trade_card."cardId" = card.id AND card."gameId" = invalid.id;

DELETE FROM "Card" AS card
USING "_DefZeroGames" AS invalid
WHERE card."gameId" = invalid.id;

DELETE FROM "SteamGame" AS game
USING "_DefZeroGames" AS invalid
WHERE game.id = invalid.id;

-- Recalcule les studios depuis les seuls jeux valides encore présents.
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

-- Un studio sans jeu valide disparaît avec ses exemplaires possédés.
CREATE TEMP TABLE "_EmptyStudios" ON COMMIT DROP AS
SELECT id FROM "Studio" WHERE "gameCount" = 0;

DELETE FROM "Bid" AS bid
USING "Auction" AS auction, "Card" AS card, "_EmptyStudios" AS invalid
WHERE bid."auctionId" = auction.id
  AND auction."cardId" = card.id
  AND card."studioId" = invalid.id;

DELETE FROM "Auction" AS auction
USING "Card" AS card, "_EmptyStudios" AS invalid
WHERE auction."cardId" = card.id AND card."studioId" = invalid.id;

DELETE FROM "TradeCard" AS trade_card
USING "Card" AS card, "_EmptyStudios" AS invalid
WHERE trade_card."cardId" = card.id AND card."studioId" = invalid.id;

DELETE FROM "Card" AS card
USING "_EmptyStudios" AS invalid
WHERE card."studioId" = invalid.id;

DELETE FROM "Studio" AS studio
USING "_EmptyStudios" AS invalid
WHERE studio.id = invalid.id;

-- Redistribution exacte du catalogue restant : 0,5 % Légendaire,
-- 5 % Épique, 10 % Rare, 20 % Peu commune, le reste Commune.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY random()) AS position, COUNT(*) OVER () AS total
  FROM "SteamGame"
)
UPDATE "SteamGame" AS game
SET rarity = CASE
  WHEN ranked.position <= ROUND(ranked.total * 0.005) THEN 'LEGENDARY'::"Rarity"
  WHEN ranked.position <= ROUND(ranked.total * 0.055) THEN 'EPIC'::"Rarity"
  WHEN ranked.position <= ROUND(ranked.total * 0.155) THEN 'RARE'::"Rarity"
  WHEN ranked.position <= ROUND(ranked.total * 0.355) THEN 'UNCOMMON'::"Rarity"
  ELSE 'COMMON'::"Rarity"
END
FROM ranked
WHERE game.id = ranked.id;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY random()) AS position, COUNT(*) OVER () AS total
  FROM "Studio"
)
UPDATE "Studio" AS studio
SET rarity = CASE
  WHEN ranked.position <= ROUND(ranked.total * 0.005) THEN 'LEGENDARY'::"Rarity"
  WHEN ranked.position <= ROUND(ranked.total * 0.055) THEN 'EPIC'::"Rarity"
  WHEN ranked.position <= ROUND(ranked.total * 0.155) THEN 'RARE'::"Rarity"
  WHEN ranked.position <= ROUND(ranked.total * 0.355) THEN 'UNCOMMON'::"Rarity"
  ELSE 'COMMON'::"Rarity"
END
FROM ranked
WHERE studio.id = ranked.id;
