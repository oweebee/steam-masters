CREATE TABLE "CardCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#c8874a',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CardCategoryAssignment" (
    "cardId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardCategoryAssignment_pkey" PRIMARY KEY ("cardId", "categoryId")
);

CREATE UNIQUE INDEX "CardCategory_userId_name_key" ON "CardCategory"("userId", "name");
CREATE INDEX "CardCategory_userId_idx" ON "CardCategory"("userId");
CREATE INDEX "CardCategoryAssignment_categoryId_idx" ON "CardCategoryAssignment"("categoryId");

ALTER TABLE "CardCategory" ADD CONSTRAINT "CardCategory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardCategoryAssignment" ADD CONSTRAINT "CardCategoryAssignment_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardCategoryAssignment" ADD CONSTRAINT "CardCategoryAssignment_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "CardCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
