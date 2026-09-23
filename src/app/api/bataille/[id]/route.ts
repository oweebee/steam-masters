import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { awardBattle, deckFromJson, loadBattleDeck, nextBattleQuestion } from "@/lib/battle";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { id } = await context.params;
  let body: { action?: unknown; cardIds?: unknown; answer?: unknown };
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
        return;
      }

      if (body.action === "accept") {
        if (battle.status !== "PENDING" || battle.opponentId !== userId) throw new Error("Défi indisponible");
        const opponentDeck = await loadBattleDeck(tx, userId, body.cardIds);
        const challengerDeck = deckFromJson(battle.challengerDeck);
        const { question, answerIndex } = await nextBattleQuestion(tx, challengerDeck[0]);
        await tx.battle.update({ where: { id }, data: {
          status: "ACTIVE", opponentDeck, challengerHp: challengerDeck[0].defense,
          opponentHp: opponentDeck[0].defense, currentTurnId: battle.challengerId,
          question, answerIndex,
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
      const damage = body.answer === battle.answerIndex ? attacker.attack : 0;
      let challengerIndex = battle.challengerIndex;
      let opponentIndex = battle.opponentIndex;
      let challengerHp = battle.challengerHp;
      let opponentHp = battle.opponentHp;
      if (attackerIsChallenger) {
        opponentHp = Math.max(0, opponentHp - damage);
        if (opponentHp === 0) {
          opponentIndex++;
          if (opponentIndex < 5) opponentHp = opponentDeck[opponentIndex].defense;
        }
      } else {
        challengerHp = Math.max(0, challengerHp - damage);
        if (challengerHp === 0) {
          challengerIndex++;
          if (challengerIndex < 5) challengerHp = challengerDeck[challengerIndex].defense;
        }
      }
      const finished = challengerIndex >= 5 || opponentIndex >= 5;
      const winnerId = finished ? userId : null;
      const nextTurnId = finished ? null : attackerIsChallenger ? battle.opponentId : battle.challengerId;
      const nextCard = finished ? null : attackerIsChallenger ? opponentDeck[opponentIndex] : challengerDeck[challengerIndex];
      const nextQuestion = nextCard ? await nextBattleQuestion(tx, nextCard) : null;
      const now = new Date();
      await tx.battle.update({ where: { id }, data: {
        status: finished ? "FINISHED" : "ACTIVE", challengerIndex, opponentIndex,
        challengerHp, opponentHp, currentTurnId: nextTurnId,
        question: nextQuestion?.question ?? Prisma.DbNull, answerIndex: nextQuestion?.answerIndex ?? null,
        winnerId, finishedAt: finished ? now : null, turnCount: { increment: 1 },
      } });
      if (finished) await awardBattle(tx, id, userId, attackerIsChallenger ? battle.opponentId : battle.challengerId, now);
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Action impossible" }, { status: 400 });
  }
}
