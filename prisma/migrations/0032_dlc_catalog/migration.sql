DO $$ BEGIN
  CREATE TYPE "SteamContentType" AS ENUM ('GAME', 'DLC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SteamGame"
  ADD COLUMN IF NOT EXISTS "contentType" "SteamContentType" NOT NULL DEFAULT 'GAME',
  ADD COLUMN IF NOT EXISTS "parentGameId" TEXT,
  ADD COLUMN IF NOT EXISTS "dlcAppIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS "SteamGame_contentType_parentGameId_idx"
  ON "SteamGame" ("contentType", "parentGameId");

DO $$ BEGIN
  ALTER TABLE "SteamGame"
    ADD CONSTRAINT "SteamGame_parentGameId_fkey"
    FOREIGN KEY ("parentGameId") REFERENCES "SteamGame"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE "AppSetting"
SET value = CASE WHEN position('--- MAJ 2026-09-24 : catalogue des DLC ---' in value) > 0 THEN value ELSE value || E'\n\n--- MAJ 2026-09-24 : catalogue des DLC ---\n'
  || E'Catalogue Steam : SteamGame.contentType distingue GAME et DLC. Un DLC n’est importé que si Steam confirme son type, son jeu parent déjà catalogué et une estimation SteamSpy ownerEstimate > 0 (DEF > 0). Son parent est lié par parentGameId; la liste dlcAppIds du jeu parent vient exclusivement de Steam appdetails. Images stockées via StoredImage sur le serveur. Une absence d’estimation positive entraîne refus et AppLog, jamais une DEF ou des données inventées.\n'
  || E'Les DLC sont exclus des agrégats Studio et des cartes Studio. Leur rareté catalogue est classée dans son pool DLC séparé et LEGENDARY est plafonnée à EPIC. Les cartes DLC restent tirables comme cartes Jeu, mais un DLC ne peut jamais recevoir la rareté d’exemplaire LEGENDARY. Le scan admin DLC est reprenable grâce à son curseur persisté dans AppSetting et chaque import/refus/erreur est écrit dans AppLog.\n' END,
  "updatedAt" = now()
WHERE key = 'MCP_GUIDE';

INSERT INTO "AppSetting" (key, value, "updatedAt")
VALUES ('MCP_GUIDE_VERSION', '2026-09-24-dlc-catalog-0032', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now();
