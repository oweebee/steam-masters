import { prisma } from "@/lib/prisma";
import type { Rarity } from "@/lib/rarityRoll";

export const SHOP_PRICE_RANGES_KEY = "SHOP_PRICE_RANGES";
export const SHOP_ROTATION_HOURS_KEY = "SHOP_ROTATION_HOURS";
export const SHOP_SIZE = 50;
export const DEFAULT_SHOP_ROTATION_HOURS = 1;
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

export function parseShopRotationHours(value: unknown) {
  const hours = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(hours) && hours >= 1 && hours <= 24 ? hours : null;
}

export function shopRotationWindow(now = new Date(), hours = DEFAULT_SHOP_ROTATION_HOURS) {
  const validHours = parseShopRotationHours(hours) ?? DEFAULT_SHOP_ROTATION_HOURS;
  const durationMs = validHours * 60 * 60 * 1000;
  const startsAt = new Date(Math.floor(now.getTime() / durationMs) * durationMs);
  return { startsAt, endsAt: new Date(startsAt.getTime() + durationMs) };
}

export async function getShopPriceRanges() {
  const setting = await prisma.appSetting.findUnique({ where: { key: SHOP_PRICE_RANGES_KEY }, select: { value: true } });
  return parseShopPriceRanges(setting?.value);
}

export async function getShopRotationHours() {
  const setting = await prisma.appSetting.findUnique({ where: { key: SHOP_ROTATION_HOURS_KEY }, select: { value: true } });
  return parseShopRotationHours(setting?.value) ?? DEFAULT_SHOP_ROTATION_HOURS;
}
