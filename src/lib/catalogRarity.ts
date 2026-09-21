import type { Rarity } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DISTRIBUTION: { rarity: Rarity; weight: number }[] = [
  { rarity: "LEGENDARY", weight: 0.005 },
  { rarity: "EPIC", weight: 0.05 },
  { rarity: "RARE", weight: 0.10 },
  { rarity: "UNCOMMON", weight: 0.20 },
  { rarity: "COMMON", weight: 0.645 },
];

// Choisit le palier qui manque le plus pour que le catalogue complet
// (SteamGame + Studio) reste au plus près de la distribution cible. Les cartes
// existantes ne sont jamais re-roulées lors d'un import.
export async function getNextCatalogRarity(): Promise<Rarity> {
  const [gameGroups, studioGroups] = await Promise.all([
    prisma.steamGame.groupBy({ by: ["rarity"], _count: { _all: true } }),
    prisma.studio.groupBy({ by: ["rarity"], _count: { _all: true } }),
  ]);
  const current = new Map<Rarity, number>(DISTRIBUTION.map(({ rarity }) => [rarity, 0]));
  for (const group of [...gameGroups, ...studioGroups]) {
    current.set(group.rarity, (current.get(group.rarity) ?? 0) + group._count._all);
  }

  const nextTotal = Array.from(current.values()).reduce((sum, count) => sum + count, 0) + 1;
  const targets = DISTRIBUTION.map((entry, order) => {
    const exact = nextTotal * entry.weight;
    return { ...entry, order, target: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let remaining = nextTotal - targets.reduce((sum, entry) => sum + entry.target, 0);
  for (const entry of [...targets].sort((a, b) => b.fraction - a.fraction || a.order - b.order)) {
    if (remaining <= 0) break;
    entry.target += 1;
    remaining -= 1;
  }

  targets.sort((a, b) => {
    const deficitA = a.target - (current.get(a.rarity) ?? 0);
    const deficitB = b.target - (current.get(b.rarity) ?? 0);
    return deficitB - deficitA || a.order - b.order;
  });
  return targets[0].rarity;
}
