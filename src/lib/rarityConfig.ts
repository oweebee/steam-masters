import { prisma } from "@/lib/prisma";
import { DEFAULT_RARITY_WEIGHTS, type RarityWeights } from "@/lib/rarityRoll";

export const RARITY_WEIGHTS_KEY = "RARITY_LOOT_WEIGHTS";
export const FREE_CARD_COOLDOWN_KEY = "FREE_CARD_COOLDOWN_MINUTES";
export const DEFAULT_FREE_CARD_COOLDOWN_MINUTES = 60;

export function parseFreeCardCooldownMinutes(value: string | null | undefined) {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 360 ? minutes : DEFAULT_FREE_CARD_COOLDOWN_MINUTES;
}

export function parseRarityWeights(value: string | null | undefined): RarityWeights {
  if (!value) return { ...DEFAULT_RARITY_WEIGHTS };
  try {
    const parsed = JSON.parse(value) as Partial<RarityWeights>;
    const weights = {
      LEGENDARY: Number(parsed.LEGENDARY),
      EPIC: Number(parsed.EPIC),
      RARE: Number(parsed.RARE),
      UNCOMMON: Number(parsed.UNCOMMON),
      COMMON: Number(parsed.COMMON),
    };
    const values = Object.values(weights);
    if (values.some((weight) => !Number.isFinite(weight) || weight < 0 || weight > 100)) return { ...DEFAULT_RARITY_WEIGHTS };
    if (Math.abs(values.reduce((sum, weight) => sum + weight, 0) - 100) > 0.01) return { ...DEFAULT_RARITY_WEIGHTS };
    return weights;
  } catch {
    return { ...DEFAULT_RARITY_WEIGHTS };
  }
}

export async function getRarityWeights(): Promise<RarityWeights> {
  const setting = await prisma.appSetting.findUnique({ where: { key: RARITY_WEIGHTS_KEY }, select: { value: true } });
  return parseRarityWeights(setting?.value);
}

export async function getFreeCardCooldownMinutes() {
  const setting = await prisma.appSetting.findUnique({ where: { key: FREE_CARD_COOLDOWN_KEY }, select: { value: true } });
  return parseFreeCardCooldownMinutes(setting?.value);
}
