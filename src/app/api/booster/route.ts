import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rollCardRarity, RARITY_CAP, nextLowerRarity, rollAtkForRarity, type Rarity } from "@/lib/rarityRoll";

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

  // Les cartes ne sont plus uniques par défaut : un même jeu/studio peut être tiré
  // plusieurs fois par plusieurs joueurs. Le tirage pioche uniformément dans TOUT
  // le catalogue (jeux + studios), puis roule une rareté indépendante (loot table).
  const [gamePoolSize, studioPoolSize] = await Promise.all([
    prisma.steamGame.count(),
    prisma.studio.count(),
  ]);
  const totalPool = gamePoolSize + studioPoolSize;

  if (totalPool === 0) {
    return NextResponse.json({ error: "Catalogue vide — aucun jeu importé pour l'instant" }, { status: 400 });
  }

  const idx = Math.floor(Math.random() * totalPool);

  let gameId: string | undefined;
  let studioId: string | undefined;
  let responseGame: any = null;
  let responseStudio: any = null;

  if (idx < gamePoolSize) {
    const [game] = await prisma.steamGame.findMany({ take: 1, skip: idx });
    gameId = game.id;
    responseGame = game;
  } else {
    const [studio] = await prisma.studio.findMany({ take: 1, skip: idx - gamePoolSize });
    studioId = studio.id;
    const studioGames = await prisma.steamGame.findMany({
      where: { developers: { has: studio.name } },
      include: { cards: { select: { id: true } } },
      orderBy: { name: "asc" },
    });
    responseStudio = {
      ...studio,
      coverImage: studioGames[0]?.headerImage ?? null,
      games: studioGames.map((game) => ({
        name: game.name,
        appid: game.id,
        hasCard: game.cards.length > 0,
        headerImage: game.headerImage,
      })),
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    // Plafond PAR jeu/studio ET par palier, tous joueurs confondus (voir
    // RARITY_CAP) : Orange=1 (unique sur toute la partie), Violet=5, Bleu=10,
    // Vert=20, Blanc=illimité. Si le palier tiré est déjà plafonné pour ce jeu/
    // studio précis, on redescend d'un cran (jamais on ne change de jeu/studio).
    let rarity: Rarity = rollCardRarity();
    for (;;) {
      const cap = RARITY_CAP[rarity];
      if (cap === Infinity) break;
      const existing = await tx.card.count({
        where: gameId ? { gameId, rarity } : { studioId, rarity },
      });
      if (existing < cap) break;
      const lower = nextLowerRarity(rarity);
      if (!lower) break; // COMMON, jamais plafonné
      rarity = lower;
    }

    // ATK propre à l'exemplaire, roulé dans la bande % de la rareté finale
    // (même principe que la rareté : fixé au tirage, modifiable ensuite
    // seulement par un admin). Voir rollAtkForRarity dans rarityRoll.ts.
    const atk = rollAtkForRarity(rarity);

    const card = await tx.card.create({ data: { userId, gameId, studioId, rarity, atk } });
    await tx.user.update({ where: { id: userId }, data: { lastBoosterAt: new Date() } });
    return card;
  });

  if (responseGame) responseGame = { ...responseGame, rarity: result.rarity, atk: result.atk };
  if (responseStudio) responseStudio = { ...responseStudio, rarity: result.rarity, atk: result.atk };

  return NextResponse.json({ card: result, game: responseGame, studio: responseStudio });
}
