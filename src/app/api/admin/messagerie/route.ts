import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || user.role !== "ADMIN") throw new Error("Unauthorized");
  return user.id;
}

// GET: list private (non-announcement) message conversations for admin
export async function GET() {
  let adminId: string;
  try { adminId = await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  // All private messages TO admin (from any user)
  const [pairs, unread] = await Promise.all([
    prisma.message.groupBy({
      by: ["fromUserId"],
      where: { toUserId: adminId, isAnnouncement: false },
      _max: { createdAt: true },
    }),
    prisma.message.groupBy({
      by: ["fromUserId"],
      where: { toUserId: adminId, isAnnouncement: false, read: false },
      _count: { id: true },
    }),
  ]);

  const senderIds = pairs.map((p) => p.fromUserId);
  const senders = await prisma.user.findMany({
    where: { id: { in: senderIds } },
    select: { id: true, username: true },
  });

  const unreadMap = new Map(unread.map((e) => [e.fromUserId, e._count.id]));

  const conversations = await Promise.all(
    senders.map(async (sender) => {
      const last = await prisma.message.findFirst({
        where: {
          OR: [
            { fromUserId: sender.id, toUserId: adminId },
            { fromUserId: adminId, toUserId: sender.id },
          ],
          isAnnouncement: false,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { content: true, createdAt: true, fromUserId: true },
      });
      return {
        userId: sender.id,
        username: sender.username,
        unread: unreadMap.get(sender.id) ?? 0,
        last,
      };
    })
  );

  conversations.sort((a, b) => (b.last?.createdAt?.getTime() ?? 0) - (a.last?.createdAt?.getTime() ?? 0));

  return NextResponse.json({ adminId, conversations });
}

// POST: admin replies to a user
export async function POST(req: Request) {
  let adminId: string;
  try { adminId = await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const body = await req.json().catch(() => null);
  const recipientId = typeof body?.recipientId === "string" ? body.recipientId : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!recipientId) return NextResponse.json({ error: "Destinataire requis" }, { status: 400 });
  if (!content || content.length > 2000) return NextResponse.json({ error: "Message requis" }, { status: 400 });

  const msg = await prisma.message.create({
    data: { fromUserId: adminId, toUserId: recipientId, content, isAnnouncement: false },
  });

  return NextResponse.json(msg, { status: 201 });
}
