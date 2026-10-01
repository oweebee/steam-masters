import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { z } from "zod";

const newMessage = z.object({ body: z.string().trim().min(1).max(3000) });

async function loadReportForUser(id: string, userId: string, isAdmin: boolean) {
  const report = await prisma.bugReport.findUnique({ where: { id } });
  if (!report) return null;
  if (!isAdmin && report.userId !== userId) return undefined;
  return report;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  const { id } = await params;
  const report = await loadReportForUser(id, userId, isAdmin);
  if (report === null) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (report === undefined) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const messages = await prisma.bugReportMessage.findMany({
    where: { bugReportId: id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { username: true } } },
  });
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  const { id } = await params;
  const parsed = newMessage.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Message de 1 à 3000 caractères requis." }, { status: 400 });

  const report = await loadReportForUser(id, userId, isAdmin);
  if (report === null) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (report === undefined) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  const reopens = !isAdmin && (report.status === "RESOLVED" || report.status === "DISMISSED");

  const [message] = await prisma.$transaction([
    prisma.bugReportMessage.create({
      data: { bugReportId: id, authorId: userId, fromAdmin: isAdmin, body: parsed.data.body },
      include: { author: { select: { username: true } } },
    }),
    ...(reopens
      ? [prisma.bugReport.update({ where: { id }, data: { status: "IN_PROGRESS", aTraiter: true, enAttente: false } })]
      : []),
  ]);

  const label = `#${report.ticketNumber} ${report.title}`;
  if (isAdmin) {
    if (report.userId) await createNotification(report.userId, "BUG", "Réponse à ton signalement", `Nouvelle réponse sur ${label}.`, "/bug-report");
  } else {
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    for (const admin of admins) await createNotification(admin.id, "BUG", reopens ? "Signalement rouvert" : "Nouveau message joueur", `${label}`, "/admin/bug-reports");
  }
  return NextResponse.json({ message, reopened: reopens }, { status: 201 });
}
