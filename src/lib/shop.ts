import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isEpicGameEligible, isLegendaryGameEligible } from "@/lib/catalogRarity";
import { getRarityWeights } from "@/lib/rarityConfig";
import { rollAtkForRarity, type Rarity, type RarityWeights } from "@/lib/rarityRoll";
import { shopRarityQuotas, selectShopStock } from "@/lib/shopDistribution";
import { getShopPriceRanges, getShopRotationHours, randomShopPrice, SHOP_SIZE, shopRotationWindow, type ShopPriceRanges } from "@/lib/shopConfig";
import { buildShopWatchNotifications, type ShopNotificationSubject } from "@/lib/shopNotifications";
import { dispatchPushNotifications, type PushNotificationInput } from "@/lib/webPush";

type GameCandidate = {
  kind: "GAME";
  id: string;
  name: string;
  reviewScore: number;
  ownerEstimate: number;
  rarity: Rarity;
  contentType: "GAME" | "DLC";
};
type StudioCandidate = {
  kind: "STUDIO";
  id: string;
  name: string;
  avgReviewScore: number;
  rarity: Rarity;
};
type ShopCandidate = GameCandidate | StudioCandidate;

function shuffle<T>(values: T[]) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function eligibleForRarity(candidate: ShopCandidate, rarity: Rarity) {
  if (candidate.kind === "GAME" && candidate.contentType === "DLC" && (rarity === "LEGENDARY" || rarity === "EPIC")) return false;
  if (rarity === "LEGENDARY") return candidate.kind === "GAME" && isLegendaryGameEligible(candidate.ownerEstimate, candidate.rarity);
  if (rarity === "EPIC") return candidate.kind === "GAME" ? isEpicGameEligible(candidate.ownerEstimate, candidate.rarity) : candidate.rarity === "EPIC";
  return true;
}

export async function createRotation(
  tx: Prisma.TransactionClient,
  startsAt: Date,
  endsAt: Date,
  ranges: ShopPriceRanges,
  weights: RarityWeights,
) {
  const existing = await tx.shopRotation.findUnique({ where: { startsAt } });
  if (existing) return { rotation: existing, notifications: [] as PushNotificationInput[] };

  const [games, studios] = await Promise.all([
    tx.steamGame.findMany({ select: { id: true, name: true, reviewScore: true, ownerEstimate: true, rarity: true, contentType: true } }),
    tx.studio.findMany({ select: { id: true, name: true, avgReviewScore: true, rarity: true } }),
  ]);

  const candidates: ShopCandidate[] = [
    ...games.map((game) => ({ ...game, kind: "GAME" as const })),
    ...studios.map((studio) => ({ ...studio, kind: "STUDIO" as const })),
  ];
  const offers: Prisma.ShopOfferCreateManyInput[] = [];
  const offerNames = new Map<string, string>();
  const rotation = await tx.shopRotation.create({ data: { startsAt, endsAt } });

  const stock = selectShopStock(shuffle(candidates), shopRarityQuotas(weights, SHOP_SIZE), (candidate, rarity) => {
    return eligibleForRarity(candidate, rarity);
  });
  for (const { candidate, rarity } of stock) {
    const subjectKey = `${candidate.kind}:${candidate.id}`;
    const reviewScore = candidate.kind === "GAME" ? candidate.reviewScore : candidate.avgReviewScore;
    const price = randomShopPrice(ranges[rarity]);
    offers.push({
      rotationId: rotation.id,
      subjectKey,
      gameId: candidate.kind === "GAME" ? candidate.id : null,
      studioId: candidate.kind === "STUDIO" ? candidate.id : null,
      rarity,
      atk: rollAtkForRarity(rarity, reviewScore),
      price,
    });
    offerNames.set(subjectKey, candidate.name);
  }

  if (offers.length !== SHOP_SIZE) {
    throw new Error(`Catalogue insuffisant : ${offers.length} cartes distinctes sont disponibles pour le magasin sur ${SHOP_SIZE} requises.`);
  }
  await tx.shopOffer.createMany({ data: offers });
  const createdOffers = await tx.shopOffer.findMany({
    where: { rotationId: rotation.id },
    select: { id: true, subjectKey: true, price: true },
  });
  const notificationSubjects: ShopNotificationSubject[] = createdOffers.map((offer) => ({
    offerId: offer.id,
    subjectKey: offer.subjectKey,
    name: offerNames.get(offer.subjectKey) ?? "Carte suivie",
    price: offer.price,
  }));
  const gameIds = offers.flatMap((offer) => offer.gameId ? [offer.gameId] : []);
  const studioIds = offers.flatMap((offer) => offer.studioId ? [offer.studioId] : []);
  const watchers = await tx.cardWatch.findMany({
    where: { OR: [{ gameId: { in: gameIds } }, { studioId: { in: studioIds } }] },
    select: { userId: true, gameId: true, studioId: true },
  });
  const notifications = buildShopWatchNotifications(notificationSubjects, watchers);
  if (notifications.length > 0) await tx.notification.createMany({ data: notifications });
  return { rotation, notifications };
}

export async function ensureActiveShopRotation(now = new Date()) {
  const [ranges, rotationHours] = await Promise.all([getShopPriceRanges(), getShopRotationHours()]);
  if (!ranges) throw new Error("Le magasin attend la configuration des prix par rareté dans l’administration.");
  const active = await prisma.shopRotation.findFirst({ where: { endsAt: { gt: now } }, orderBy: { startsAt: "desc" } });
  if (active) return active;
  const window = shopRotationWindow(now, rotationHours);
  const usedSlot = await prisma.shopRotation.findUnique({ where: { startsAt: window.startsAt }, select: { id: true } });
  const startsAt = usedSlot ? now : window.startsAt;
  const endsAt = usedSlot ? new Date(now.getTime() + rotationHours * 60 * 60 * 1000) : window.endsAt;
  const weights = await getRarityWeights();
  try {
    const result = await prisma.$transaction(
      (tx) => createRotation(tx, startsAt, endsAt, ranges, weights),
      { isolationLevel: "Serializable" },
    );
    await dispatchPushNotifications(result.notifications);
    return result.rotation;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
      const concurrent = await prisma.shopRotation.findUnique({ where: { startsAt } });
      if (concurrent) return concurrent;
    }
    throw error;
  }
}

export async function rotateShopNow(now = new Date()) {
  const [ranges, rotationHours] = await Promise.all([getShopPriceRanges(), getShopRotationHours()]);
  if (!ranges) throw new Error("Configure d’abord les cinq fourchettes de prix.");
  const weights = await getRarityWeights();
  const endsAt = new Date(now.getTime() + rotationHours * 60 * 60 * 1000);
  const result = await prisma.$transaction(async (tx) => {
    await tx.shopRotation.updateMany({ where: { endsAt: { gt: now } }, data: { endsAt: now } });
    return createRotation(tx, now, endsAt, ranges, weights);
  }, { isolationLevel: "Serializable" });
  await dispatchPushNotifications(result.notifications);
  return result.rotation;
}
