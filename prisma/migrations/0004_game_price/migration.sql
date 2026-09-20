-- AlterTable: prix Steam (pour l'affichage au dos de la carte, cf flip UI)
ALTER TABLE "SteamGame" ADD COLUMN "priceCents" INTEGER;
ALTER TABLE "SteamGame" ADD COLUMN "isFree" BOOLEAN NOT NULL DEFAULT false;
