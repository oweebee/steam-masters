import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deckFromJson, loadBattleDeck, publicBattleDeck } from "@/lib/battle";

async function playerId() {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id;
}

export async function GET() {
  const userId = await playerId();
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const battles = await prisma.battle.findMany({
    where: { OR: [{ challengerId: userId }, { opponentId: userId }] },
    orderBy: { updatedAt: "desc" },
    take: 60,
    include: {
      challenger: { select: { username: true } },
      opponent: { select: { username: true } },
      rewards: { select: { userId: true } },
    },
  });
  return NextResponse.json({ selfId: userId, battles: battles.map(({ answerIndex, question, ...battle }) => {
    void answerIndex;
    return {
      ...battle,
      challengerDeck: battle.status === "PENDING" && battle.challengerId !== userId ? [] : publicBattleDeck(deckFromJson(battle.challengerDeck)),
      opponentDeck: battle.opponentDeck ? (battle.status === "PENDING" && battle.opponentId !== userId ? [] : publicBattleDeck(deckFromJson(battle.opponentDeck))) : null,
      question: battle.currentTurnId === userId ? question : null,
      rewards: battle.rewards.map((reward) => reward.userId),
    };
  }) });
}

export async function POST(req: Request) {
  const userId = await playerId();
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  let body: { opponentId?: unknown; cardIds?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Requête invalide" }, { status: 400 }); }
  if (typeof body.opponentId !== "string" || body.opponentId === userId) {
    return NextResponse.json({ error: "Adversaire invalide" }, { status: 400 });
  }
  try {
    const battle = await prisma.$transaction(async (tx) => {
      const opponent = await tx.user.findFirst({ where: { id: body.opponentId as string, status: "ACTIVE" }, select: { id: true } });
      if (!opponent) throw new Error("Joueur introuvable ou inactif");
      const pending = await tx.battle.count({ where: { challengerId: userId, status: "PENDING" } });
      if (pending >= 3) throw new Error("Tu as déjà 3 défis en attente");
      const deck = await loadBattleDeck(tx, userId, body.cardIds);
      return tx.battle.create({ data: { challengerId: userId, opponentId: opponent.id, challengerDeck: deck } });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ id: battle.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossible de créer le défi" }, { status: 400 });
  }
}
