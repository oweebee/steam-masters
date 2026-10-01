-- SteamSpy fournit des fourchettes d'owners (pas les ventes unitaires réelles).
-- Jeux et DLC partagent le même pool: >= 5 M donne au moins EPIC; cette cohorte
-- étend le quota violet si nécessaire. LEGENDARY reste à 0,5% et exige >= 5 M.
UPDATE "SteamGame" AS dlc
SET developers = parent.developers
FROM "SteamGame" AS parent
WHERE dlc."contentType" = 'DLC' AND dlc."parentGameId" = parent.id
  AND parent."contentType" = 'GAME'
  AND cardinality(dlc.developers) = 0 AND cardinality(parent.developers) > 0;

WITH catalog_totals AS (
  SELECT count(*)::bigint AS total,
         count(*) FILTER (WHERE "ownerEstimate" >= 5000000)::bigint AS sales_floor_count
  FROM "SteamGame"
), ranked_catalog AS (
  SELECT game.id, game."ownerEstimate",
         row_number() OVER (ORDER BY game."ownerEstimate" DESC, game.id ASC) AS position,
         totals.total,
         LEAST(totals.total, GREATEST(round(totals.total * 0.055), totals.sales_floor_count)) AS epic_end,
         round(totals.total * 0.005) AS legendary_end
  FROM "SteamGame" AS game CROSS JOIN catalog_totals AS totals
), game_bounds AS (
  SELECT *,
    epic_end + round((total - epic_end) * (0.155 - 0.055) / (1 - 0.055)) AS rare_end,
    epic_end + round((total - epic_end) * (0.155 - 0.055) / (1 - 0.055))
      + round((total - epic_end) * (0.355 - 0.155) / (1 - 0.055)) AS uncommon_end
  FROM ranked_catalog
)
UPDATE "SteamGame" AS game
SET rarity = CASE
  WHEN ranked.position <= ranked.legendary_end AND ranked."ownerEstimate" >= 5000000 THEN 'LEGENDARY'::"Rarity"
  WHEN ranked.position <= ranked.epic_end AND ranked."ownerEstimate" >= 5000000 THEN 'EPIC'::"Rarity"
  WHEN ranked.position <= ranked.rare_end THEN 'RARE'::"Rarity"
  WHEN ranked.position <= ranked.uncommon_end THEN 'UNCOMMON'::"Rarity"
  ELSE 'COMMON'::"Rarity"
END
FROM game_bounds AS ranked WHERE game.id = ranked.id;

-- Les studios restent dans leur pool historique; EPIC reste conditionnel à
-- l'existence d'un jeu réellement dans la cohorte de ventes EPIC élargie.
WITH catalog_totals AS (
  SELECT count(*)::bigint AS total,
         count(*) FILTER (WHERE "ownerEstimate" >= 5000000)::bigint AS sales_floor_count
  FROM "SteamGame"
), ranked_games AS (
  SELECT game.id, game.developers, game."ownerEstimate", game."reviewScore", game."contentType",
         row_number() OVER (ORDER BY game."ownerEstimate" DESC, game.id ASC) AS position,
         LEAST(totals.total, GREATEST(round(totals.total * 0.055), totals.sales_floor_count)) AS epic_end
  FROM "SteamGame" AS game CROSS JOIN catalog_totals AS totals
), studio_scores AS (
  SELECT studio.id, studio.name, studio."avgReviewScore",
         COALESCE(MAX(game."reviewScore"), 0) AS best_game_score,
         COALESCE(BOOL_OR(game."contentType" = 'GAME' AND game.position <= game.epic_end AND game."ownerEstimate" >= 5000000), false) AS has_epic_sales_game
  FROM "Studio" AS studio
  LEFT JOIN "SteamGame" AS raw_game ON studio.name = ANY(raw_game.developers) AND raw_game."contentType" = 'GAME'
  LEFT JOIN ranked_games AS game ON game.id = raw_game.id
  GROUP BY studio.id
), ranked_studios AS (
  SELECT *, row_number() OVER (ORDER BY "avgReviewScore" DESC, id ASC) AS position,
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

UPDATE "AppSetting"
SET value = CASE
    WHEN position('--- MAJ 2026-09-25 : quota EPIC ajusté aux ventes estimées ---' in value) > 0
      THEN left(value, position('--- MAJ 2026-09-25 : quota EPIC ajusté aux ventes estimées ---' in value) - 1)
    ELSE value
  END
  || E'\n\n--- MAJ 2026-09-25 : quota EPIC et pool DLC unifiés ---\n'
  || E'SteamSpy publie une estimation par fourchette, pas un chiffre de ventes exact. Jeux et DLC partagent le même classement. À partir de 5 000 000 de possesseurs estimés, un jeu/DLC est au minimum EPIC; le quota violet s’étend au nombre de titres éligibles si nécessaire. LEGENDARY reste réservé aux meilleurs 0,5% avec au moins 5 000 000. RARE, UNCOMMON et COMMON se partagent le solde en conservant leurs proportions relatives historiques. Les DLC héritent du ou des studios du jeu parent.'
  , "updatedAt" = now()
WHERE key = 'MCP_GUIDE'
  AND position('--- MAJ 2026-09-25 : quota EPIC et pool DLC unifiés ---' in value) = 0;

INSERT INTO "AppSetting" (key, value, "updatedAt")
VALUES ('MCP_GUIDE_VERSION', '2026-09-25-sales-scaled-epic-dlc-0034', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now();
