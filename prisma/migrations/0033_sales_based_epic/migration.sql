-- Les jeux Épiques doivent être bien vendus; SteamSpy fournit l'estimation réelle.
WITH ranked_games AS (
  SELECT id, "ownerEstimate",
         row_number() OVER (ORDER BY "ownerEstimate" DESC, id ASC) AS position,
         count(*) OVER () AS total
  FROM "SteamGame" WHERE "contentType" = 'GAME'
)
UPDATE "SteamGame" AS game
SET rarity = CASE
  WHEN ranked.position <= round(ranked.total * 0.005) AND ranked."ownerEstimate" >= 5000000 THEN 'LEGENDARY'::"Rarity"
  WHEN ranked.position <= round(ranked.total * 0.055) AND ranked."ownerEstimate" >= 1000000 THEN 'EPIC'::"Rarity"
  WHEN ranked.position <= round(ranked.total * 0.155) THEN 'RARE'::"Rarity"
  WHEN ranked.position <= round(ranked.total * 0.355) THEN 'UNCOMMON'::"Rarity"
  ELSE 'COMMON'::"Rarity"
END
FROM ranked_games AS ranked WHERE game.id = ranked.id;

WITH ranked_dlcs AS (
  SELECT id, "ownerEstimate",
         row_number() OVER (ORDER BY "ownerEstimate" DESC, id ASC) AS position,
         count(*) OVER () AS total
  FROM "SteamGame" WHERE "contentType" = 'DLC'
)
UPDATE "SteamGame" AS dlc
SET rarity = CASE
  WHEN ranked.position <= round(ranked.total * 0.055) AND ranked."ownerEstimate" >= 1000000 THEN 'EPIC'::"Rarity"
  WHEN ranked.position <= round(ranked.total * 0.155) THEN 'RARE'::"Rarity"
  WHEN ranked.position <= round(ranked.total * 0.355) THEN 'UNCOMMON'::"Rarity"
  ELSE 'COMMON'::"Rarity"
END
FROM ranked_dlcs AS ranked WHERE dlc.id = ranked.id;

-- Un studio ne peut être Épique que si au moins un jeu du catalogue remplit
-- réellement le palier Épique par ventes. Aucun studio n'est Légendaire.
WITH ranked_games AS (
  SELECT id, developers, "ownerEstimate", "reviewScore",
         row_number() OVER (ORDER BY "ownerEstimate" DESC, id ASC) AS position,
         count(*) OVER () AS total
  FROM "SteamGame" WHERE "contentType" = 'GAME'
), studio_scores AS (
  SELECT studio.id, studio.name, studio."avgReviewScore",
         COALESCE(MAX(game."reviewScore"), 0) AS best_game_score,
         COALESCE(BOOL_OR(game.position <= round(game.total * 0.055) AND game."ownerEstimate" >= 1000000), false) AS has_epic_sales_game
  FROM "Studio" AS studio
  LEFT JOIN "SteamGame" AS raw_game ON studio.name = ANY(raw_game.developers) AND raw_game."contentType" = 'GAME'
  LEFT JOIN ranked_games AS game ON game.id = raw_game.id
  GROUP BY studio.id
), ranked_studios AS (
  SELECT *,
         row_number() OVER (ORDER BY "avgReviewScore" DESC, id ASC) AS position,
         count(*) OVER () AS total
  FROM studio_scores
), studio_ranks AS (
  SELECT id,
    GREATEST(
      CASE
        WHEN position <= round(total * 0.005) AND NOT has_epic_sales_game THEN 2
        WHEN position <= round(total * 0.005) THEN 1
        WHEN position <= round(total * 0.055) AND NOT has_epic_sales_game THEN 2
        WHEN position <= round(total * 0.055) THEN 1
        WHEN position <= round(total * 0.155) THEN 2
        WHEN position <= round(total * 0.355) THEN 3
        ELSE 4
      END,
      CASE
        WHEN has_epic_sales_game THEN 1
        WHEN best_game_score >= 91 THEN 2
        WHEN best_game_score >= 85 THEN 3
        ELSE 4
      END
    ) AS final_rank
  FROM ranked_studios
)
UPDATE "Studio" AS studio
SET rarity = CASE ranks.final_rank
  WHEN 1 THEN 'EPIC'::"Rarity"
  WHEN 2 THEN 'RARE'::"Rarity"
  WHEN 3 THEN 'UNCOMMON'::"Rarity"
  ELSE 'COMMON'::"Rarity"
END
FROM studio_ranks AS ranks WHERE studio.id = ranks.id;

-- Nettoie les exemplaires EPIC/LEGENDARY déjà distribués qui ne sont plus
-- autorisés par leur carte catalogue; l'ATK est réalignée sur le nouveau palier.
WITH targets AS (
  SELECT card.id,
    CASE
      WHEN card.rarity = 'LEGENDARY' AND game."contentType" = 'GAME'
           AND game.rarity = 'LEGENDARY' AND game."ownerEstimate" >= 5000000 THEN 'LEGENDARY'::"Rarity"
      WHEN (game.rarity IN ('EPIC', 'LEGENDARY') AND game."ownerEstimate" >= 1000000)
           OR (studio.rarity = 'EPIC') THEN 'EPIC'::"Rarity"
      ELSE 'RARE'::"Rarity"
    END AS target_rarity
  FROM "Card" AS card
  LEFT JOIN "SteamGame" AS game ON game.id = card."gameId"
  LEFT JOIN "Studio" AS studio ON studio.id = card."studioId"
  WHERE card.rarity IN ('EPIC', 'LEGENDARY')
)
UPDATE "Card" AS card
SET rarity = targets.target_rarity,
    atk = CASE targets.target_rarity
      WHEN 'EPIC' THEN 96 + floor(random() * 2)::int
      WHEN 'RARE' THEN 91 + floor(random() * 5)::int
      ELSE card.atk
    END
FROM targets
WHERE card.id = targets.id AND card.rarity <> targets.target_rarity;

UPDATE "AppSetting"
SET value = CASE WHEN position('--- MAJ 2026-09-24 : rareté épique liée aux ventes ---' in value) > 0 THEN value ELSE value || E'\n\n--- MAJ 2026-09-24 : rareté épique liée aux ventes ---\n'
  || E'Jeux LEGENDARY : top 0,5% des jeux par ownerEstimate SteamSpy ET au moins 5 000 000 possesseurs estimés. Jeux EPIC : top 5,5% ET au moins 1 000 000 possesseurs estimés. RARE/UNCOMMON gardent leurs percentiles; un jeu AAA, AA ou indépendant n’accède aux paliers orange/violet que selon ces ventes mesurées, pas sur le nom du studio ou les avis seuls. Le classement des DLC est séparé et plafonné à EPIC.\n'
  || E'Un Studio ne peut être EPIC que s’il est dans son palier de classement et qu’au moins un de ses jeux atteint le critère de ventes EPIC; LEGENDARY demeure réservé aux jeux. Les exemplaires EPIC/LEGENDARY non éligibles sont rétrogradés à la rareté permise (EPIC ou RARE) et leur ATK est recalée dans la bande associée. Les futurs tirages appliquent les mêmes contrôles.\n' END,
  "updatedAt" = now()
WHERE key = 'MCP_GUIDE';

INSERT INTO "AppSetting" (key, value, "updatedAt")
VALUES ('MCP_GUIDE_VERSION', '2026-09-24-sales-epic-0033', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now();
