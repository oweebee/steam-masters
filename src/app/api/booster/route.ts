import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const BOOSTER_INTERVAL_MS = 60 * 60 * 1000; // 1 heure

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: (session.user as any).id } });
  if (!user) return NextResponse.json({ error: "User introuvable" }, { status: 404 });

  const now = Date.now();
  const last = user.lastBoosterAt?.getTime() ?? 0;
  const remaining = Math.max(0, BOOSTER_INTERVAL_MS - (now - last));

  return NextResponse.json({ ready: remaining === 0, remainingMs: remaining });
}

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User introuvable" }, { status: 404 });

  const now = Date.now();
  const last = user.lastBoosterAt?.getTime() ?? 0;
  const remaining = Math.max(0, BOOSTER_INTERVAL_MS - (now - last));
  if (remaining > 0) {
    return NextResponse.json({ error: "Booster pas encore disponible", remainingMs: remaining }, { status: 429 });
  }

  const poolSize = await prisma.steamGame.count();
  if (poolSize === 0) {
    return NextResponse.json({ error: "Aucun jeu Steam en base — l'admin doit en importer via /admin/games" }, { status: 400 });
  }

  const skip = Math.floor(Math.random() * poolSize);
  const [game] = await prisma.steamGame.findMany({ take: 1, skip });

  const [card] = await prisma.$transaction([
    prisma.card.create({ data: { userId, gameId: game.id } }),
    prisma.user.update({ where: { id: userId }, data: { lastBoosterAt: new Date() } }),
  ]);

  return NextResponse.json({ card, game });
}
