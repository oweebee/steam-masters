import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  try {
    await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id },
        include: { _count: { select: { bids: true } } },
      });
      if (!auction || auction.sellerId !== userId) throw new Error("Annonce introuvable");
      if (auction.status !== "ACTIVE") throw new Error("Cette annonce n’est plus active");
      if (auction._count.bids > 0) throw new Error("Une enchère reçue ne peut plus être annulée");
      await tx.auction.update({ where: { id }, data: { status: "CANCELLED" } });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Annulation impossible" }, { status: 400 });
  }
}
