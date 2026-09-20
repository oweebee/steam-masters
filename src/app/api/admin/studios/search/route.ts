import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as any)?.role !== "ADMIN") throw new Error("Unauthorized");
}

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const term = req.nextUrl.searchParams.get("q")?.trim();
  if (!term || term.length < 2) return NextResponse.json([]);

  // Uniquement les studios déjà en base (agrégés depuis les jeux déjà importés) —
  // Steam n'a pas d'API publique de recherche par nom de développeur/studio.
  const studios = await prisma.studio.findMany({
    where: { name: { contains: term, mode: "insensitive" } },
    take: 10,
    select: { id: true, name: true, gameCount: true },
    orderBy: { gameCount: "desc" },
  });

  return NextResponse.json(studios);
}
