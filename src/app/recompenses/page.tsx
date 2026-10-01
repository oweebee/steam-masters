import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { getUserRewardState } from "@/lib/userRewards";
import { RewardsClient } from "./RewardsClient";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");
  const { rewards, claims } = await getUserRewardState(userId);
  return <AppShell><RewardsClient rewards={rewards} claims={claims.map((claim) => ({ ...claim, claimedAt: claim.claimedAt.toISOString() }))} /></AppShell>;
}
