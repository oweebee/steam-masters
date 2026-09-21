import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rollCardRarity } from "@/lib/rarityRoll";

const BOOSTER_INTERVAL_MS = 60 * 60 * 1000; // 1 heure

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: (session.user as any).id } });
  if (!user) return NextResponse.json({ error: "User introuvable" }, { status: 404 });

  const now = Date.now();
  const last = user.lastBoosterAt?.getTime() ?? 0;
  const remaining = Math.max(0, BOOSTER_INTERVAL_MS - (now - last));

  return NextResponse.json({ ready: remaining === 0, remainingMs: remaining });
}

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User introuvable" }, { status: 404 });

  const now = Date.now();
  const last = user.lastBoosterAt?.getTime() ?? 0;
  const remaining = Math.max(0, BOOSTER_INTERVAL_MS - (now - last));
  if (remaining > 0) {
    return NextResponse.json({ error: "Booster pas encore disponible", remainingMs: remaining }, { status: 429 });
  }

  // Les cartes ne sont plus uniques : un même jeu/studio peut être tiré plusieurs
  // fois par plusieurs joueurs (ou le même). Le tirage pioche uniformément dans
  // TOUT le catalogue (jeux + studios), puis roule une rareté indépendante pour
  // cet exemplaire via la loot table fixe (voir lib/rarityRoll.ts).
  const [gamePoolSize, studioPoolSize] = await Promise.all([
    prisma.steamGame.count(),
    prisma.studio.count(),
  ]);
  const totalPool = gamePoolSize + studioPoolSize;

  if (totalPool === 0) {
    return NextResponse.json({ error: "Catalogue vide — aucun jeu importé pour l'instant" }, { status: 400 });
  }

  const idx = Math.floor(Math.random() * totalPool);
  const rarity = rollCardRarity();

  let cardData: { userId: string; gameId?: string; studioId?: string; rarity: ReturnType<typeof rollCardRarity> };
  let responseGame = null as any;
  let responseStudio = null as any;

  if (idx < gamePoolSize) {
    const [game] = await prisma.steamGame.findMany({ take: 1, skip: idx });
    cardData = { userId, gameId: game.id, rarity };
    responseGame = { ...game, rarity };
  } else {
    const [studio] = await prisma.studio.findMany({ take: 1, skip: idx - gamePoolSize });
    cardData = { userId, studioId: studio.id, rarity };
    responseStudio = { ...studio, rarity };
  }

  const [card] = await prisma.$transaction([
    prisma.card.create({ data: cardData }),
    prisma.user.update({ where: { id: userId }, data: { lastBoosterAt: new Date() } }),
  ]);

  return NextResponse.json({ card, game: responseGame, studio: responseStudio });
}
