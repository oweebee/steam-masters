import { NextResponse } from "next/server";
import type { SteamGame, Studio } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isEpicGameEligible, isLegendaryGameEligible } from "@/lib/catalogRarity";
import { rollCardRarity, RARITY_CAP, nextLowerRarity, rollAtkForRarity, type Rarity } from "@/lib/rarityRoll";
import { getFreeCardCooldownMinutes, getRarityWeights } from "@/lib/rarityConfig";

const MAX_SAVED_BOOSTERS = 5;
type StudioResponse = Omit<Studio, "games"> & {
  coverImage: string | null;
  games: { name: string; appid: string; hasCard: boolean; headerImage: string }[];
};
type DrawSource = { game: SteamGame; studio: null; studioEpicEligible: false } | { game: null; studio: StudioResponse; studioEpicEligible: boolean };

function boosterStatus(lastBoosterAt: Date | null, now: number, cooldownMs: number) {
  if (!lastBoosterAt) return { readyCount: 1, remainingMs: 0 };
  const elapsed = Math.max(0, now - lastBoosterAt.getTime());
  const earned = Math.floor(elapsed / cooldownMs);
  const readyCount = Math.min(MAX_SAVED_BOOSTERS, earned);
  const remainingMs = readyCount >= MAX_SAVED_BOOSTERS ? 0 : cooldownMs - (elapsed % cooldownMs);
  return { readyCount, remainingMs };
}

async function requireUser() {
  const session = await auth();
  if (!session) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const userId = (session.user as { id?: string }).id;
  if (!userId) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { response: NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 }) };
  return { user };
}

export async function GET() {
  const result = await requireUser();
  if ("response" in result) return result.response;
  const cooldownMs = (await getFreeCardCooldownMinutes()) * 60_000;
  const status = boosterStatus(result.user.lastBoosterAt, Date.now(), cooldownMs);
  return NextResponse.json({ ...status, maxCredits: MAX_SAVED_BOOSTERS, ready: status.readyCount > 0, cooldownMs });
}

async function selectDrawSource(gamePoolSize: number, studioPoolSize: number): Promise<DrawSource | null> {
  const totalPool = gamePoolSize + studioPoolSize;
  if (totalPool === 0) return null;
  const idx = Math.floor(Math.random() * totalPool);
  if (idx < gamePoolSize) {
    const [game] = await prisma.steamGame.findMany({ take: 1, skip: idx, orderBy: { id: "asc" } });
    return game ? { game, studio: null, studioEpicEligible: false } : null;
  }
  const [studio] = await prisma.studio.findMany({ take: 1, skip: idx - gamePoolSize, orderBy: { id: "asc" } });
  if (!studio) return null;
  const studioGames = await prisma.steamGame.findMany({
    where: { contentType: "GAME", OR: [{ developers: { has: studio.name } }, ...(studio.games.length ? [{ name: { in: studio.games } }] : [])] },
    orderBy: { name: "asc" },
  });
  const epicEligible = studio.rarity === "EPIC" && studioGames.some((game) => isEpicGameEligible(game.ownerEstimate, game.rarity));
  const responseStudio: StudioResponse = {
    ...studio,
    coverImage: studioGames[0]?.headerImage ?? null,
    games: studioGames.map((game) => ({ name: game.name, appid: game.id, hasCard: true, headerImage: game.headerImage })),
  };
  return { game: null, studio: responseStudio, studioEpicEligible: epicEligible };
}

function rarityForSource(source: DrawSource, weights: Awaited<ReturnType<typeof getRarityWeights>>): Rarity {
  let rarity = rollCardRarity(weights);
  if (source.game?.contentType === "DLC") {
    return rarity === "LEGENDARY" || rarity === "EPIC" ? "RARE" : rarity;
  }
  if (rarity === "LEGENDARY" && (!source.game || !isLegendaryGameEligible(source.game.ownerEstimate, source.game.rarity))) rarity = "EPIC";
  if (rarity === "EPIC" && !(source.game ? isEpicGameEligible(source.game.ownerEstimate, source.game.rarity) : source.studioEpicEligible)) rarity = "RARE";
  return rarity;
}

