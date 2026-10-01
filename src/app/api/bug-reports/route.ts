import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { newReport, publicReportSelect } from "@/lib/bugReports";
export async function GET() {
  const userId = (await auth())?.user?.id;
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const reports = await prisma.bugReport.findMany({ where: { userId }, select: publicReportSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 });
  return NextResponse.json({ reports });
}
export async function POST(req: NextRequest) {
  const userId = (await auth())?.user?.id;
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const parsed = newReport.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Titre de 3 à 120 caractères, description de 10 à 5 000 caractères et chemin de page valide requis." }, { status: 400 });
  try {
    const report = await prisma.$transaction(async (db) => {
      await db.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(93845072, hashtext(${userId}))`;
      const user = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (user?.status !== "ACTIVE") throw new Error("INACTIVE");
      const existing = await db.bugReport.findUnique({ where: { requestId: parsed.data.requestId } });
      if (existing) {
        if (existing.userId !== userId) throw new Error("CONFLICT");
        return db.bugReport.findUniqueOrThrow({ where: { id: existing.id }, select: publicReportSelect });
      }

      return db.bugReport.create({ data: { ...parsed.data, pagePath: parsed.data.pagePath || null, userId }, select: publicReportSelect });
    });
    return NextResponse.json(report, { status: 201 });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    return NextResponse.json({ error: code === "INACTIVE" ? "Compte actif requis." : "Envoi impossible. Ton message reste dans le formulaire." }, { status: code === "INACTIVE" ? 403 : code === "CONFLICT" ? 409 : 500 });
  }
}
