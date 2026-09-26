import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { recalculateCatalogRarity } from "@/lib/catalogRarity";

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as { role?: string })?.role !== "ADMIN") throw new Error("Unauthorized");
}

// Recalcule uniquement SteamGame.rarity + Studio.rarity selon les seuils configurés.
// Ne touche PAS aux cartes des joueurs (skipCards=true).
export async function POST() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const result = await recalculateCatalogRarity({ skipCards: true });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    gamesRarityFixed: (result.gamesFixed ?? 0) + (result.studiosFixed ?? 0),
    entriesScanned: result.entriesScanned ?? 0,
  });
}
