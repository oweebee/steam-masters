import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSteamGameData, upsertStudiosForDevelopers } from "@/lib/steam";
import { rollCardRarity } from "@/lib/rarityRoll";

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as any)?.role !== "ADMIN") throw new Error("Unauthorized");
}

export async function GET() {
  const games = await prisma.steamGame.findMany({ orderBy: { updatedAt: "desc" } });
  return NextResponse.json(games);
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const { appid } = await req.json();
  if (!appid) return NextResponse.json({ error: "appid requis" }, { status: 400 });

  let data;
  try {
    data = await getSteamGameData(Number(appid));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  if (data.ownerEstimate <= 0) {
    return NextResponse.json({ error: "Jeu refusé : DEF doit être supérieur à 0" }, { status: 422 });
  }

  const existing = await prisma.steamGame.findUnique({
    where: { id: String(data.appid) },
    select: { rarity: true },
  });
  // Rareté tirée une seule fois à la création. Un rafraîchissement Steam ne la
  // recalcule jamais et ne transforme donc plus les petits jeux en Légendaires.
  const rarity = existing?.rarity ?? rollCardRarity();

  const game = await prisma.steamGame.upsert({
    where: { id: String(data.appid) },
    update: {
      name: data.name,
      description: data.description,
      headerImage: data.headerImage,
      reviewScore: data.reviewScore,
      peakCcu: data.peakCcu,
      ownerEstimate: data.ownerEstimate,
      atk: data.reviewScore,
      def: data.ownerEstimate,
      tags: data.tags,
      developers: data.developers,
      priceCents: data.priceCents,
      isFree: data.isFree,
    },
    create: {
      id: String(data.appid),
      name: data.name,
      description: data.description,
      headerImage: data.headerImage,
      reviewScore: data.reviewScore,
      peakCcu: data.peakCcu,
      ownerEstimate: data.ownerEstimate,
      rarity,
      atk: data.reviewScore,
      def: data.ownerEstimate,
      tags: data.tags,
      developers: data.developers,
      priceCents: data.priceCents,
      isFree: data.isFree,
    },
  });

  await upsertStudiosForDevelopers(data.developers);

  return NextResponse.json(game);
}
