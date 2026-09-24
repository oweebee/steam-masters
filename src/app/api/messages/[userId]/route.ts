import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, context: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  const selfId = (session?.user as { id?: string } | undefined)?.id;
  if (!selfId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { userId } = await context.params;
  if (userId === selfId) return NextResponse.json({ error: "Conversation invalide" }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } });
  if (!user) return NextResponse.json({ error: "Joueur introuvable" }, { status: 404 });
  const before = new URL(req.url).searchParams.get("before");
  if (before && !await prisma.message.findFirst({ where: { id: before, OR: [
    { fromUserId: selfId, toUserId: userId }, { fromUserId: userId, toUserId: selfId },
  ] }, select: { id: true } })) return NextResponse.json({ error: "Page invalide" }, { status: 400 });
  const messages = await prisma.message.findMany({
    where: { OR: [{ fromUserId: selfId, toUserId: userId }, { fromUserId: userId, toUserId: selfId }] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    select: { id: true, fromUserId: true, toUserId: true, content: true, createdAt: true, read: true },
  });
  const nextCursor = messages.length === 50 ? messages[messages.length - 1].id : null;
  await prisma.message.updateMany({ where: { fromUserId: userId, toUserId: selfId, read: false }, data: { read: true } });
  return NextResponse.json({ user, messages: messages.reverse(), nextCursor });
}
