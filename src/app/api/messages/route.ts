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

  // Only private (non-announcement) messages for conversations
  const [pairs, unread, users, announcements] = await Promise.all([
    prisma.message.groupBy({
      by: ["fromUserId", "toUserId"],
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
        isAnnouncement: false,
      },
      _max: { createdAt: true },
    }),
    prisma.message.groupBy({
      by: ["fromUserId"],
      where: { toUserId: userId, read: false, isAnnouncement: false },
      _count: { id: true },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE", id: { not: userId } },
      select: { id: true, username: true },
      orderBy: { username: "asc" },
    }),
    // Fetch last 20 announcements for this user
    prisma.message.findMany({
      where: { toUserId: userId, isAnnouncement: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: { id: true, content: true, createdAt: true, read: true },
    }),
  ]);

  const partnerIds = [
    ...new Set(
      pairs.map((pair) => (pair.fromUserId === userId ? pair.toUserId : pair.fromUserId))
    ),
  ].filter((id) => id !== userId);

  const partners = await prisma.user.findMany({
    where: { id: { in: partnerIds } },
    select: { id: true, username: true, role: true },
  });

  const names = new Map(
    partners.map((p) => [p.id, p.role === "ADMIN" ? "Admin" : p.username])
  );
  const unreadByPartner = new Map(unread.map((e) => [e.fromUserId, e._count.id]));

  const conversations = await Promise.all(
    partnerIds.map(async (partnerId) => {
      const last = await prisma.message.findFirst({
        where: {
          OR: [
            { fromUserId: userId, toUserId: partnerId },
            { fromUserId: partnerId, toUserId: userId },
          ],
          isAnnouncement: false,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { content: true, createdAt: true, fromUserId: true },
      });
      return {
        userId: partnerId,
        username: names.get(partnerId) ?? "Joueur inconnu",
        unread: unreadByPartner.get(partnerId) ?? 0,
        last,
      };
    })
  );

  conversations.sort(
    (a, b) =>
      a.username.localeCompare(b.username, "fr", { sensitivity: "base" }) ||
      a.userId.localeCompare(b.userId)
  );

  // Mark announcements as read
  await prisma.message.updateMany({
    where: { toUserId: userId, isAnnouncement: true, read: false },
    data: { read: true },
  });

  // Count unread announcements (before we marked them read — we already have them)
  const unreadAnnouncements = announcements.filter((a) => !a.read).length;

  return NextResponse.json({ selfId: userId, users, conversations, announcements, unreadAnnouncements });
}

export async function POST(req: Request) {
  const userId = await selfId();
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const recipientId = typeof body?.recipientId === "string" ? body.recipientId : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!recipientId || recipientId === userId)
    return NextResponse.json({ error: "Destinataire invalide" }, { status: 400 });
  if (!content || content.length > 2000)
    return NextResponse.json({ error: "Message requis (2 000 caractères maximum)" }, { status: 400 });

  try {
    const message = await prisma.$transaction(async (tx) => {
      const recipient = await tx.user.findFirst({
        where: { id: recipientId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!recipient) throw new Error("Joueur indisponible");
      const recent = await tx.message.count({
        where: { fromUserId: userId, createdAt: { gte: new Date(Date.now() - 60_000) }, isAnnouncement: false },
      });
      if (recent >= 12) throw new Error("Trop de messages envoyés : réessaie dans une minute");
      return tx.message.create({ data: { fromUserId: userId, toUserId: recipientId, content, isAnnouncement: false } });
    }, { isolationLevel: "Serializable" });

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Envoi impossible" },
      { status: 400 }
    );
  }
}
