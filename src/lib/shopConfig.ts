import { prisma } from "@/lib/prisma";
import type { Rarity } from "@/lib/rarityRoll";

export const SHOP_PRICE_RANGES_KEY = "SHOP_PRICE_RANGES";
export const SHOP_SIZE = 50;
export const SHOP_ROTATION_MS = 60 * 60 * 1000;
export const SHOP_RARITIES: Rarity[] = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];

export type ShopPriceRange = { min: number; max: number };
export type ShopPriceRanges = Record<Rarity, ShopPriceRange>;

export function parseShopPriceRanges(value: string | null | undefined): ShopPriceRanges | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const ranges = {} as ShopPriceRanges;
    for (const rarity of SHOP_RARITIES) {
      const range = parsed[rarity] as Partial<ShopPriceRange> | undefined;
      if (!range || !Number.isInteger(range.min) || !Number.isInteger(range.max)) return null;
      if ((range.min as number) < 1 || (range.max as number) > 1_000_000 || (range.min as number) > (range.max as number)) return null;
      ranges[rarity] = { min: range.min as number, max: range.max as number };
    }
    return ranges;
  } catch {
    return null;
  }
}

export function randomShopPrice(range: ShopPriceRange, random = Math.random) {
  return range.min + Math.floor(random() * (range.max - range.min + 1));
}

export function shopRotationWindow(now = new Date()) {
  const startsAt = new Date(Math.floor(now.getTime() / SHOP_ROTATION_MS) * SHOP_ROTATION_MS);
  return { startsAt, endsAt: new Date(startsAt.getTime() + SHOP_ROTATION_MS) };
}

export async function getShopPriceRanges() {
  const setting = await prisma.appSetting.findUnique({ where: { key: SHOP_PRICE_RANGES_KEY }, select: { value: true } });
  return parseShopPriceRanges(setting?.value);
}
