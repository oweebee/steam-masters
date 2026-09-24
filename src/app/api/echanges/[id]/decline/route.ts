import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Refus (destinataire) ou annulation (initiateur) — les deux mènent au même
// état PENDING -> DECLINED, aucun transfert n'a jamais eu lieu.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;
  const { id } = await params;

  const trade = await prisma.trade.findUnique({ where: { id } });
  if (!trade) return NextResponse.json({ error: "Échange introuvable" }, { status: 404 });
  if (trade.fromUserId !== userId && trade.toUserId !== userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (trade.status !== "PENDING") {
    return NextResponse.json({ error: "Cet échange n'est plus en attente" }, { status: 400 });
  }

  const updated = await prisma.trade.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "DECLINED", resolvedAt: new Date() },
  });
  if (updated.count !== 1) return NextResponse.json({ error: "Cette proposition n'est plus en attente" }, { status: 409 });
  return NextResponse.json({ id, status: "DECLINED" });
}
