-- Migration 0015 : réapplication des plafonds de rareté (RARITY_CAP) à tous les
-- exemplaires de cartes existants, après la purge migration 0014 (jeux DEF≤0).
--
-- RARITY_CAP (par jeu/studio, tous joueurs confondus) :
--   LEGENDARY = 1   EPIC = 5   RARE = 10   UNCOMMON = 20   COMMON = illimité
--
-- Algorithme : pour chaque jeu/studio, les exemplaires de chaque palier sont triés
-- par createdAt ASC (les plus anciens gardent leur rareté). Les exemplaires en excès
-- sont downgradés vers le palier inférieur dans l'ordre LEGENDARY→EPIC→RARE→UNCOMMON.
-- COMMON est illimité, donc jamais downgradé.
-- La cascade est appliquée palier par palier de haut en bas.
--
-- IMPORTANT : tester via `prisma migrate deploy` (transaction unique par fichier),
-- jamais via `psql -f` seul (autocommit casse les CREATE TEMP TABLE ON COMMIT DROP).

-- ─── 1. Table temporaire des downgrades à effectuer ───────────────────────────
-- Pour chaque palier excédentaire, on identifie les Card.id à downgrader.
-- On traite dans l'ordre décroissant de rareté (LEGENDARY→UNCOMMON) en plusieurs
-- passes, en laissant COMMON intact.

-- Passe A : LEGENDARY → EPIC
-- Cap = 1 par jeu/studio. Tout exemplaire LEGENDARY au-delà du 1er (createdAt ASC)
-- est downgradé en EPIC.

CREATE TEMP TABLE _LegendaryExcess ON COMMIT DROP AS
SELECT c.id
FROM "Card" c
WHERE c.rarity = 'LEGENDARY'
  AND c.id NOT IN (
    -- garder le 1er LEGENDARY (le plus ancien) pour chaque jeu/studio
    SELECT DISTINCT ON (COALESCE(c2."gameId", c2."studioId")) c2.id
    FROM "Card" c2
    WHERE c2.rarity = 'LEGENDARY'
      AND (c2."gameId" IS NOT NULL OR c2."studioId" IS NOT NULL)
    ORDER BY COALESCE(c2."gameId", c2."studioId"), c2."createdAt" ASC
  );

UPDATE "Card" SET rarity = 'EPIC'
WHERE id IN (SELECT id FROM _LegendaryExcess);

-- Passe B : EPIC → RARE
-- Cap = 5 par jeu/studio. On re-compte EPIC après la passe A (des LEGENDARY sont
-- devenus EPIC). Tout exemplaire EPIC au-delà du 5e est downgradé en RARE.

CREATE TEMP TABLE _EpicRanked ON COMMIT DROP AS
SELECT c.id,
       ROW_NUMBER() OVER (
         PARTITION BY COALESCE(c."gameId", c."studioId")
         ORDER BY c."createdAt" ASC
       ) AS rn
FROM "Card" c
WHERE c.rarity = 'EPIC'
  AND (c."gameId" IS NOT NULL OR c."studioId" IS NOT NULL);

UPDATE "Card" SET rarity = 'RARE'
WHERE id IN (SELECT id FROM _EpicRanked WHERE rn > 5);

-- Passe C : RARE → UNCOMMON
-- Cap = 10 par jeu/studio. Idem après passe B.

CREATE TEMP TABLE _RareRanked ON COMMIT DROP AS
SELECT c.id,
       ROW_NUMBER() OVER (
         PARTITION BY COALESCE(c."gameId", c."studioId")
         ORDER BY c."createdAt" ASC
       ) AS rn
FROM "Card" c
WHERE c.rarity = 'RARE'
  AND (c."gameId" IS NOT NULL OR c."studioId" IS NOT NULL);

UPDATE "Card" SET rarity = 'UNCOMMON'
WHERE id IN (SELECT id FROM _RareRanked WHERE rn > 10);

-- Passe D : UNCOMMON → COMMON
-- Cap = 20 par jeu/studio. Idem après passe C.

CREATE TEMP TABLE _UncommonRanked ON COMMIT DROP AS
SELECT c.id,
       ROW_NUMBER() OVER (
         PARTITION BY COALESCE(c."gameId", c."studioId")
         ORDER BY c."createdAt" ASC
       ) AS rn
FROM "Card" c
WHERE c.rarity = 'UNCOMMON'
  AND (c."gameId" IS NOT NULL OR c."studioId" IS NOT NULL);

UPDATE "Card" SET rarity = 'COMMON'
WHERE id IN (SELECT id FROM _UncommonRanked WHERE rn > 20);

-- COMMON : illimité → rien à faire.
