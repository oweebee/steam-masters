-- 0030 : index de performance (aucune donnée modifiée).
-- Card n'avait plus aucun index depuis 0008 (suppression des uniques) :
-- collection (userId), plafonds booster (gameId/studioId + rarity).
CREATE INDEX IF NOT EXISTS "Card_userId_createdAt_idx" ON "Card"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Card_gameId_rarity_idx" ON "Card"("gameId", "rarity");
CREATE INDEX IF NOT EXISTS "Card_studioId_rarity_idx" ON "Card"("studioId", "rarity");

-- Verrous d'échange/envoi (tradeCard.count par cardId) et jointures.
CREATE INDEX IF NOT EXISTS "TradeCard_cardId_idx" ON "TradeCard"("cardId");
CREATE INDEX IF NOT EXISTS "TradeCard_tradeId_idx" ON "TradeCard"("tradeId");
CREATE INDEX IF NOT EXISTS "Trade_fromUserId_idx" ON "Trade"("fromUserId");
CREATE INDEX IF NOT EXISTS "Trade_toUserId_idx" ON "Trade"("toUserId");

-- Meilleure enchère (orderBy amount desc) par enchère.
CREATE INDEX IF NOT EXISTS "Bid_auctionId_amount_idx" ON "Bid"("auctionId", "amount");

-- Recherches studio → jeux (developers has/hasSome) et nom exact (name in).
CREATE INDEX IF NOT EXISTS "SteamGame_name_idx" ON "SteamGame"("name");
CREATE INDEX IF NOT EXISTS "SteamGame_developers_idx" ON "SteamGame" USING GIN ("developers");
