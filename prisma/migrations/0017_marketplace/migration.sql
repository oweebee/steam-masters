-- Plusieurs enchères successives pour une même carte et prise en charge des
-- cartes Studio. L'historique survit à une éventuelle suppression de Card.
DROP INDEX IF EXISTS "Auction_cardId_key";

ALTER TABLE "Auction" DROP CONSTRAINT IF EXISTS "Auction_cardId_fkey";
ALTER TABLE "Auction" DROP CONSTRAINT IF EXISTS "Auction_gameId_fkey";
ALTER TABLE "Auction" ALTER COLUMN "cardId" DROP NOT NULL;
ALTER TABLE "Auction" ALTER COLUMN "gameId" DROP NOT NULL;
ALTER TABLE "Auction" ADD COLUMN "studioId" TEXT;

ALTER TABLE "Auction" ADD CONSTRAINT "Auction_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "SteamGame"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_studioId_fkey"
  FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Auction_status_endsAt_idx" ON "Auction"("status", "endsAt");
CREATE INDEX "Auction_cardId_idx" ON "Auction"("cardId");
