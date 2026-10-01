import type { Battle, Prisma } from "@prisma/client";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { createEscalade, draftHand, playEscalade, type AbilityLayout, type EscaladeState, type Side, type Tactic } from "./escalade";
import { assertStakeCardAvailable, parseStakeCoins, parseStakeCardId, settleBattleStake } from "./battleStake";
import { awardBattle } from "./battle";

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("draft"), cardIds: z.array(z.string()).length(5) }),
  z.object({ type: z.literal("defend"), cardId: z.string(), useAbility: z.boolean().optional() }),
  z.object({ type: z.literal("attack"), cardIds: z.array(z.string()).min(1).max(5), abilityCardId: z.string().optional() }),
  z.object({ type: z.literal("cede") }), z.object({ type: z.literal("pass") }),
]);
export async function handleEscalade(tx: Prisma.TransactionClient, battle: Battle, userId: string, body: Record<string, unknown>) {
  const side: Side = userId === battle.challengerId ? 0 : 1;
  const ids = [battle.challengerId, battle.opponentId];
  if (body.action === "accept") {
    if (battle.status !== "PENDING" || side !== 1) throw new Error("Défi indisponible.");
    const pending = battle.escalationState as unknown as { abilitySeed?: number; abilityLayout?: AbilityLayout; draftBudget?: number } | null;
    const hand = draftHand(body.cardIds, pending?.abilityLayout, pending?.draftBudget);
    const coins = parseStakeCoins(body.stakeCoins);
    const cardId = parseStakeCardId(body.stakeCardId);
    await assertStakeCardAvailable(tx, userId, cardId);
    if (battle.challengerStakeCardId && !await tx.card.findFirst({ where: { id: battle.challengerStakeCardId, userId: battle.challengerId } })) throw new Error("La carte misée par l'adversaire n'est plus disponible.");
    if (coins && (await tx.user.updateMany({ where: { id: userId, coins: { gte: coins } }, data: { coins: { decrement: coins } } })).count !== 1) throw new Error("Gigapuissances insuffisantes.");
    const state = createEscalade((battle.challengerDeck as unknown as Tactic[]).map(c => c.id), hand.map(c => c.id), randomInt(2) as Side, pending?.abilitySeed ?? 0, pending?.draftBudget ?? 23);
    await tx.battle.update({ where: { id: battle.id }, data: { status: "ACTIVE", escalationState: state, opponentDeck: [], challengerDeck: [], challengerHp: 20, opponentHp: 20, currentTurnId: ids[state.turn], opponentStakeCoins: coins, opponentStakeCardId: cardId } });
    return { notify: [{ userId: battle.challengerId, title: "Défi accepté", body: "L’Escalade commence. Les deux mains sont prêtes." }, { userId: ids[state.turn], title: "À toi de jouer", body: "Pose la première défense.", turn: true }] };
  }
  if (body.action !== "play" || battle.status !== "ACTIVE" || !battle.escalationState) throw new Error("Action indisponible.");
  const current = battle.escalationState as unknown as EscaladeState;
  if (body.revision !== current.revision) throw new Error("Le combat a évolué. Actualise avant de jouer.");
  const parsed = actionSchema.safeParse(body.move);
  if (!parsed.success) throw new Error("Action tactique invalide.");
  const state = playEscalade(current, side, parsed.data);
  const finished = state.phase === "FINISHED";
  const winnerId = finished && state.winner !== null ? ids[state.winner] : null;
  await tx.battle.update({ where: { id: battle.id }, data: {
    escalationState: state, status: finished ? "FINISHED" : "ACTIVE", turnCount: { increment: 1 },
    challengerHp: state.hp[0], opponentHp: state.hp[1], challengerScore: state.wins[0], opponentScore: state.wins[1],
    currentTurnId: finished || state.phase === "DRAFT" ? null : ids[state.turn], winnerId, finishedAt: finished ? new Date() : null,
  } });
  if (winnerId) {
    await settleBattleStake(tx, battle, winnerId);
    await awardBattle(tx, battle.id, winnerId, ids[1 - state.winner!], new Date());
  }
  const recipients = finished || state.phase === "DRAFT" ? ids.filter(id => id !== userId) : [ids[state.turn]].filter(id => id !== userId);
  return { notify: recipients.map(id => ({ userId: id, title: finished ? "Match terminé" : state.phase === "DRAFT" ? "Nouvelle manche" : "À toi de jouer", body: finished ? `L’Escalade se termine ${state.wins[0]}–${state.wins[1]}.` : state.phase === "DRAFT" ? "Choisis secrètement tes 5 nouvelles cartes." : "Ton adversaire a joué. À toi de riposter.", turn: !finished })) };
}
