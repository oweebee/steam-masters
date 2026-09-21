-- Les cartes ne sont plus uniques par jeu/studio : un même jeu/studio peut être
-- tiré plusieurs fois, chaque exemplaire ayant sa propre rareté (loot table).
DROP INDEX IF EXISTS "Card_gameId_key";
DROP INDEX IF EXISTS "Card_studioId_key";

ALTER TABLE "Card" ADD COLUMN "rarity" "Rarity" NOT NULL DEFAULT 'COMMON';
