-- Les raretés catalogue Jeu reposent sur les ventes estimées, pas les avis.
-- Le seuil absolu évite qu'un petit catalogue biaisé produise des légendaires.
WITH ranked_games AS (
  SELECT id, "ownerEstimate",
         row_number() OVER (ORDER BY "ownerEstimate" DESC, id ASC) AS position,
         count(*) OVER () AS total
  FROM "SteamGame"
)
UPDATE "SteamGame" AS game
SET rarity = CASE
  WHEN ranked.position <= round(ranked.total * 0.005)
       AND ranked."ownerEstimate" >= 5000000 THEN 'LEGENDARY'::"Rarity"
  WHEN ranked.position <= round(ranked.total * 0.055) THEN 'EPIC'::"Rarity"
  WHEN ranked.position <= round(ranked.total * 0.155) THEN 'RARE'::"Rarity"
  WHEN ranked.position <= round(ranked.total * 0.355) THEN 'UNCOMMON'::"Rarity"
  ELSE 'COMMON'::"Rarity"
END
FROM ranked_games AS ranked
WHERE game.id = ranked.id;

-- Les Studios ont un classement indépendant et ne peuvent jamais être légendaires.
WITH studio_scores AS (
  SELECT studio.id, studio.name, studio."avgReviewScore",
         COALESCE(MAX(game."reviewScore"), 0) AS best_game_score
  FROM "Studio" AS studio
  LEFT JOIN "SteamGame" AS game ON studio.name = ANY(game.developers)
  GROUP BY studio.id
), ranked_studios AS (
  SELECT id, best_game_score,
         row_number() OVER (ORDER BY "avgReviewScore" DESC, id ASC) AS position,
         count(*) OVER () AS total
  FROM studio_scores
), studio_ranks AS (
  SELECT id, GREATEST(
    1,
    CASE
      WHEN position <= round(total * 0.005) THEN 0
      WHEN position <= round(total * 0.055) THEN 1
      WHEN position <= round(total * 0.155) THEN 2
      WHEN position <= round(total * 0.355) THEN 3
      ELSE 4
    END,
    CASE
      WHEN best_game_score >= 96 THEN 1
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
FROM studio_ranks AS ranks
WHERE studio.id = ranks.id;

UPDATE "AppSetting"
SET value = CASE WHEN position('--- MAJ 2026-09-24 : rareté légendaire réservée aux jeux très vendus ---' in value) > 0 THEN value ELSE value || E'\n\n--- MAJ 2026-09-24 : rareté légendaire réservée aux jeux très vendus ---\n'
  || E'Rareté catalogue : Jeux et Studios sont classés dans des pools distincts. Les jeux sont triés par ownerEstimate SteamSpy décroissant (départage par AppID) : LEGENDARY = top 0,5% ET au moins 5 000 000 possesseurs estimés; EPIC jusqu’au top 5,5%; RARE jusqu’au top 15,5%; UNCOMMON jusqu’au top 35,5%; COMMON ensuite. Les autres sources de rareté des jeux (avis) ne donnent jamais LEGENDARY.\n'
  || E'Les Studios sont triés séparément par avgReviewScore et plafonnés par le meilleur reviewScore d’un jeu associé (EPIC à partir de 96, RARE à partir de 91, UNCOMMON à partir de 85); un Studio ne peut jamais être LEGENDARY.\n'
  || E'Rareté des exemplaires : le tirage orange LEGENDARY est conservé seulement si la carte tirée est un SteamGame déjà LEGENDARY et ownerEstimate >= 5 000 000. Studios et autres jeux rétrogradent d’un palier à EPIC, puis appliquent les plafonds normaux. Card.atk correspond au palier final. Cette règle ne change aucune Card déjà créée.\n' END,
    "updatedAt" = now()
WHERE key = 'MCP_GUIDE';

INSERT INTO "AppSetting" (key, value, "updatedAt")
VALUES ('MCP_GUIDE_VERSION', '2026-09-24-sales-legendary-0031', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now();
