import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readCoherenceRegistry, studioGameIsIgnored } from "@/lib/catalogCoherence";

// Une seule fiche liée à un studio, jamais une liste complète du catalogue.
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await auth()) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { id } = await context.params;
  const studioName = req.nextUrl.searchParams.get("studio")?.trim();
  if (!/^[0-9]+$/.test(id) || !studioName || studioName.length > 120) {
    return NextResponse.json({ error: "Carte invalide" }, { status: 400 });
  }
  const game = await prisma.steamGame.findUnique({ where: { id }, select: {
    id: true, name: true, headerImage: true, description: true, atk: true, def: true,
    rarity: true, tags: true, developers: true, reviewScore: true, peakCcu: true,
    ownerEstimate: true, priceCents: true, isFree: true, contentType: true, parentGameId: true,
  } });
  if (!game) return NextResponse.json({ error: "Carte introuvable" }, { status: 404 });
  const linkedStudio = await prisma.studio.findUnique({ where: { name: studioName }, select: { id: true, name: true, games: true } });
  if (linkedStudio && studioGameIsIgnored(linkedStudio, game, await readCoherenceRegistry())) return NextResponse.json({ error: "Lien retiré du catalogue" }, { status: 404 });
  if (!game.developers.includes(studioName)) {
    const studio = await prisma.studio.findUnique({ where: { name: studioName }, select: { games: true } });
    if (!studio?.games.includes(game.name)) return NextResponse.json({ error: "Ce jeu n'est pas lié au studio" }, { status: 404 });
  }
  return NextResponse.json(game);
}
