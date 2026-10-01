-- CreateEnum
CREATE TYPE "GameSource" AS ENUM ('STEAM', 'IGDB');

-- AlterTable
ALTER TABLE "SteamGame" ADD COLUMN "source" "GameSource" NOT NULL DEFAULT 'STEAM';

-- CreateIndex
CREATE INDEX "SteamGame_source_idx" ON "SteamGame"("source");
