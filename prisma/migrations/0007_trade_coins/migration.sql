-- AlterTable: montants en jetons échangeables en plus des cartes
ALTER TABLE "Trade" ADD COLUMN "offerCoins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Trade" ADD COLUMN "wantCoins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Trade" ADD COLUMN "resolvedAt" TIMESTAMP(3);
