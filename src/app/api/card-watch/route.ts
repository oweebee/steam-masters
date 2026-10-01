import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function selfId() {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

// GET: return list of watched item IDs for current user
export async function GET() {
  const userId = await selfId();
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const watches = await prisma.cardWatch.findMany({
    where: { userId },
    select: { id: true, gameId: true, studioId: true, createdAt: true },
  });
  return NextResponse.json(watches);
}

// POST: toggle watch for a game or studio
export async function POST(req: Request) {
  const userId = await selfId();
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const gameId = typeof body?.gameId === "string" ? body.gameId : null;
  const studioId = typeof body?.studioId === "string" ? body.studioId : null;
  if (!gameId && !studioId) return NextResponse.json({ error: "gameId ou studioId requis" }, { status: 400 });

  const where = gameId ? { userId_gameId: { userId, gameId } } : { userId_studioId: { userId, studioId: studioId! } };
  const existing = await prisma.cardWatch.findUnique({ where });
  if (existing) {
    await prisma.cardWatch.delete({ where });
    return NextResponse.json({ watching: false });
  } else {
    const watch = await prisma.cardWatch.create({ data: { userId, ...(gameId ? { gameId } : { studioId: studioId! }) } });
    return NextResponse.json({ watching: true, watch });
  }
}
