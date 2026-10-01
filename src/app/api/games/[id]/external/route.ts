import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getIgdbGamePageUrl } from "@/lib/igdb";
import { igdbNumericId } from "@/lib/igdbIds";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  if (!await auth()) return new NextResponse("Connexion requise", { status: 401 });
  const { id } = await context.params;
  if (!/^igdb-\d+(?:-p\d+)?$/.test(id)) return new NextResponse("Identifiant invalide", { status: 400 });
  const game = await prisma.steamGame.findUnique({ where: { id }, select: { source: true } });
  if (!game || game.source !== "IGDB") return new NextResponse("Jeu introuvable", { status: 404 });
  try { return NextResponse.redirect(await getIgdbGamePageUrl(igdbNumericId(id)), 307); }
  catch { return new NextResponse("IGDB est momentanément indisponible. Recharge cet onglet pour réessayer.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
}
