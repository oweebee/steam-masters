import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ error: "Nom manquant" }, { status: 400 });

  const studio = await prisma.studio.findUnique({
    where: { name },
    select: {
      id: true,
      name: true,
      gameCount: true,
      atk: true,
      def: true,
      rarity: true,
      about: true,
      avatarUrl: true,
      games: true,
    },
  });
  if (!studio) return NextResponse.json({ error: "Studio introuvable" }, { status: 404 });
  return NextResponse.json(studio);
}
