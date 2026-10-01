import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { searchIgdbCatalog } from "@/lib/igdb";

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as any)?.role !== "ADMIN") throw new Error("Unauthorized");
}

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const term = req.nextUrl.searchParams.get("q")?.trim();
  if (!term || term.length < 2) return NextResponse.json([]);
  try {
    const platformParam = req.nextUrl.searchParams.get("platform");
    const platformId = platformParam ? parseInt(platformParam, 10) : undefined;
    const items = await searchIgdbCatalog(term, platformId && !isNaN(platformId) ? platformId : undefined);
    return NextResponse.json(items.map((it) => ({ igdbId: it.igdbId, name: it.name })));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Recherche IGDB indisponible" }, { status: 502 });
  }
}
