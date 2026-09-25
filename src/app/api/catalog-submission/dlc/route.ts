import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSteamDlcAppIds, getSteamGameData, sleep, STEAM_REQUEST_DELAY_MS } from "@/lib/steam";
import { persistRemoteImage } from "@/lib/storedImages";
import { cardDefense } from "@/lib/cardDefense";
import { recalculateCatalogRarity } from "@/lib/catalogRarity";
import { archiveCatalogIssue } from "@/lib/catalogIssueArchive";
import { writeAppLog } from "@/lib/appLog";
import { activeSubmissionSettingKey, getSubmissionGameIds, readCatalogSubmission, writeCatalogSubmission } from "@/lib/catalogSubmission";

const BATCH_SIZE = 5;

async function waitForSteam(submission: { lastSteamRequestAt: number }) {
  const delay = Math.max(0, STEAM_REQUEST_DELAY_MS - (Date.now() - submission.lastSteamRequestAt));
  if (delay) await sleep(delay);
  submission.lastSteamRequestAt = Date.now();
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const submission = id ? await readCatalogSubmission(id) : null;
  if (!submission || submission.userId !== userId) return NextResponse.json({ error: "Soumission introuvable." }, { status: 404 });
  if (submission.phase === "DONE") return NextResponse.json(submission);
  if (submission.phase !== "DLC") return NextResponse.json({ error: "La synchronisation des studios n’est pas terminée." }, { status: 409 });

  try {
    if (!submission.gameIds.length) submission.gameIds = await getSubmissionGameIds(submission);
    const parentId = submission.gameIds[submission.gameIndex];
    if (!parentId) {
      submission.phase = "DONE";
      submission.dlcIds = [];
      await recalculateCatalogRarity();
      await writeCatalogSubmission(submission);
      await prisma.appSetting.deleteMany({ where: { key: activeSubmissionSettingKey(userId), value: submission.id } });
      await writeAppLog({ runId: submission.id, category: "SYNC", level: submission.errors ? "WARNING" : "SUCCESS", message: `${submission.rootGameName} : soumission catalogue terminée, ${submission.gameIds.length} jeu(x) étudié(s), ${submission.importedDlcs} DLC créés`, details: { errors: submission.errors, rejectedDlcs: submission.rejectedDlcs } });
      return NextResponse.json(submission);
    }

    const parent = await prisma.steamGame.findUnique({ where: { id: parentId }, select: { id: true, name: true, developers: true, dlcAppIds: true, contentType: true } });
    if (!parent || parent.contentType !== "GAME") {
      submission.errors += 1;
      submission.gameIndex += 1;
      submission.dlcIds = [];
      submission.dlcOffset = 0;
      await writeCatalogSubmission(submission);
      return NextResponse.json({ ...submission, currentGame: parentId });
    }

    if (!submission.dlcIds.length) {
      await waitForSteam(submission);
      const dlcIds = (await getSteamDlcAppIds(Number(parent.id))).map(String);
      submission.dlcIds = dlcIds;
      await prisma.steamGame.update({ where: { id: parent.id }, data: { dlcAppIds: dlcIds } });
    }
    const batch = submission.dlcIds.slice(submission.dlcOffset, submission.dlcOffset + BATCH_SIZE);
    for (const dlcId of batch) {
      const existing = await prisma.steamGame.findUnique({ where: { id: dlcId }, select: { contentType: true, developers: true } });
      if (existing?.contentType === "GAME") { submission.rejectedDlcs += 1; continue; }
      if (existing?.contentType === "DLC") {
        if (!existing.developers.length && parent.developers.length) await prisma.steamGame.update({ where: { id: dlcId }, data: { developers: parent.developers } });
        continue;
      }

      try {
        await waitForSteam(submission);
        const data = await getSteamGameData(Number(dlcId));
        if (data.contentType !== "DLC" || data.parentAppId !== Number(parent.id)) throw new Error("Steam ne confirme pas ce DLC ou son jeu parent.");
        if (data.ownerEstimate <= 0) {
          submission.rejectedDlcs += 1;
          await archiveCatalogIssue({ scope: "DLC", itemId: dlcId, parentId: parent.id, name: data.name, reason: "DEF invalide : estimation de possesseurs nulle ou négative" });
          continue;
        }
        const headerImage = await persistRemoteImage("game", dlcId, data.headerImage);
        await prisma.steamGame.create({ data: {
          id: dlcId, name: data.name, description: data.description, headerImage,
          reviewScore: data.reviewScore, peakCcu: data.peakCcu, ownerEstimate: data.ownerEstimate,
          rarity: "COMMON", atk: data.reviewScore, def: cardDefense(data.ownerEstimate), tags: data.tags,
          developers: parent.developers, priceCents: data.priceCents, isFree: data.isFree,
          contentType: "DLC", parentGameId: parent.id, dlcAppIds: [],
        } });
        submission.importedDlcs += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Import du DLC impossible";
        const retryable = /HTTP (?:408|425|429|5\d\d)|timeout|timed out|fetch failed|network|indisponible/i.test(reason);
        if (retryable) {
          submission.error = `${parent.name} · DLC ${dlcId} : ${reason}`;
          submission.errors += 1;
          await writeCatalogSubmission(submission);
          await writeAppLog({ runId: submission.id, category: "SYNC", level: "ERROR", message: `Import DLC mis en pause pour reprise : ${submission.error}`, details: { appid: dlcId, parentId: parent.id, retryable: true } });
          return NextResponse.json({ ...submission, currentGame: parent.name }, { status: 503 });
        }
        submission.rejectedDlcs += 1;
        await archiveCatalogIssue({ scope: "DLC", itemId: dlcId, parentId: parent.id, name: `DLC ${dlcId}`, reason });
        await writeAppLog({ runId: submission.id, category: "SYNC", level: "WARNING", message: `${parent.name} : DLC ${dlcId} ignoré — ${reason}`, details: { appid: dlcId, parentId: parent.id } });
      }
    }

    submission.dlcOffset += batch.length;
    submission.error = undefined;
    if (submission.dlcOffset >= submission.dlcIds.length) {
      submission.gameIndex += 1;
      submission.scannedGames += 1;
      submission.dlcIds = [];
      submission.dlcOffset = 0;
    }
    await writeCatalogSubmission(submission);
    return NextResponse.json({ ...submission, currentGame: parent.name, gamesTotal: submission.gameIds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan DLC impossible";
    submission.error = message;
    submission.errors += 1;
    await writeCatalogSubmission(submission);
    await writeAppLog({ runId: submission.id, category: "SYNC", level: "ERROR", message: `Soumission DLC interrompue, reprise conservée — ${message}` });
    return NextResponse.json(submission, { status: 503 });
  }
}
