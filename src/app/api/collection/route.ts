import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cards = await prisma.card.findMany({
    where: { userId: (session.user as any).id },
    include: { game: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(cards);
}
