CREATE TYPE "BattleStatus" AS ENUM ('PENDING', 'ACTIVE', 'DECLINED', 'FINISHED');

CREATE TABLE "Battle" (
  "id" TEXT NOT NULL,
  "challengerId" TEXT NOT NULL,
  "opponentId" TEXT NOT NULL,
  "status" "BattleStatus" NOT NULL DEFAULT 'PENDING',
  "challengerDeck" JSONB NOT NULL,
  "opponentDeck" JSONB,
  "challengerIndex" INTEGER NOT NULL DEFAULT 0,
  "opponentIndex" INTEGER NOT NULL DEFAULT 0,
  "challengerHp" INTEGER NOT NULL DEFAULT 0,
  "opponentHp" INTEGER NOT NULL DEFAULT 0,
  "currentTurnId" TEXT,
  "question" JSONB,
  "answerIndex" INTEGER,
  "turnCount" INTEGER NOT NULL DEFAULT 0,
  "winnerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "Battle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Battle_challengerId_status_idx" ON "Battle"("challengerId","status");
CREATE INDEX "Battle_opponentId_status_idx" ON "Battle"("opponentId","status");
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BattleReward" (
  "id" TEXT NOT NULL,
  "battleId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "opponentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BattleReward_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BattleReward_battleId_userId_key" ON "BattleReward"("battleId","userId");
CREATE INDEX "BattleReward_userId_createdAt_idx" ON "BattleReward"("userId","createdAt");
CREATE INDEX "BattleReward_userId_opponentId_createdAt_idx" ON "BattleReward"("userId","opponentId","createdAt");
ALTER TABLE "BattleReward" ADD CONSTRAINT "BattleReward_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BattleReward" ADD CONSTRAINT "BattleReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "AppSetting" SET value = value || $battle$

8. BATAILLES AMICALES (migration 0024)
- Battle conserve une copie JSON des 5 exemplaires choisis par chaque joueur ; les cartes restent dans leur collection et ne sont ni transférées ni détruites.
- ATK de combat = 1500 + clamp(Card.atk, 0, 100) * 70. PV/DEF de combat = clamp(round(1000 * (1 + log10(max(1, ownerEstimate)))), 5000, 10500). Les valeurs catalogue SteamGame.def/Studio.def ne sont pas modifiées.
- Un joueur répond à une question sur sa carte active à son tour ; bonne réponse = dégâts ATK sur la carte adverse, mauvaise réponse = zéro dégât. Le tour passe ensuite à l'autre joueur. Le premier à éliminer les 5 cartes adverses gagne.
- Récompenses automatiques : gagnant 3 pièces + 25 XP, perdant 5 XP. Un joueur ne reçoit une récompense que pour ses 5 premiers combats récompensés par journée UTC et une seule fois par adversaire et par jour. Les enregistrements BattleReward font foi.
- Ne jamais insérer un résultat ou une récompense de bataille directement via MCP : passer par l'API transactionnelle pour éviter double paiement et état incohérent.
$battle$, "updatedAt" = now() WHERE key = 'MCP_GUIDE';
INSERT INTO "AppSetting" (key, value, "updatedAt") VALUES ('MCP_GUIDE_VERSION', '2026-09-23-battles-0024', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now();
