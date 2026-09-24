import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSteamGameData, upsertStudiosForDevelopers } from "@/lib/steam";
import { recalculateCatalogRarity } from "@/lib/catalogRarity";
import { persistRemoteImage } from "@/lib/storedImages";
import { writeAppLog } from "@/lib/appLog";
import { cardDefense } from "@/lib/cardDefense";

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as { role?: string })?.role !== "ADMIN") throw new Error("Unauthorized");
}

export async function GET() {
  const games = await prisma.steamGame.findMany({ orderBy: { updatedAt: "desc" } });
  return NextResponse.json(games);
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const { appid, runId } = await req.json();
  if (!appid) return NextResponse.json({ error: "appid requis" }, { status: 400 });
  await writeAppLog({ runId, category: "IMPORT", message: `Import Steam démarré pour l’AppID ${appid}`, details: { appid: String(appid) } });

  let data;
  try {
    data = await getSteamGameData(Number(appid));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import Steam impossible";
    await writeAppLog({ runId, category: "IMPORT", level: "ERROR", message: `Import ${appid} refusé : ${message}`, details: { appid: String(appid) } });
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (data.ownerEstimate <= 0) {
    await writeAppLog({ runId, category: "IMPORT", level: "WARNING", message: `${data.name} refusé : DEF nul`, details: { appid: String(data.appid), def: data.ownerEstimate } });
    return NextResponse.json({ error: "Jeu refusé : DEF doit être supérieur à 0" }, { status: 422 });
  }

  let headerImage: string;
  try {
    headerImage = await persistRemoteImage("game", String(data.appid), data.headerImage);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image du jeu impossible à enregistrer";
    await writeAppLog({ runId, category: "IMAGE", level: "ERROR", message: `Image de ${data.name} non enregistrée : ${message}`, details: { appid: String(data.appid) } });
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const existing = await prisma.steamGame.findUnique({
    where: { id: String(data.appid) },
    select: { rarity: true },
  });
  // Rareté catalogue = classement PAR PERCENTILE du reviewScore sur tout le
  // catalogue (voir catalogRarity.ts), pas un seuil fixe. On pose une valeur
  // provisoire ici (conservée si déjà connue) puis on recalcule tout le
  // catalogue juste après, ce qui fixe la valeur définitive de CE jeu comme
  // de tous les autres impactés par son insertion dans le classement.
  const rarity = existing?.rarity ?? "COMMON";

  const game = await prisma.steamGame.upsert({
    where: { id: String(data.appid) },
    update: {
      name: data.name,
      description: data.description,
      headerImage,
      reviewScore: data.reviewScore,
      peakCcu: data.peakCcu,
      ownerEstimate: data.ownerEstimate,
      rarity,
      atk: data.reviewScore,
      def: cardDefense(data.ownerEstimate),
      tags: data.tags,
      developers: data.developers,
      priceCents: data.priceCents,
      isFree: data.isFree,
    },
    create: {
      id: String(data.appid),
      name: data.name,
      description: data.description,
      headerImage,
      reviewScore: data.reviewScore,
      peakCcu: data.peakCcu,
      ownerEstimate: data.ownerEstimate,
      rarity,
      atk: data.reviewScore,
      def: cardDefense(data.ownerEstimate),
      tags: data.tags,
      developers: data.developers,
      priceCents: data.priceCents,
      isFree: data.isFree,
    },
  });

  await upsertStudiosForDevelopers(data.developers);
  await recalculateCatalogRarity();

  const finalGame = await prisma.steamGame.findUnique({ where: { id: game.id } });
  await writeAppLog({
    runId,
    category: "IMPORT",
    level: "SUCCESS",
    message: `${data.name} importé avec ${data.developers.length} studio(s) lié(s)`,
    details: { appid: String(data.appid), developers: data.developers, def: data.ownerEstimate, reviewScore: data.reviewScore },
  });
  return NextResponse.json(finalGame ?? game);
}
