import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isStoredImageUrl, persistRemoteImage, storedImageKey, storedImageUrl } from "@/lib/storedImages";

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as { role?: string })?.role !== "ADMIN") throw new Error("Unauthorized");
}

// Édition manuelle des seuls champs sans source Steam/SteamSpy : about + avatarUrl.
// Tout le reste (gameCount, atk, def, rarity, games...) reste calculé par
// upsertStudiosForDevelopers() et n'est pas éditable ici.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const { id } = await params;
  const body = await req.json();
  const about = typeof body.about === "string" ? body.about.slice(0, 2000) : null;
  const requestedAvatarUrl = typeof body.avatarUrl === "string" && body.avatarUrl.trim() ? body.avatarUrl.trim() : null;

  let avatarUrl: string | null = null;
  try {
    if (requestedAvatarUrl) {
      avatarUrl = isStoredImageUrl(requestedAvatarUrl)
        ? storedImageUrl("studio", id)
        : await persistRemoteImage("studio", id, requestedAvatarUrl);
    } else {
      await prisma.storedImage.deleteMany({ where: { key: storedImageKey("studio", id) } });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Logo du studio impossible à enregistrer";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const studio = await prisma.studio.update({
    where: { id },
    data: { about, avatarUrl },
  });

  return NextResponse.json({ id: studio.id, about: studio.about, avatarUrl: studio.avatarUrl });
}
