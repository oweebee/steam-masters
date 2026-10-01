import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildLeaderboard } from "@/lib/leaderboard";

export async function POST(request: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rewardKey = String((await request.json().catch(() => null))?.rewardKey ?? "");
  if (!rewardKey || rewardKey.length > 500) return NextResponse.json({ error: "Récompense invalide" }, { status: 400 });

  const [user, games, studios] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId, status: "ACTIVE" }, select: { id: true, username: true, cards: { select: { rarity: true, gameId: true, studioId: true } } } }),
    prisma.steamGame.findMany({ select: { id: true, name: true, contentType: true, source: true, parentGameId: true, dlcAppIds: true, platforms: true, developers: true } }),
    prisma.studio.findMany({ select: { id: true, name: true } }),
  ]);
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  const reward = buildLeaderboard([user], games, studios)[0]?.rewards.find((item) => item.key === rewardKey);
  if (!reward) return NextResponse.json({ error: "Objectif non débloqué" }, { status: 403 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.leaderboardRewardClaim.create({ data: { userId, rewardKey, coins: reward.coins } });
      return tx.user.update({ where: { id: userId }, data: { coins: { increment: reward.coins } }, select: { coins: true } });
    });
    return NextResponse.json({ rewardKey, awarded: reward.coins, coins: result.coins });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Récompense déjà récupérée" }, { status: 409 });
    throw error;
  }
}
