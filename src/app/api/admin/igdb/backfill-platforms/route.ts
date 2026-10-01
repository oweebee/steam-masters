import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { backfillIgdbPlatforms } from "@/lib/igdb";

export async function POST() {
  const session = await auth();
  if (!session || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await backfillIgdbPlatforms();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Backfill impossible" }, { status: 502 });
  }
}
