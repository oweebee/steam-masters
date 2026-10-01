ALTER TABLE "Trade" ADD COLUMN "requestId" TEXT;
CREATE UNIQUE INDEX "Trade_requestId_key" ON "Trade"("requestId");
