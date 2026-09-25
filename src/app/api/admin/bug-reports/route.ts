import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { reportStatus, reportUpdate } from "@/lib/bugReports";
async function admin() { return ((await auth())?.user as { role?: string } | undefined)?.role === "ADMIN"; }
export async function GET(req: NextRequest) {
  if (!await admin()) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const status = reportStatus.safeParse(req.nextUrl.searchParams.get("status"));
  const query = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 150);
  const rawPage = Number(req.nextUrl.searchParams.get("page") ?? 0);
  const page = Number.isInteger(rawPage) && rawPage >= 0 ? Math.min(rawPage, 10000) : 0;
  const where = { ...(status.success ? { status: status.data } : {}), ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" as const } }, { description: { contains: query, mode: "insensitive" as const } }, { user: { username: { contains: query, mode: "insensitive" as const } } }] } : {}) };
  const [reports, total, counts] = await Promise.all([
    prisma.bugReport.findMany({ where, include: { user: { select: { username: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 25, skip: page * 25 }),
    prisma.bugReport.count({ where }),
    prisma.bugReport.groupBy({ by: ["status"], _count: { id: true } }),
  ]);
  return NextResponse.json({ reports, total, counts, page });
}
export async function PATCH(req: NextRequest) {
  if (!await admin()) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const parsed = reportUpdate.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mise à jour invalide (5 000 caractères maximum par note ou réponse)." }, { status: 400 });
  const { id, updatedAt, ...data } = parsed.data;
  const result = await prisma.bugReport.updateMany({ where: { id, updatedAt: new Date(updatedAt) }, data });
  if (!result.count) return NextResponse.json({ error: "Ce signalement a changé. Actualise la liste avant de réessayer." }, { status: 409 });
  return NextResponse.json({ saved: true });
}
