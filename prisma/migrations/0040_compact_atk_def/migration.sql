-- Échelle compacte demandée : division par dix, partie entière seulement.
-- Les sources Steam/SteamSpy restent dans reviewScore et ownerEstimate.
UPDATE "SteamGame"
SET "atk" = FLOOR("reviewScore" / 10.0)::integer,
    "def" = GREATEST(5, LEAST(25, FLOOR((50 + 25 * LOG(10, GREATEST(1, "ownerEstimate"))) / 10.0)::integer));

UPDATE "Studio"
SET "atk" = FLOOR("avgReviewScore" / 10.0)::integer,
    "def" = GREATEST(5, LEAST(25, FLOOR((50 + 25 * LOG(10, GREATEST(1, "totalOwnerEstimate"))) / 10.0)::integer));

UPDATE "Card" SET "atk" = GREATEST(0, LEAST(10, FLOOR("atk" / 10.0)::integer));

INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES (
  'MCP_GUIDE',
  E'\n\nCOMPACT STATS (migration 0040): stored catalogue ATK = floor(reviewScore / 10), Studio ATK = floor(avgReviewScore / 10), Card ATK bands are 0..10, and DEF = clamp(floor((50 + 25*log10(max(1, owners))) / 10), 5, 25). ownerEstimate/totalOwnerEstimate and reviewScore retain raw sources. Never divide stored stats a second time; recalculate from raw source fields. Combat snapshots use compact ATK 3..8 and DEF 5..25.',
  CURRENT_TIMESTAMP
) ON CONFLICT ("key") DO UPDATE SET "value" = "AppSetting"."value" || EXCLUDED."value", "updatedAt" = CURRENT_TIMESTAMP;
