import type { Battle, Prisma } from "@prisma/client";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { awardBattle } from "./battle";
import { assertStakeCardAvailable, parseStakeCardId, parseStakeCoins, settleBattleStake } from "./battleStake";
import { createDiceKiller, forfeitDiceKiller, keepBuildDice, rollAttack, rollBuild, type DiceKillerState, type DiceSide } from "./diceKiller";
import { confirmedFavoriteCardIds } from "./cardFavorites";

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("roll") }),
  z.object({ type: z.literal("keep"), indices: z.array(z.number().int().min(0).max(4)).min(1).max(5) }),
  z.object({ type: z.literal("attack") }),
]);

function dice(count: number) {
  return Array.from({ length: count }, () => randomInt(1, 7));
}

export async function handleDiceKiller(tx: Prisma.TransactionClient, battle: Battle, userId: string, body: Record<string, unknown>) {
  const side: DiceSide = userId === battle.challengerId ? 0 : 1;
  const ids = [battle.challengerId, battle.opponentId] as const;

  if (body.action === "accept") {
    if (battle.status !== "PENDING" || side !== 1) throw new Error("Défi indisponible.");
    const coins = parseStakeCoins(body.stakeCoins);
    const cardId = parseStakeCardId(body.stakeCardId);
    await assertStakeCardAvailable(tx, userId, cardId, confirmedFavoriteCardIds(body.confirmedFavoriteCardIds));
    if (battle.challengerStakeCardId && !await tx.card.findFirst({ where: { id: battle.challengerStakeCardId, userId: battle.challengerId } })) {
      throw new Error("La carte misée par l'adversaire n'est plus disponible.");
    }
    if (coins && (await tx.user.updateMany({ where: { id: userId, coins: { gte: coins } }, data: { coins: { decrement: coins } } })).count !== 1) {
      throw new Error("Gigapuissances insuffisantes.");
    }
    const state = createDiceKiller(randomInt(2) as DiceSide);
    await tx.battle.update({ where: { id: battle.id }, data: {
      status: "ACTIVE", escalationState: state, opponentDeck: [], challengerDeck: [],
      challengerHp: state.hp[0], opponentHp: state.hp[1], currentTurnId: ids[state.turn],
      opponentStakeCoins: coins, opponentStakeCardId: cardId,
    } });
    return { notify: [
      { userId: battle.challengerId, title: "Défi de dés accepté", body: "Le duel de Dés tueurs commence.", href: "/bataille/des-tueurs" },
      { userId: ids[state.turn], title: "À toi de lancer", body: "Le plateau des Dés tueurs t'attend.", turn: true, href: "/bataille/des-tueurs" },
    ] };
  }

  if ((body.action !== "play" && body.action !== "forfeit") || battle.status !== "ACTIVE" || !battle.escalationState) throw new Error("Action indisponible.");
  const current = battle.escalationState as unknown as DiceKillerState;
  if (body.revision !== current.revision) throw new Error("Le duel a évolué. Actualise avant de jouer.");

  let state: DiceKillerState;
  if (body.action === "forfeit") state = forfeitDiceKiller(current, side);
  else {
    if (current.turn !== side) throw new Error("Ce n'est pas ton tour.");
    const parsed = actionSchema.safeParse(body.move);
    if (!parsed.success) throw new Error("Action de dés invalide.");
    if (parsed.data.type === "roll") state = rollBuild(current, side, dice(5 - current.held.length));
    else if (parsed.data.type === "keep") {
      const uniqueCount = new Set(parsed.data.indices).size;
      const remaining = 5 - current.held.length - uniqueCount;
      state = keepBuildDice(current, side, parsed.data.indices, dice(remaining), randomInt(1, 7));
    } else state = rollAttack(current, side, dice(current.attackDice));
  }

  const finished = state.phase === "FINISHED";
  const winnerId = finished && state.winner !== null ? ids[state.winner] : null;
  const now = new Date();
  await tx.battle.update({ where: { id: battle.id }, data: {
    escalationState: state, status: finished ? "FINISHED" : "ACTIVE", turnCount: { increment: 1 },
    challengerHp: state.hp[0], opponentHp: state.hp[1], currentTurnId: finished ? null : ids[state.turn],
    winnerId, finishedAt: finished ? now : null,
  } });
  if (winnerId) {
    await settleBattleStake(tx, battle, winnerId);
    const bankReward = battle.challengerStakeCoins === 0 && battle.opponentStakeCoins === 0 && !battle.challengerStakeCardId && !battle.opponentStakeCardId;
    if (bankReward) await tx.user.update({ where: { id: winnerId }, data: { coins: { increment: 50 } } });
    await awardBattle(tx, battle.id, winnerId, ids[1 - state.winner!], now, bankReward ? 0 : 3);
  }
  const otherId = ids[1 - side];
  const turnChanged = !finished && state.turn !== side;
  return { notify: finished
    ? [{ userId: otherId, title: winnerId === otherId ? "Victoire aux dés !" : "Défaite aux dés", body: body.action === "forfeit" ? (winnerId === otherId && battle.challengerStakeCoins === 0 && battle.opponentStakeCoins === 0 && !battle.challengerStakeCardId && !battle.opponentStakeCardId ? "Ton adversaire abandonne : la banque t’offre 50 gigapuissances." : "Ton adversaire abandonne le duel de Dés tueurs.") : winnerId === otherId && battle.challengerStakeCoins === 0 && battle.opponentStakeCoins === 0 && !battle.challengerStakeCardId && !battle.opponentStakeCardId ? "Victoire : la banque t’offre 50 gigapuissances." : "Le duel de Dés tueurs est terminé.", href: "/bataille/des-tueurs" }]
    : turnChanged
      ? [{ userId: otherId, title: "À toi de lancer", body: "Ton adversaire a terminé son tour de Dés tueurs.", turn: true, href: "/bataille/des-tueurs" }]
      : [] };
}
