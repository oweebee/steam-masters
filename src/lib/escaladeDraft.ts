import { createHmac } from "node:crypto";
import { DRAFT_BUDGET, abilityLayoutForSeed } from "./escalade";

const HOUR_MS = 60 * 60 * 1000;
function secret(): string {
  const value = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET requis pour le tirage de bataille.");
  return "steam-masters-local-escalade-draft";
}
function seedForDeal(dealId: number): number {
  const digest = createHmac("sha256", secret()).update(`escalade:${dealId}`).digest();
  return digest.readUInt32BE(0) || 1;
}
export function currentDraftOffer(now = Date.now()) {
  const dealId = Math.floor(now / HOUR_MS);
  const seed = seedForDeal(dealId);
  return { dealId, seed, budget: DRAFT_BUDGET, layout: abilityLayoutForSeed(seed, 1) };
}
export function verifyDraftOffer(value: unknown, now = Date.now()) {
  if (!Number.isSafeInteger(value)) throw new Error("Tirage tactique invalide : recharge la page.");
  const dealId = value as number;
  const current = Math.floor(now / HOUR_MS);
  if (dealId !== current && dealId !== current - 1) throw new Error("Le tirage tactique a expiré : recharge la page.");
  const seed = seedForDeal(dealId);
  return { dealId, seed, budget: DRAFT_BUDGET, layout: abilityLayoutForSeed(seed, 1) };
}
