ALTER TABLE "Battle" ADD COLUMN "rulesVersion" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Battle" ADD COLUMN "challengerScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Battle" ADD COLUMN "opponentScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Battle" ADD COLUMN "challengerStakeCoins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Battle" ADD COLUMN "opponentStakeCoins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Battle" ADD COLUMN "challengerStakeCardId" TEXT;
ALTER TABLE "Battle" ADD COLUMN "opponentStakeCardId" TEXT;

-- Les duels anterieurs restent sur leurs snapshots/regles historiques.
UPDATE "Battle" SET "rulesVersion" = 1;
CREATE INDEX "Battle_challengerStakeCardId_status_idx" ON "Battle"("challengerStakeCardId", status);
CREATE INDEX "Battle_opponentStakeCardId_status_idx" ON "Battle"("opponentStakeCardId", status);
