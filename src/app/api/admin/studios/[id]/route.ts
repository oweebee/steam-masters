import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as any)?.role !== "ADMIN") throw new Error("Unauthorized");
}

// Édition manuelle des seuls champs sans source Steam/SteamSpy : about + avatarUrl.
// Tout le reste (gameCount, atk, def, rarity, games...) reste calculé par
// upsertStudiosForDevelopers() et n'est pas éditable ici.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const { id } = await params;
  const body = await req.json();
  const about = typeof body.about === "string" ? body.about.slice(0, 2000) : null;
  const avatarUrl = typeof body.avatarUrl === "string" && body.avatarUrl.trim() ? body.avatarUrl.trim() : null;

  const studio = await prisma.studio.update({
    where: { id },
    data: { about, avatarUrl },
  });

  return NextResponse.json({ id: studio.id, about: studio.about, avatarUrl: studio.avatarUrl });
}
