import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const VALID = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as any)?.role !== "ADMIN") throw new Error("Unauthorized");
}

// Seul un admin peut changer la rareté d'un exemplaire de carte DÉJÀ tiré
// (la rareté est normalement figée définitivement après le tirage booster).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const { id } = await params;
  const body = await req.json();
  if (!VALID.includes(body.rarity)) {
    return NextResponse.json({ error: "Rareté invalide" }, { status: 400 });
  }

  const card = await prisma.card.update({ where: { id }, data: { rarity: body.rarity } });
  return NextResponse.json({ id: card.id, rarity: card.rarity });
}
