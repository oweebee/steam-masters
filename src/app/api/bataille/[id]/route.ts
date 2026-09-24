import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { randomInt } from "node:crypto";
import { awardBattle, deckFromJson, loadBattleDeck, nextBattleQuestion, type BattleQuestion } from "@/lib/battle";
import { assertStakeCardAvailable, parseStakeCardId, parseStakeCoins, settleBattleStake, stakedCardCount } from "@/lib/battleStake";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { id } = await context.params;
  let body: { action?: unknown; cardIds?: unknown; answer?: unknown; stakeCoins?: unknown; stakeCardId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Requête invalide" }, { status: 400 }); }
  try {
    await prisma.$transaction(async (tx) => {
      const battle = await tx.battle.findUnique({ where: { id } });
      if (!battle || (battle.challengerId !== userId && battle.opponentId !== userId)) throw new Error("Combat introuvable");

      if (body.action === "cancel" || body.action === "decline") {
        if (battle.status !== "PENDING") throw new Error("Ce défi n'est plus en attente");
        if (body.action === "cancel" && battle.challengerId !== userId) throw new Error("Action interdite");
        if (body.action === "decline" && battle.opponentId !== userId) throw new Error("Action interdite");
        await tx.battle.update({ where: { id }, data: { status: "DECLINED" } });
        if (battle.challengerStakeCoins > 0) {
          await tx.user.update({ where: { id: battle.challengerId }, data: { coins: { increment: battle.challengerStakeCoins } } });
        }
        return;
      }

      if (body.action === "accept") {
        if (battle.status !== "PENDING" || battle.opponentId !== userId) throw new Error("Défi indisponible");
        const stakeCoins = battle.rulesVersion >= 2 ? parseStakeCoins(body.stakeCoins) : 0;
        const stakeCardId = battle.rulesVersion >= 2 ? parseStakeCardId(body.stakeCardId) : null;
        const opponentDeck = await loadBattleDeck(tx, userId, body.cardIds, battle.rulesVersion);
        const challengerDeck = deckFromJson(battle.challengerDeck);
        const challengerCardIds = challengerDeck.map((card) => card.id);
        const ownedChallengerCards = await tx.card.count({ where: { id: { in: challengerCardIds }, userId: battle.challengerId } });
        if (ownedChallengerCards !== challengerCardIds.length || await stakedCardCount(tx, challengerCardIds)) {
          throw new Error("Le deck du challenger a changé ; demande-lui de recréer le défi");
        }
        if (stakeCardId && opponentDeck.some((card) => card.id === stakeCardId)) throw new Error("La carte misée doit rester hors des 5 cartes jouables");
        await assertStakeCardAvailable(tx, userId, stakeCardId);
        if (battle.challengerStakeCardId) {
          const stillOwned = await tx.card.count({ where: { id: battle.challengerStakeCardId, userId: battle.challengerId } });
          if (stillOwned !== 1) throw new Error("La carte mise par l'adversaire n'est plus disponible");
        }
        if (stakeCoins > 0) {
          const debited = await tx.user.updateMany({ where: { id: userId, coins: { gte: stakeCoins } }, data: { coins: { decrement: stakeCoins } } });
          if (debited.count !== 1) throw new Error("Pièces insuffisantes pour cette mise");
        }
        const firstSource = randomInt(2) === 0 ? "OPPONENT" : "CATALOG";
        const { question, answerIndex } = await nextBattleQuestion(tx, opponentDeck, firstSource);
        await tx.battle.update({ where: { id }, data: {
          status: "ACTIVE", opponentDeck, challengerHp: challengerDeck[0].defense,
          opponentHp: opponentDeck[0].defense, currentTurnId: battle.challengerId,
          question, answerIndex, opponentStakeCoins: stakeCoins, opponentStakeCardId: stakeCardId,
        } });
        return;
      }

      if (body.action !== "answer" || battle.status !== "ACTIVE" || battle.currentTurnId !== userId) {
        throw new Error("Ce n'est pas ton tour");
      }
      if (!Number.isInteger(body.answer) || (body.answer as number) < 0 || (body.answer as number) > 3) {
        throw new Error("Réponse invalide");
      }
      const challengerDeck = deckFromJson(battle.challengerDeck);
      const opponentDeck = deckFromJson(battle.opponentDeck);
      const attackerIsChallenger = userId === battle.challengerId;
      const attacker = attackerIsChallenger ? challengerDeck[battle.challengerIndex] : opponentDeck[battle.opponentIndex];
      const correct = body.answer === battle.answerIndex;
      const damage = correct ? attacker?.attack ?? 0 : 0;
      let challengerIndex = battle.challengerIndex;
      let opponentIndex = battle.opponentIndex;
      let challengerHp = battle.challengerHp;
      let opponentHp = battle.opponentHp;
      let knockout = false;
      if (attackerIsChallenger && opponentIndex < 5 && damage > 0) {
        opponentHp = Math.max(0, opponentHp - damage);
        if (opponentHp === 0) {
          knockout = true;
          opponentIndex++;
          if (opponentIndex < 5) opponentHp = opponentDeck[opponentIndex].defense;
        }
      } else if (!attackerIsChallenger && challengerIndex < 5 && damage > 0) {
        challengerHp = Math.max(0, challengerHp - damage);
        if (challengerHp === 0) {
          knockout = true;
          challengerIndex++;
          if (challengerIndex < 5) challengerHp = challengerDeck[challengerIndex].defense;
        }
      }
      const newRules = battle.rulesVersion >= 2;
      const challengerScore = battle.challengerScore + (newRules && attackerIsChallenger ? Number(correct) + Number(knockout) : 0);
      const opponentScore = battle.opponentScore + (newRules && !attackerIsChallenger ? Number(correct) + Number(knockout) : 0);
      const answeredTurns = battle.turnCount + 1;
      const roundComplete = answeredTurns % 2 === 0;
      let winnerId: string | null = null;
      if (!newRules) {
        if (challengerIndex >= 5 || opponentIndex >= 5) winnerId = userId;
      } else if (answeredTurns <= 12 && (challengerScore >= 6 || opponentScore >= 6)) {
        winnerId = challengerScore >= 6 ? battle.challengerId : battle.opponentId;
      } else if (answeredTurns >= 12 && challengerScore !== opponentScore) {
        winnerId = challengerScore > opponentScore ? battle.challengerId : battle.opponentId;
      }
      const finished = winnerId !== null;
      const nextTurnId = finished ? null : attackerIsChallenger ? battle.opponentId : battle.challengerId;
      const nextOpponentDeck = attackerIsChallenger ? challengerDeck : opponentDeck;
      const previousSource = (battle.question as BattleQuestion | null)?.source;
      const switchSource = !newRules || roundComplete;
      const nextSource = switchSource ? (previousSource === "OPPONENT" ? "CATALOG" : "OPPONENT") : previousSource === "CATALOG" ? "CATALOG" : "OPPONENT";
      const nextQuestion = finished ? null : await nextBattleQuestion(tx, nextOpponentDeck, nextSource);
      const now = new Date();
      await tx.battle.update({ where: { id }, data: {
        status: finished ? "FINISHED" : "ACTIVE", challengerIndex, opponentIndex,
        challengerHp, opponentHp, challengerScore, opponentScore, currentTurnId: nextTurnId,
        question: nextQuestion?.question ?? Prisma.DbNull, answerIndex: nextQuestion?.answerIndex ?? null,
        winnerId, finishedAt: finished ? now : null, turnCount: { increment: 1 },
      } });
      if (winnerId) {
        if (newRules) await settleBattleStake(tx, battle, winnerId);
        await awardBattle(tx, id, winnerId, winnerId === battle.challengerId ? battle.opponentId : battle.challengerId, now);
      }
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Action impossible" }, { status: 400 });
  }
}
