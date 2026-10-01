ALTER TABLE "User" ADD COLUMN "sidebarOrder" JSONB;

CREATE TABLE "LeaderboardRewardClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rewardKey" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaderboardRewardClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeaderboardRewardClaim_userId_rewardKey_key"
ON "LeaderboardRewardClaim"("userId", "rewardKey");
CREATE INDEX "LeaderboardRewardClaim_userId_claimedAt_idx"
ON "LeaderboardRewardClaim"("userId", "claimedAt");

ALTER TABLE "LeaderboardRewardClaim" ADD CONSTRAINT "LeaderboardRewardClaim_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "AppSetting"
SET "value" = replace("value", 'Les offres actives réservent les plafonds de rareté et le plafond global par sujet;', 'Les offres actives et les collections des joueurs ne réservent aucun plafond; les pourcentages concernent uniquement la répartition des nouveaux tirages; un même sujet et une même rareté peuvent apparaître sans limite historique;')
WHERE "key" = 'MCP_GUIDE';

UPDATE "AppSetting"
SET "value" = "value" || E'\n\n## Répartition des nouveaux tirages\nLes poids de rareté s’appliquent uniquement au lot en cours de génération. Ne jamais compter les cartes possédées par les joueurs ni les offres actives pour bloquer, plafonner ou rétrograder un nouveau tirage. L’éligibilité catalogue LEGENDARY/EPIC reste obligatoire.'
WHERE "key" = 'MCP_GUIDE'
  AND position('## Répartition des nouveaux tirages' in "value") = 0;

UPDATE "Notification"
SET "link" = '/offre-magasin/' || split_part("link", 'offre=', 2)
WHERE "type" = 'SHOP' AND "link" LIKE '/magasin?offre=%';

UPDATE "AppSetting"
SET "value" = "value" || E'\n\n## Récompenses du classement\nChaque palier atteint est réclamable une seule fois via LeaderboardRewardClaim et crédité atomiquement après recalcul serveur. La monnaie est nommée gigapuissances dans l’interface, abrégée GP quand la place manque; le champ interne historique reste coins. Les montants sont bornés de 20 à 5000 GP : objectifs à un seul élément 20, Studio absolu trivial 50, Studio 3 jeux 20/60/120, duo 50, ultime clamp(250 + exigences × 140), raretés 50/200/600, forge clamp(palier × pointsRareté / 4), global 250/800/2500. User.sidebarOrder stocke uniquement une permutation validée des routes connues et s’applique aussi à la PWA.'
WHERE "key" = 'MCP_GUIDE'
  AND position('## Récompenses du classement' in "value") = 0;
