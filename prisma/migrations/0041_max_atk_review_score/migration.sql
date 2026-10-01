-- Règle ATK : une note Steam exceptionnelle (>= 98 %) donne toujours 10 ATK.
-- Les notes et estimations sources restent inchangées.
UPDATE "SteamGame"
SET "atk" = CASE
  WHEN "reviewScore" >= 98 THEN 10
  ELSE FLOOR("reviewScore" / 10.0)::integer
END;

UPDATE "Studio"
SET "atk" = CASE
  WHEN "avgReviewScore" >= 98 THEN 10
  ELSE FLOOR("avgReviewScore" / 10.0)::integer
END;

UPDATE "Card" AS c
SET "atk" = 10
FROM "SteamGame" AS g
WHERE c."gameId" = g."id" AND g."reviewScore" >= 98;

UPDATE "Card" AS c
SET "atk" = 10
FROM "Studio" AS s
WHERE c."studioId" = s."id" AND s."avgReviewScore" >= 98;

INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES (
  'MCP_GUIDE',
  E'\n\nMAX ATK REVIEW RULE (migration 0041): SteamGame/Studio/Card linked to a review score of 98% or above always has ATK 10. Apply this override before rarity bands; manual admin editing cannot lower it.',
  CURRENT_TIMESTAMP
) ON CONFLICT ("key") DO UPDATE SET "value" = "AppSetting"."value" || EXCLUDED."value", "updatedAt" = CURRENT_TIMESTAMP;
