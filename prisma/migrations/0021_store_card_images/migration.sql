-- Les images de cartes sont conservées dans PostgreSQL (BYTEA), donc survivent
-- aux reconstructions du conteneur applicatif. sourceUrl n'est qu'une provenance
-- interne ; les clients utilisent toujours /api/images/... sur notre domaine.
CREATE TABLE "StoredImage" (
  "key" TEXT NOT NULL,
  "data" BYTEA,
  "mimeType" TEXT,
  "sourceUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoredImage_pkey" PRIMARY KEY ("key")
);

-- Prépare le rapatriement paresseux des images existantes sans les perdre :
-- la première requête locale télécharge la source puis remplit data/mimeType.
INSERT INTO "StoredImage" ("key", "sourceUrl", "updatedAt")
SELECT 'game:' || id, "headerImage", CURRENT_TIMESTAMP
FROM "SteamGame"
WHERE "headerImage" IS NOT NULL AND "headerImage" <> '';

UPDATE "SteamGame"
SET "headerImage" = '/api/images/game/' || id;

INSERT INTO "StoredImage" ("key", "sourceUrl", "updatedAt")
SELECT 'studio:' || id, "avatarUrl", CURRENT_TIMESTAMP
FROM "Studio"
WHERE "avatarUrl" IS NOT NULL AND "avatarUrl" <> '';

UPDATE "Studio"
SET "avatarUrl" = '/api/images/studio/' || id
WHERE "avatarUrl" IS NOT NULL AND "avatarUrl" <> '';

INSERT INTO "AppSetting" (key, value, "updatedAt")
VALUES (
  'MCP_GUIDE',
  E'\n\n--- MAJ 2026-09-22 : stockage des images de cartes ---\n' ||
  E'Les images Jeu et les logos Studio sont stockés dans StoredImage.data (BYTEA) avec leur MIME.\n' ||
  E'La source distante reste uniquement dans StoredImage.sourceUrl pour la provenance et ne doit jamais être envoyée comme image de carte au client.\n' ||
  E'SteamGame.headerImage et Studio.avatarUrl pointent vers /api/images/game/[id] ou /api/images/studio/[id].\n' ||
  E'Les nouveaux imports doivent appeler persistRemoteImage avant de créer ou modifier la fiche catalogue.\n',
  now()
)
ON CONFLICT (key) DO UPDATE SET
  value = "AppSetting".value || EXCLUDED.value,
  "updatedAt" = now();
