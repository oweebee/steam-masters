-- DLC catalog rarity and owned instances are capped at RARE (blue).
UPDATE "SteamGame"
SET rarity = 'RARE'::"Rarity"
WHERE "contentType" = 'DLC'
  AND rarity IN ('EPIC'::"Rarity", 'LEGENDARY'::"Rarity");

UPDATE "Card" AS card
SET rarity = 'RARE'::"Rarity",
    atk = 91 + floor(random() * 5)::int
FROM "SteamGame" AS game
WHERE card."gameId" = game.id
  AND game."contentType" = 'DLC'
  AND card.rarity IN ('EPIC'::"Rarity", 'LEGENDARY'::"Rarity");

-- Explicitly supersede previous MCP guide text that allowed EPIC DLC.
UPDATE "AppSetting"
SET value = value || E'\n\n--- MAJ 2026-09-25 : plafond de rareté DLC ---\n'
  || E'Règle prioritaire qui remplace toute consigne antérieure contradictoire : les DLC (SteamGame.contentType = DLC) et leurs exemplaires Card ne peuvent être que COMMON (blanc), UNCOMMON (vert) ou RARE (bleu). Le plafond est RARE, même pour les DLC les plus vendus; EPIC (violet) et LEGENDARY (orange) sont interdits. Toute rétrogradation d’exemplaire réaligne Card.atk sur la bande RARE (91–95).'
  , "updatedAt" = now()
WHERE key = 'MCP_GUIDE'
  AND position('--- MAJ 2026-09-25 : plafond de rareté DLC ---' in value) = 0;

INSERT INTO "AppSetting" (key, value, "updatedAt")
VALUES ('MCP_GUIDE_VERSION', '2026-09-25-dlc-rarity-cap-0035', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now();
