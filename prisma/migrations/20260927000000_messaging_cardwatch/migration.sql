-- Add isAnnouncement to Message
ALTER TABLE "Message" ADD COLUMN "isAnnouncement" BOOLEAN NOT NULL DEFAULT false;

-- Create CardWatch table
CREATE TABLE "CardWatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT,
    "studioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardWatch_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "CardWatch_userId_gameId_key" ON "CardWatch"("userId", "gameId");
CREATE UNIQUE INDEX "CardWatch_userId_studioId_key" ON "CardWatch"("userId", "studioId");

-- Indexes
CREATE INDEX "CardWatch_gameId_idx" ON "CardWatch"("gameId");
CREATE INDEX "CardWatch_studioId_idx" ON "CardWatch"("studioId");
CREATE INDEX "CardWatch_userId_idx" ON "CardWatch"("userId");

-- Foreign keys
ALTER TABLE "CardWatch" ADD CONSTRAINT "CardWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardWatch" ADD CONSTRAINT "CardWatch_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "SteamGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardWatch" ADD CONSTRAINT "CardWatch_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
