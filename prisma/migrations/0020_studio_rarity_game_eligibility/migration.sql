-- Un Studio ne peut pas avoir une rareté catalogue supérieure à la meilleure
-- tranche atteinte par au moins un de ses jeux :
-- LEGENDARY >=98, EPIC >=96, RARE >=91, UNCOMMON >=85, sinon COMMON.
-- La rareté déjà attribuée par percentile n'est jamais promue ici, seulement
-- abaissée si le studio ne remplit pas la condition d'éligibilité.
WITH studio_scores AS (
  SELECT studio.id, COALESCE(MAX(game."reviewScore"), 0)::INTEGER AS best_score
  FROM "Studio" AS studio
  LEFT JOIN "SteamGame" AS game ON studio.name = ANY(game.developers)
  GROUP BY studio.id
), ranked AS (
  SELECT
    studio.id,
    GREATEST(
      CASE studio.rarity
        WHEN 'LEGENDARY' THEN 0 WHEN 'EPIC' THEN 1 WHEN 'RARE' THEN 2
        WHEN 'UNCOMMON' THEN 3 ELSE 4
      END,
      CASE
        WHEN scores.best_score >= 98 THEN 0
        WHEN scores.best_score >= 96 THEN 1
        WHEN scores.best_score >= 91 THEN 2
        WHEN scores.best_score >= 85 THEN 3
        ELSE 4
      END
    ) AS final_rank
  FROM "Studio" AS studio
  JOIN studio_scores AS scores ON scores.id = studio.id
)
UPDATE "Studio" AS studio
SET rarity = CASE ranked.final_rank
  WHEN 0 THEN 'LEGENDARY'::"Rarity"
  WHEN 1 THEN 'EPIC'::"Rarity"
  WHEN 2 THEN 'RARE'::"Rarity"
  WHEN 3 THEN 'UNCOMMON'::"Rarity"
  ELSE 'COMMON'::"Rarity"
END
FROM ranked
WHERE studio.id = ranked.id;

-- Le MCP lit AppSetting.MCP_GUIDE : la règle versionnée reste donc disponible
-- même si le service MCP distant est momentanément inaccessible au déploiement.
INSERT INTO "AppSetting" (key, value, "updatedAt")
VALUES (
  'MCP_GUIDE',
  E'\n\n--- MAJ 2026-09-22 : éligibilité de rareté des Studios ---\n' ||
  E'La rareté catalogue Studio reste attribuée par percentile global, mais elle est plafonnée par le meilleur reviewScore réel de ses jeux :\n' ||
  E'  LEGENDARY : au moins un jeu à 98-100%\n' ||
  E'  EPIC : au moins un jeu à 96-97%\n' ||
  E'  RARE : au moins un jeu à 91-95%\n' ||
  E'  UNCOMMON : au moins un jeu à 85-90%\n' ||
  E'  COMMON : aucun jeu à 85% ou plus\n' ||
  E'Cette règle ne promeut jamais un Studio et ne modifie jamais Card.rarity (rareté de chaque exemplaire).\n',
  now()
)
ON CONFLICT (key) DO UPDATE SET
  value = "AppSetting".value || EXCLUDED.value,
  "updatedAt" = now();
