import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { importCatalogGame } from "@/lib/catalogImport";
export async function GET() {
  if (((await auth())?.user as { role?: string } | undefined)?.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  return NextResponse.json(await prisma.steamGame.findMany({ orderBy: { updatedAt: "desc" } }));
}
export async function POST(req: NextRequest) {
  if (((await auth())?.user as { role?: string } | undefined)?.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || !/^\d+$/.test(String(body.appid ?? ""))) return NextResponse.json({ error: "AppID invalide" }, { status: 400 });
  return importCatalogGame(String(body.appid), typeof body.runId === "string" ? body.runId : undefined, body.skipRecalc === true);
}
