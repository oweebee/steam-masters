import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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

  // Règle : chaque jeu / studio ne peut être possédé que par UNE seule carte au total
  // (unicité globale, cf. @@unique([gameId]) / @@unique([studioId]) sur Card).
  // Le pool ne tire donc que parmi les jeux/studios pas encore réclamés par personne.
  const [gamePoolSize, studioPoolSize] = await Promise.all([
    prisma.steamGame.count({ where: { cards: { none: {} } } }),
    prisma.studio.count({ where: { cards: { none: {} } } }),
  ]);
  const totalPool = gamePoolSize + studioPoolSize;

  if (totalPool === 0) {
    return NextResponse.json(
      { error: "Plus aucune carte disponible — toutes les cartes existantes ont déjà été réclamées" },
      { status: 400 }
    );
  }

  const idx = Math.floor(Math.random() * totalPool);

  let cardData: { userId: string; gameId?: string; studioId?: string };
  let responseGame = null as any;
  let responseStudio = null as any;

  if (idx < gamePoolSize) {
    const [game] = await prisma.steamGame.findMany({ where: { cards: { none: {} } }, take: 1, skip: idx });
    cardData = { userId, gameId: game.id };
    responseGame = game;
  } else {
    const [studio] = await prisma.studio.findMany({
      where: { cards: { none: {} } },
      take: 1,
      skip: idx - gamePoolSize,
    });
    cardData = { userId, studioId: studio.id };
    responseStudio = studio;
  }

  try {
    const [card] = await prisma.$transaction([
      prisma.card.create({ data: cardData }),
      prisma.user.update({ where: { id: userId }, data: { lastBoosterAt: new Date() } }),
    ]);
    return NextResponse.json({ card, game: responseGame, studio: responseStudio });
  } catch (e: any) {
    // Cas rare : deux boosters ouverts en même temps sur le dernier exemplaire dispo (race condition).
    if (e.code === "P2002") {
      return NextResponse.json(
        { error: "Cette carte vient d'être réclamée par quelqu'un d'autre, réessaie" },
        { status: 409 }
      );
    }
    throw e;
  }
}
