import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { importCatalogGameIgdb } from "@/lib/catalogImportIgdb";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role?: string }).role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.igdbId) return NextResponse.json({ error: "igdbId requis" }, { status: 400 });
  const platformId = Number(body.platformId);
  return importCatalogGameIgdb(body.igdbId, body.runId, !!body.skipRecalc, Number.isSafeInteger(platformId) && platformId > 0 ? platformId : undefined);
}
