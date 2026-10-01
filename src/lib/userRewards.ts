import "server-only";
import { prisma } from "@/lib/prisma";
import { buildLeaderboard, buildRewardObjectives } from "@/lib/leaderboard";

export async function getUserRewardState(userId: string, includeObjectives = false) {
  const [user, games, studios, claims] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId, status: "ACTIVE" },
      select: { id: true, username: true, cards: { select: { rarity: true, gameId: true, studioId: true } } },
    }),
    prisma.steamGame.findMany({
      select: { id: true, name: true, contentType: true, source: true, parentGameId: true, dlcAppIds: true, platforms: true, developers: true },
    }),
    prisma.studio.findMany({ select: { id: true, name: true } }),
    prisma.leaderboardRewardClaim.findMany({ where: { userId }, select: { rewardKey: true, coins: true, claimedAt: true } }),
  ]);
  const objectives = user && includeObjectives ? buildRewardObjectives(user, games, studios) : [];
  const rewards = includeObjectives ? objectives.filter((objective) => objective.unlocked) : user ? buildLeaderboard([user], games, studios)[0]?.rewards ?? [] : [];
  return { user, rewards, objectives, claims };
}
