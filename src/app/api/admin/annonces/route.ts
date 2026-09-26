import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || user.role !== "ADMIN") throw new Error("Unauthorized");
  return user.id;
}

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const logs = await prisma.appLog.findMany({
    where: { category: "ANNONCE" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(logs);
}

export async function POST(req: Request) {
  let adminId: string;
  try { adminId = await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!title || title.length > 200) return NextResponse.json({ error: "Titre requis (200 car. max)" }, { status: 400 });
  if (!content || content.length > 2000) return NextResponse.json({ error: "Contenu requis (2000 car. max)" }, { status: 400 });

  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", id: { not: adminId } },
    select: { id: true },
  });

  const fullMessage = "📢 " + title + "\n\n" + content;

  await prisma.message.createMany({
    data: users.map((u) => ({
      fromUserId: adminId,
      toUserId: u.id,
      content: fullMessage,
    })),
  });

  await prisma.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      type: "SYSTEM" as const,
      title: "📢 " + title,
      body: content.length > 80 ? content.slice(0, 80) + "..." : content,
      link: "/messages",
    })),
  });

  await prisma.appLog.create({
    data: {
      category: "ANNONCE",
      level: "INFO",
      message: title,
      details: { content, recipientCount: users.length },
    },
  });

  return NextResponse.json({ ok: true, recipientCount: users.length }, { status: 201 });
}
