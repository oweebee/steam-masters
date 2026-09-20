import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Liste publique des joueurs (tout user connecté) : pas de système de demande
// d'ami — tous les joueurs voient tous les autres joueurs directement, comme
// s'ils étaient déjà amis. Remplace la page "Amis" (le modèle Friend du schema
// reste en base mais n'est plus utilisé par cette vue).
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const selfId = (session.user as any).id as string;

  const users = await prisma.user.findMany({
    where: { id: { not: selfId }, status: "ACTIVE" },
    select: {
      id: true,
      username: true,
      xp: true,
      createdAt: true,
      _count: { select: { cards: true } },
    },
    orderBy: { xp: "desc" },
  });

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      xp: u.xp,
      cardCount: u._count.cards,
      createdAt: u.createdAt,
    }))
  );
}
