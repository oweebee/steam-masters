import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FREE_CARD_COOLDOWN_KEY, getFreeCardCooldownMinutes, RARITY_WEIGHTS_KEY, getRarityWeights, parseFreeCardCooldownMinutes, parseRarityWeights } from "@/lib/rarityConfig";
import type { Rarity, RarityWeights } from "@/lib/rarityRoll";
import { writeAppLog } from "@/lib/appLog";

const RARITIES: Rarity[] = ["LEGENDARY", "EPIC", "RARE", "UNCOMMON", "COMMON"];

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as { role?: string })?.role !== "ADMIN") throw new Error("Unauthorized");
}

function validWeights(value: unknown): value is RarityWeights {
  if (!value || typeof value !== "object") return false;
  const weights = value as Record<string, unknown>;
  const values = RARITIES.map((rarity) => weights[rarity]);
  return values.every((weight) => typeof weight === "number" && Number.isFinite(weight) && weight >= 0 && weight <= 100)
    && Math.abs((values as number[]).reduce((sum, weight) => sum + weight, 0) - 100) <= 0.01;
}

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const [weights, cooldownMinutes, instanceGroups, gameGroups, studioGroups] = await Promise.all([
    getRarityWeights(),
    getFreeCardCooldownMinutes(),
    prisma.card.groupBy({ by: ["rarity"], _count: { _all: true } }),
    prisma.steamGame.groupBy({ by: ["rarity"], _count: { _all: true } }),
    prisma.studio.groupBy({ by: ["rarity"], _count: { _all: true } }),
  ]);
  const instances = Object.fromEntries(RARITIES.map((rarity) => [rarity, 0])) as Record<Rarity, number>;
  const catalog = Object.fromEntries(RARITIES.map((rarity) => [rarity, 0])) as Record<Rarity, number>;
  for (const group of instanceGroups) instances[group.rarity] = group._count._all;
  for (const group of [...gameGroups, ...studioGroups]) catalog[group.rarity] += group._count._all;
  return NextResponse.json({ weights, cooldownMinutes, instances, catalog, instanceTotal: Object.values(instances).reduce((a, b) => a + b, 0), catalogTotal: Object.values(catalog).reduce((a, b) => a + b, 0) });
}

export async function PUT(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const body = await req.json().catch(() => null);
  const hasWeights = body?.weights !== undefined;
  const hasCooldown = body?.cooldownMinutes !== undefined;
  if (!hasWeights && !hasCooldown) return NextResponse.json({ error: "Aucun réglage fourni." }, { status: 400 });
  if (hasWeights && !validWeights(body.weights)) return NextResponse.json({ error: "Les cinq taux doivent être positifs ou nuls et leur somme doit faire 100 %." }, { status: 400 });
  if (hasCooldown && (typeof body.cooldownMinutes !== "number" || parseFreeCardCooldownMinutes(String(body.cooldownMinutes)) !== body.cooldownMinutes)) {
    return NextResponse.json({ error: "Le délai doit être un nombre entier compris entre 1 et 360 minutes." }, { status: 400 });
  }
  const weights = hasWeights ? parseRarityWeights(JSON.stringify(body.weights)) : undefined;
  const cooldownMinutes = hasCooldown ? body.cooldownMinutes as number : undefined;
  await prisma.$transaction([
    ...(weights ? [prisma.appSetting.upsert({ where: { key: RARITY_WEIGHTS_KEY }, update: { value: JSON.stringify(weights) }, create: { key: RARITY_WEIGHTS_KEY, value: JSON.stringify(weights) } })] : []),
    ...(cooldownMinutes !== undefined ? [prisma.appSetting.upsert({ where: { key: FREE_CARD_COOLDOWN_KEY }, update: { value: String(cooldownMinutes) }, create: { key: FREE_CARD_COOLDOWN_KEY, value: String(cooldownMinutes) } })] : []),
  ]);
  await writeAppLog({ category: "APP", level: "WARNING", message: "Paramètres de rareté et de renouvellement du booster modifiés", details: { ...(weights ? { weights } : {}), ...(cooldownMinutes !== undefined ? { cooldownMinutes } : {}) } });
  return NextResponse.json({ ...(weights ? { weights } : {}), ...(cooldownMinutes !== undefined ? { cooldownMinutes } : {}) });
}
