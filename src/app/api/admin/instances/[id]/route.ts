import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rollAtkForRarity, type Rarity } from "@/lib/rarityRoll";

const VALID = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as any)?.role !== "ADMIN") throw new Error("Unauthorized");
}

// Seul un admin peut changer la rareté et/ou l'ATK d'un exemplaire de carte
// DÉJÀ tiré (normalement figés définitivement après le tirage booster).
// Si la rareté change sans ATK explicite fourni, l'ATK est re-roulé dans la
// nouvelle bande (voir rollAtkForRarity) pour rester cohérent avec elle.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const { id } = await params;
  const body = await req.json();

  const data: { rarity?: Rarity; atk?: number } = {};

  if (body.rarity !== undefined) {
    if (!VALID.includes(body.rarity)) {
      return NextResponse.json({ error: "Rareté invalide" }, { status: 400 });
    }
    data.rarity = body.rarity as Rarity;
    data.atk = rollAtkForRarity(body.rarity as Rarity);
  }

  if (body.atk !== undefined) {
    const atk = Number(body.atk);
    if (!Number.isInteger(atk) || atk < 0 || atk > 100) {
      return NextResponse.json({ error: "ATK invalide (0-100)" }, { status: 400 });
    }
    data.atk = atk; // valeur explicite prioritaire sur le re-roll auto
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Rien à modifier" }, { status: 400 });
  }

  const card = await prisma.card.update({ where: { id }, data });
  return NextResponse.json({ id: card.id, rarity: card.rarity, atk: card.atk });
}
