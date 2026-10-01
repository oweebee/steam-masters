import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserRewardState } from "@/lib/userRewards";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { rewards, claims } = await getUserRewardState(userId);
  const claimed = new Set(claims.map((claim) => claim.rewardKey));
  return NextResponse.json({ count: rewards.filter((reward) => !claimed.has(reward.key)).length });
}
