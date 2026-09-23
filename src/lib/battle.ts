import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";

export type BattleCard = {
  id: string;
  name: string;
  image: string | null;
  kind: "GAME" | "STUDIO";
  rarity: string;
  attack: number;
  defense: number;
  developer: string | null;
  games: string[];
};

export type BattleQuestion = { text: string; options: string[] };

// ATK 0..100 devient 1 500..8 500 dégâts ; la DEF est comprimée depuis
// l'estimation SteamSpy (tiers) sur 5 000..10 500 PV. Une bonne réponse
// élimine donc normalement une carte en 1 à 4 coups.
export function combatAttack(atk: number) {
  return 1500 + Math.max(0, Math.min(100, atk)) * 70;
}

export function combatDefense(owners: number) {
  return Math.max(5000, Math.min(10500, Math.round(1000 * (1 + Math.log10(Math.max(1, owners))))));
}

export function deckFromJson(value: Prisma.JsonValue | null): BattleCard[] {
  return Array.isArray(value) ? value as unknown as BattleCard[] : [];
}

export async function loadBattleDeck(tx: Prisma.TransactionClient, userId: string, ids: unknown): Promise<BattleCard[]> {
  if (!Array.isArray(ids) || ids.length !== 5 || new Set(ids).size !== 5 || ids.some((id) => typeof id !== "string")) {
    throw new Error("Choisis exactement 5 cartes différentes");
  }
  const cards = await tx.card.findMany({
    where: { id: { in: ids as string[] }, userId },
    include: { game: true, studio: true },
  });
  if (cards.length !== 5) throw new Error("Une carte ne t'appartient plus");
  const byId = new Map(cards.map((card) => [card.id, card]));
  return (ids as string[]).map((id) => {
    const card = byId.get(id)!;
    const source = card.game ?? card.studio;
    if (!source) throw new Error("Carte incomplète");
    if (card.game && !card.game.developers.length) throw new Error(`Studio inconnu pour « ${source.name} »`);
    if (card.studio && !card.studio.games.length) throw new Error(`Aucun jeu lié à « ${source.name} »`);
    const owners = card.game?.ownerEstimate ?? card.studio!.totalOwnerEstimate;
    return {
      id: card.id,
      name: source.name,
      image: card.game?.headerImage ?? card.studio?.avatarUrl ?? null,
      kind: card.game ? "GAME" as const : "STUDIO" as const,
      rarity: card.rarity,
      attack: combatAttack(card.atk),
      defense: combatDefense(owners),
      developer: card.game?.developers[0] ?? null,
      games: card.studio?.games ?? [],
    };
  });
}

function shuffle<T>(values: T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function nextBattleQuestion(tx: Prisma.TransactionClient, card: BattleCard): Promise<{ question: BattleQuestion; answerIndex: number }> {
  let answer: string;
  let distractors: string[];
  let text: string;
  if (card.kind === "GAME" && card.developer) {
    answer = card.developer;
    text = `Quel studio a développé « ${card.name} » ?`;
    const studios = await tx.studio.findMany({ select: { name: true }, take: 80, orderBy: { updatedAt: "desc" } });
    distractors = studios.map((studio) => studio.name).filter((name) => name !== answer);
  } else if (card.kind === "STUDIO" && card.games.length) {
    answer = card.games[0];
    text = `Quel jeu appartient au studio « ${card.name} » ?`;
    const games = await tx.steamGame.findMany({ select: { name: true }, take: 80, orderBy: { updatedAt: "desc" } });
    distractors = games.map((game) => game.name).filter((name) => !card.games.includes(name));
  } else {
    throw new Error("Cette carte n'a pas assez de données pour un combat");
  }
  const options = shuffle([answer, ...shuffle([...new Set(distractors)]).slice(0, 3)]);
  if (options.length !== 4) throw new Error("Pas assez de données Steam pour créer une question");
  return { question: { text, options }, answerIndex: options.indexOf(answer) };
}

export async function awardBattle(tx: Prisma.TransactionClient, battleId: string, winnerId: string, loserId: string, at: Date) {
  const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const tomorrow = new Date(day.getTime() + 86_400_000);
  for (const [userId, opponentId, xp, coins] of [[winnerId, loserId, 25, 3], [loserId, winnerId, 5, 0]] as const) {
    const prior = await tx.battleReward.findMany({
      where: { userId, createdAt: { gte: day, lt: tomorrow } },
      select: { opponentId: true },
    });
    if (prior.length >= 5 || prior.some((reward) => reward.opponentId === opponentId)) continue;
    await tx.battleReward.create({ data: { battleId, userId, opponentId, createdAt: at } });
    await tx.user.update({ where: { id: userId }, data: { xp: { increment: xp }, coins: { increment: coins } } });
  }
}
