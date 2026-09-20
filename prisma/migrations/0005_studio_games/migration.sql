-- AlterTable: liste réelle des jeux du studio (noms SteamGame), pour affichage
ALTER TABLE "Studio" ADD COLUMN "games" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
