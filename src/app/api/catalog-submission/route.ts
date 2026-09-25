import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSteamGameData, upsertStudiosForDevelopers } from "@/lib/steam";
import { persistRemoteImage } from "@/lib/storedImages";
import { cardDefense } from "@/lib/cardDefense";
import { recalculateCatalogRarity } from "@/lib/catalogRarity";
import { writeAppLog } from "@/lib/appLog";
import { activeSubmissionSettingKey, readCatalogSubmission, getSubmissionGameIds, type CatalogSubmission } from "@/lib/catalogSubmission";

async function currentUserId() {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const submission = id ? await readCatalogSubmission(id) : null;
  if (!submission || submission.userId !== userId) return NextResponse.json({ error: "Soumission introuvable." }, { status: 404 });
  const gameIds = submission.phase === "STUDIOS" ? [] : await getSubmissionGameIds(submission);
  return NextResponse.json({ ...submission, gameIds, studiosTotal: submission.developers.length });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const appid = typeof body.appid === "string" ? body.appid.trim() : String(body.appid ?? "");
  if (!/^\d{1,12}$/.test(appid)) return NextResponse.json({ error: "Sélection Steam invalide." }, { status: 400 });

  const already = await prisma.steamGame.findUnique({ where: { id: appid }, select: { id: true, name: true, contentType: true } });
  if (already) return NextResponse.json({ alreadyExists: true, game: already, message: `« ${already.name} » existe déjà dans le catalogue.` }, { status: 409 });

  const runId = `player-catalog-${crypto.randomUUID()}`;
  const activeKey = activeSubmissionSettingKey(userId);
  const active = await prisma.appSetting.findUnique({ where: { key: activeKey }, select: { value: true } });
  if (active) {
    const activeState = await readCatalogSubmission(active.value);
    if (activeState && activeState.phase === "DONE") await prisma.appSetting.deleteMany({ where: { key: activeKey } });
    else return NextResponse.json({ activeId: active.value, error: "Tu as déjà une contribution en cours. Reprends-la avant d’en lancer une autre." }, { status: 409 });
  }
  try {
    await prisma.appSetting.create({ data: { key: activeKey, value: runId } });
  } catch {
    const latest = await prisma.appSetting.findUnique({ where: { key: activeKey }, select: { value: true } });
    return NextResponse.json({ activeId: latest?.value, error: "Une autre contribution vient d’être lancée pour ton compte." }, { status: 409 });
  }
  try {
    await writeAppLog({ runId, category: "IMPORT", message: `Soumission joueur démarrée pour AppID ${appid}`, details: { appid, userId } });
    const data = await getSteamGameData(Number(appid));
    if (data.contentType !== "GAME") {
      await prisma.appSetting.deleteMany({ where: { key: activeKey, value: runId } });
      return NextResponse.json({ error: "Seuls les jeux complets peuvent être proposés ici, pas les DLC." }, { status: 422 });
    }
    if (data.ownerEstimate <= 0) {
      await prisma.appSetting.deleteMany({ where: { key: activeKey, value: runId } });
      return NextResponse.json({ error: "Jeu non importé : les données Steam ne permettent pas de calculer une DEF positive." }, { status: 422 });
    }
    const duplicate = await prisma.steamGame.findUnique({ where: { id: appid }, select: { id: true, name: true, contentType: true } });
    if (duplicate) {
      await prisma.appSetting.deleteMany({ where: { key: activeKey, value: runId } });
      return NextResponse.json({ alreadyExists: true, game: duplicate, message: `« ${duplicate.name} » existe déjà dans le catalogue.` }, { status: 409 });
    }
    const headerImage = await persistRemoteImage("game", appid, data.headerImage);
    const game = await prisma.steamGame.create({ data: {
      id: appid, name: data.name, description: data.description, headerImage,
      reviewScore: data.reviewScore, peakCcu: data.peakCcu, ownerEstimate: data.ownerEstimate,
      rarity: "COMMON", atk: data.reviewScore, def: cardDefense(data.ownerEstimate), tags: data.tags,
      developers: data.developers, priceCents: data.priceCents, isFree: data.isFree,
      contentType: "GAME", parentGameId: null, dlcAppIds: data.dlcAppIds.map(String),
    } });
    const developers = Array.from(new Set(data.developers.map((name) => name.trim()).filter(Boolean)));
    const submission: CatalogSubmission = {
      id: runId, userId, rootGameId: appid, rootGameName: game.name,
      developers,
      phase: developers.length ? "STUDIOS" : "DLC", studioIndex: 0,
      gameIds: [], gameIndex: 0, dlcIds: [], dlcOffset: 0, scannedGames: 0,
      importedDlcs: 0, rejectedDlcs: 0, errors: 0, lastSteamRequestAt: 0,
      updatedAt: new Date().toISOString(),
    };
    await prisma.appSetting.create({ data: { key: `CATALOG_SUBMISSION:${runId}`, value: JSON.stringify(submission) } });
    try {
      await upsertStudiosForDevelopers(data.developers);
      await recalculateCatalogRarity();
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Recalcul du catalogue impossible";
      submission.errors += 1;
      submission.error = `Le jeu est ajouté; une réparation sera retentée pendant la synchronisation : ${reason}`;
      await prisma.appSetting.update({ where: { key: `CATALOG_SUBMISSION:${runId}` }, data: { value: JSON.stringify(submission) } });
      await writeAppLog({ runId, category: "REPAIR", level: "WARNING", message: submission.error, details: { appid, userId } });
    }
    await writeAppLog({ runId, category: "IMPORT", level: "SUCCESS", message: `${game.name} ajouté au catalogue à la demande d’un joueur; aucune carte distribuée`, details: { appid, developers: submission.developers, userId } });
    return NextResponse.json({ ...submission, studiosTotal: submission.developers.length }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import du jeu impossible";
    const savedState = await readCatalogSubmission(runId);
    const conflict = await prisma.steamGame.findUnique({ where: { id: appid }, select: { id: true, name: true, contentType: true } }).catch(() => null);
    if (savedState) return NextResponse.json(savedState, { status: 201 });
    await prisma.appSetting.deleteMany({ where: { key: activeKey, value: runId } });
    if (conflict) return NextResponse.json({ alreadyExists: true, game: conflict, message: `« ${conflict.name} » existe déjà dans le catalogue.` }, { status: 409 });
    await writeAppLog({ runId, category: "IMPORT", level: "ERROR", message: `Soumission joueur ${appid} échouée : ${message}`, details: { appid, userId } });
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
