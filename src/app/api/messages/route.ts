import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

async function selfId() {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET() {
  const userId = await selfId();
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const [pairs, unread, users] = await Promise.all([
    prisma.message.groupBy({ by: ["fromUserId", "toUserId"], where: { OR: [{ fromUserId: userId }, { toUserId: userId }] }, _max: { createdAt: true } }),
    prisma.message.groupBy({ by: ["fromUserId"], where: { toUserId: userId, read: false }, _count: { id: true } }),
    prisma.user.findMany({ where: { status: "ACTIVE", id: { not: userId } }, select: { id: true, username: true }, orderBy: { username: "asc" } }),
  ]);
  const partnerIds = [...new Set(pairs.map((pair) => pair.fromUserId === userId ? pair.toUserId : pair.fromUserId))];
  const partners = await prisma.user.findMany({ where: { id: { in: partnerIds } }, select: { id: true, username: true, role: true } });
  const names = new Map(partners.map((partner) => [partner.id, partner.role === "ADMIN" ? "Admin" : partner.username]));
  const unreadByPartner = new Map(unread.map((entry) => [entry.fromUserId, entry._count.id]));
  const conversations = await Promise.all(partnerIds.map(async (partnerId) => {
    const last = await prisma.message.findFirst({ where: { OR: [
      { fromUserId: userId, toUserId: partnerId }, { fromUserId: partnerId, toUserId: userId },
    ] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { content: true, createdAt: true, fromUserId: true } });
    return { userId: partnerId, username: names.get(partnerId) ?? "Joueur inconnu", unread: unreadByPartner.get(partnerId) ?? 0, last };
  }));
  users.sort((a, b) => a.username.localeCompare(b.username, "fr", { sensitivity: "base" }) || a.id.localeCompare(b.id));
  conversations.sort((a, b) => a.username.localeCompare(b.username, "fr", { sensitivity: "base" }) || a.userId.localeCompare(b.userId));
  return NextResponse.json({ selfId: userId, users, conversations });
}

export async function POST(req: Request) {
  const userId = await selfId();
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const recipientId = typeof body?.recipientId === "string" ? body.recipientId : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!recipientId || recipientId === userId) return NextResponse.json({ error: "Destinataire invalide" }, { status: 400 });
  if (!content || content.length > 2000) return NextResponse.json({ error: "Message requis (2 000 caractères maximum)" }, { status: 400 });
  try {
    const message = await prisma.$transaction(async (tx) => {
      const recipient = await tx.user.findFirst({ where: { id: recipientId, status: "ACTIVE" }, select: { id: true } });
      if (!recipient) throw new Error("Joueur indisponible");
      const recent = await tx.message.count({ where: { fromUserId: userId, createdAt: { gte: new Date(Date.now() - 60_000) } } });
      if (recent >= 12) throw new Error("Trop de messages envoyés : réessaie dans une minute");
      return tx.message.create({ data: { fromUserId: userId, toUserId: recipientId, content } });
    }, { isolationLevel: "Serializable" });
    // Notify recipient (best-effort)
    const sender = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    await createNotification(
      recipientId,
      "MESSAGE",
      `Message de ${sender?.username ?? "un joueur"}`,
      content.length > 80 ? content.slice(0, 80) + "…" : content,
      `/messages`
    );
    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Envoi impossible" }, { status: 400 });
  }
}
