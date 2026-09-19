-- AlterTable
ALTER TABLE "SteamGame" ADD COLUMN "developers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Studio" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gameCount" INTEGER NOT NULL DEFAULT 0,
    "avgReviewScore" INTEGER NOT NULL DEFAULT 0,
    "totalOwnerEstimate" INTEGER NOT NULL DEFAULT 0,
    "rarity" "Rarity" NOT NULL,
    "atk" INTEGER NOT NULL,
    "def" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Studio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Studio_name_key" ON "Studio"("name");

-- AlterTable: Card.gameId devient optionnel (une carte peut référencer un jeu OU un studio)
ALTER TABLE "Card" ALTER COLUMN "gameId" DROP NOT NULL;
ALTER TABLE "Card" ADD COLUMN "studioId" TEXT;

-- CreateIndex: unicité globale — un jeu ou un studio ne peut être possédé que par une seule carte (donc un seul user)
CREATE UNIQUE INDEX "Card_gameId_key" ON "Card"("gameId");
CREATE UNIQUE INDEX "Card_studioId_key" ON "Card"("studioId");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
