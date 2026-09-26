import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { deckFromJson, loadBattleDeck, publicBattleDeck } from "@/lib/battle";
import { assertStakeCardAvailable, parseStakeCardId, parseStakeCoins } from "@/lib/battleStake";

async function playerId() {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id;
}

export async function GET() {
  const userId = await playerId();
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const [battles, user] = await Promise.all([prisma.battle.findMany({
    where: { OR: [{ challengerId: userId }, { opponentId: userId }] },
    orderBy: { updatedAt: "desc" },
    take: 60,
    include: {
      challenger: { select: { username: true } },
      opponent: { select: { username: true } },
      rewards: { select: { userId: true } },
    },
  }), prisma.user.findUnique({ where: { id: userId }, select: { coins: true } })]);
  const stakeIds = [...new Set(battles.flatMap((battle) => [battle.challengerStakeCardId, battle.opponentStakeCardId]).filter((id): id is string => !!id))];
  const stakeCards = await prisma.card.findMany({ where: { id: { in: stakeIds } }, select: { id: true, game: { select: { name: true } }, studio: { select: { name: true } } } });
  const stakeNames = new Map(stakeCards.map((card) => [card.id, card.game?.name ?? card.studio?.name ?? "Carte"]));
  return NextResponse.json({ selfId: userId, coins: user?.coins ?? 0, battles: battles.map(({ answerIndex, question, ...battle }) => {
    void answerIndex;
    return {
      ...battle,
      challengerDeck: battle.status === "PENDING" && battle.challengerId !== userId ? [] : publicBattleDeck(deckFromJson(battle.challengerDeck)),
      opponentDeck: battle.opponentDeck ? (battle.status === "PENDING" && battle.opponentId !== userId ? [] : publicBattleDeck(deckFromJson(battle.opponentDeck))) : null,
      challengerStakeCardName: battle.challengerStakeCardId ? stakeNames.get(battle.challengerStakeCardId) ?? "Carte indisponible" : null,
      opponentStakeCardName: battle.opponentStakeCardId ? stakeNames.get(battle.opponentStakeCardId) ?? "Carte indisponible" : null,
      question: battle.currentTurnId === userId ? question : null,
      rewards: battle.rewards.map((reward) => reward.userId),
    };
  }) });
}

export async function POST(req: Request) {
  const userId = await playerId();
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  let body: { opponentId?: unknown; cardIds?: unknown; stakeCoins?: unknown; stakeCardId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Requête invalide" }, { status: 400 }); }
  if (typeof body.opponentId !== "string" || body.opponentId === userId) {
    return NextResponse.json({ error: "Adversaire invalide" }, { status: 400 });
  }
  try {
    const battle = await prisma.$transaction(async (tx) => {
      const stakeCoins = parseStakeCoins(body.stakeCoins);
      const stakeCardId = parseStakeCardId(body.stakeCardId);
      const opponent = await tx.user.findFirst({ where: { id: body.opponentId as string, status: "ACTIVE" }, select: { id: true } });
      if (!opponent) throw new Error("Joueur introuvable ou inactif");
      const pending = await tx.battle.count({ where: { challengerId: userId, status: "PENDING" } });
      if (pending >= 3) throw new Error("Tu as déjà 3 défis en attente");
      const deck = await loadBattleDeck(tx, userId, body.cardIds);
      if (stakeCardId && deck.some((card) => card.id === stakeCardId)) throw new Error("La carte misée doit rester hors des 5 cartes jouables");
      await assertStakeCardAvailable(tx, userId, stakeCardId);
      if (stakeCoins > 0) {
        const debited = await tx.user.updateMany({ where: { id: userId, coins: { gte: stakeCoins } }, data: { coins: { decrement: stakeCoins } } });
        if (debited.count !== 1) throw new Error("Pièces insuffisantes pour cette mise");
      }
      const newBattle = await tx.battle.create({ data: { challengerId: userId, opponentId: opponent.id, challengerDeck: deck, challengerStakeCoins: stakeCoins, challengerStakeCardId: stakeCardId } });
      return newBattle;
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ id: battle.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossible de créer le défi" }, { status: 400 });
  }
}
