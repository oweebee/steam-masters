ALTER TABLE "Trade" ADD COLUMN "isDelivery" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Trade" ADD COLUMN "expiresAt" TIMESTAMP(3);
CREATE INDEX "Trade_status_expiresAt_idx" ON "Trade"("status", "expiresAt");

UPDATE "AppSetting" SET value = value || $delivery$

11. ENVOIS DE CARTES (migration 0029)
- Un envoi est un Trade avec isDelivery=true, exactement une TradeCard OFFER et aucune WANT ; wantCoins est le prix demandé au destinataire (0 = cadeau), offerCoins=0.
- expiresAt vaut création + 3 jours. Le propriétaire reste l'expéditeur jusqu'à acceptation ; la carte est verrouillée pendant le délai. Refus, annulation ou expiration libèrent la carte sans transfert.
- Le destinataire doit accepter même un cadeau. À l'acceptation, propriété et paiement éventuel sont transférés ensemble dans une transaction sérialisable. Ne pas déduire les pièces à la création.
- Les cartes engagées dans un envoi actif ne sont ni revendables, ni mises aux enchères, ni échangeables, ni jouables/misables en combat.
$delivery$, "updatedAt" = now() WHERE key = 'MCP_GUIDE';
INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES ('MCP_GUIDE_VERSION', '2026-09-24-delivery-0029', now())
ON CONFLICT ("key") DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now();
