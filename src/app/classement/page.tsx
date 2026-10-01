import { AppShell } from "@/components/AppShell";
import { prisma } from "@/lib/prisma";
import { buildLeaderboard } from "@/lib/leaderboard";
import { LeaderboardClient } from "./LeaderboardClient";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();
  const selfId = (session?.user as { id?: string } | undefined)?.id ?? "";
  const [users, games, studios, claims] = await Promise.all([
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, username: true, cards: { select: { rarity: true, gameId: true, studioId: true } } },
    }),
    prisma.steamGame.findMany({
      select: { id: true, name: true, contentType: true, source: true, parentGameId: true, dlcAppIds: true, platforms: true, developers: true },
    }),
    prisma.studio.findMany({ select: { id: true, name: true } }),
    selfId ? prisma.leaderboardRewardClaim.findMany({ where: { userId: selfId }, select: { rewardKey: true } }) : [],
  ]);
  const entries = buildLeaderboard(users, games, studios);

  return (
    <AppShell>
      <LeaderboardClient entries={entries} selfId={selfId} claimedRewardKeys={claims.map((claim) => claim.rewardKey)} />
    </AppShell>
  );
}
