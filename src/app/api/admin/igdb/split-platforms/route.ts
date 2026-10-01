import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { splitMultiPlatformIgdbGames } from "@/lib/igdb";
import { recalculateCatalogRarity } from "@/lib/catalogRarity";

export async function POST() {
  const session = await auth();
  if (!session || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await splitMultiPlatformIgdbGames();
    if (result.created > 0) await recalculateCatalogRarity();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scission impossible" }, { status: 500 });
  }
}
