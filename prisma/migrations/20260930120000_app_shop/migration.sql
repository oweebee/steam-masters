CREATE TABLE "ShopRotation" (
    "id" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopRotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopOffer" (
    "id" TEXT NOT NULL,
    "rotationId" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "gameId" TEXT,
    "studioId" TEXT,
    "rarity" "Rarity" NOT NULL,
    "atk" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "purchasedById" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopRotation_startsAt_key" ON "ShopRotation"("startsAt");
CREATE INDEX "ShopRotation_endsAt_idx" ON "ShopRotation"("endsAt");
CREATE UNIQUE INDEX "ShopOffer_rotationId_subjectKey_key" ON "ShopOffer"("rotationId", "subjectKey");
CREATE INDEX "ShopOffer_rotationId_purchasedAt_idx" ON "ShopOffer"("rotationId", "purchasedAt");
CREATE INDEX "ShopOffer_gameId_rarity_idx" ON "ShopOffer"("gameId", "rarity");
CREATE INDEX "ShopOffer_studioId_rarity_idx" ON "ShopOffer"("studioId", "rarity");

ALTER TABLE "ShopOffer" ADD CONSTRAINT "ShopOffer_rotationId_fkey" FOREIGN KEY ("rotationId") REFERENCES "ShopRotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopOffer" ADD CONSTRAINT "ShopOffer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "SteamGame"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShopOffer" ADD CONSTRAINT "ShopOffer_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShopOffer" ADD CONSTRAINT "ShopOffer_purchasedById_fkey" FOREIGN KEY ("purchasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES (
    'MCP_GUIDE',
    E'## Magasin applicatif\nLe magasin propose un stock global de 50 sujets distincts par heure. Le prix en pièces est tiré uniformément entre les bornes min/max configurées par rareté dans SHOP_PRICE_RANGES. Les offres actives réservent les plafonds de rareté et le plafond global par sujet; un achat transfère atomiquement les pièces et crée l’exemplaire. Un admin peut expirer le stock invendu et relancer immédiatement une rotation complète d’une heure. La revente/défausse d’un exemplaire rapporte 3 pièces.',
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
    "value" = CASE
        WHEN "AppSetting"."value" LIKE '%## Magasin applicatif%' THEN "AppSetting"."value"
        ELSE "AppSetting"."value" || E'\n\n## Magasin applicatif\nLe magasin propose un stock global de 50 sujets distincts par heure. Le prix en pièces est tiré uniformément entre les bornes min/max configurées par rareté dans SHOP_PRICE_RANGES. Les offres actives réservent les plafonds de rareté et le plafond global par sujet; un achat transfère atomiquement les pièces et crée l’exemplaire. Un admin peut expirer le stock invendu et relancer immédiatement une rotation complète d’une heure. La revente/défausse d’un exemplaire rapporte 3 pièces.'
    END,
    "updatedAt" = CURRENT_TIMESTAMP;