export async function POST(req: Request) {
  const result = await requireUser();
  if ("response" in result) return result.response;
  const user = result.user;
  const body = await req.json().catch(() => ({}));
  const now = Date.now();
  const [cooldownMinutes, rarityWeights] = await Promise.all([getFreeCardCooldownMinutes(), getRarityWeights()]);
  const cooldownMs = cooldownMinutes * 60_000;
  const status = boosterStatus(user.lastBoosterAt, now, cooldownMs);
  const quantity = body?.count === "all" ? status.readyCount : body?.count === undefined ? 1 : Number(body.count);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_SAVED_BOOSTERS) {
    return NextResponse.json({ error: `Choisis entre 1 et ${MAX_SAVED_BOOSTERS} boosters.` }, { status: 400 });
  }
  if (status.readyCount < quantity) {
    return NextResponse.json({ error: status.readyCount ? `Tu as ${status.readyCount} booster(s) prêt(s).` : "Aucun booster prêt pour le moment.", readyCount: status.readyCount, remainingMs: status.remainingMs, maxCredits: MAX_SAVED_BOOSTERS }, { status: 429 });
  }

  const [gamePoolSize, studioPoolSize] = await Promise.all([prisma.steamGame.count(), prisma.studio.count()]);
  if (gamePoolSize + studioPoolSize === 0) return NextResponse.json({ error: "Catalogue vide — aucun jeu importé pour l’instant" }, { status: 400 });
  const sources: DrawSource[] = [];
  for (let i = 0; i < quantity; i += 1) {
    const source = await selectDrawSource(gamePoolSize, studioPoolSize);
    if (!source) return NextResponse.json({ error: "Catalogue modifié entre-temps, réessaie." }, { status: 409 });
    sources.push(source);
  }

  const nextLastBoosterAt = user.lastBoosterAt
    ? new Date(user.lastBoosterAt.getTime() + quantity * cooldownMs)
    : new Date(now);

  const cards = await prisma.$transaction(async (tx) => {
    const claimed = await tx.user.updateMany({
      where: { id: user.id, lastBoosterAt: user.lastBoosterAt },
      data: { lastBoosterAt: nextLastBoosterAt },
    });
    if (claimed.count !== 1) return null;

    const created = [];
    for (const source of sources) {
      let rarity = rarityForSource(source, rarityWeights);
      const gameId = source.game?.id;
      const studioId = source.studio?.id;
      for (;;) {
        const cap = RARITY_CAP[rarity];
        if (cap === Infinity) break;
        const existing = await tx.card.count({ where: gameId ? { gameId, rarity } : { studioId, rarity } });
        if (existing < cap) break;
        const lower = nextLowerRarity(rarity);
        if (!lower) break;
        rarity = lower;
      }
      created.push(await tx.card.create({ data: { userId: user.id, gameId, studioId, rarity, atk: rollAtkForRarity(rarity) } }));
    }
    return created;
  });

  if (!cards) {
    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { lastBoosterAt: true } });
    const latest = boosterStatus(fresh?.lastBoosterAt ?? null, Date.now(), cooldownMs);
    return NextResponse.json({ error: "Stock de boosters modifié entre-temps, actualise la page.", readyCount: latest.readyCount, remainingMs: latest.remainingMs, maxCredits: MAX_SAVED_BOOSTERS }, { status: 429 });
  }

  const updatedStatus = boosterStatus(nextLastBoosterAt, Date.now(), cooldownMs);
  const draws = cards.map((card, index) => {
    const source = sources[index];
    return {
      card,
      game: source.game ? { ...source.game, rarity: card.rarity, atk: card.atk } : null,
      studio: source.studio ? { ...source.studio, rarity: card.rarity, atk: card.atk } : null,
    };
  });
  return NextResponse.json({ ...draws[0], cards: draws, readyCount: updatedStatus.readyCount, remainingMs: updatedStatus.remainingMs, maxCredits: MAX_SAVED_BOOSTERS });
}
