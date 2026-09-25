import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCoherenceReport, dismissCoherenceIssues, repairCoherenceLocally } from "@/lib/catalogCoherence";
import { writeAppLog } from "@/lib/appLog";
async function requireAdmin() { return ((await auth())?.user as { role?: string } | undefined)?.role === "ADMIN"; }
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  try { return NextResponse.json(await getCoherenceReport()); }
  catch { return NextResponse.json({ error: "Lecture du catalogue local impossible. Réessaye le scan." }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || !["scan", "ignore", "create-studios", "repair-existing-links"].includes(body.action)) return NextResponse.json({ error: "Action invalide" }, { status: 400 });
  const keys: string[] = Array.isArray(body.keys) ? [...new Set<string>(body.keys.filter((key: unknown): key is string => typeof key === "string" && key.length <= 2000))] : [];
  if (["ignore", "create-studios"].includes(body.action) && (!keys.length || keys.length > 200)) return NextResponse.json({ error: "Sélectionne entre 1 et 200 liens par opération." }, { status: 400 });
  try {
    let result: { removed?: number; links?: number; created?: number } = {};
    if (body.action === "ignore") result = { removed: await dismissCoherenceIssues(keys) };
    if (["create-studios", "repair-existing-links"].includes(body.action)) {
      result = await repairCoherenceLocally(body.action === "create-studios" ? keys : undefined, body.action === "create-studios");
      if (result.created || result.links) {
        const { recalculateCatalogRarity } = await import("@/lib/catalogRarity");
        await recalculateCatalogRarity();
      }
    }
    const report = await getCoherenceReport();
    await writeAppLog({ category: "REPAIR", level: "SUCCESS", message: `Cohérence locale · ${body.action} : ${report.issues.length} anomalie(s) restante(s), ${result.links ?? 0} lien(s) réparé(s), ${result.created ?? 0} studio(s) créé(s), ${result.removed ?? 0} lien(s) retiré(s). Aucune requête Steam.`, details: { ...result, steamRequests: 0 } });
    return NextResponse.json({ ...report, ...result });
  } catch (error) {
    await writeAppLog({ category: "REPAIR", level: "ERROR", message: `Échec cohérence locale : ${error instanceof Error ? error.message : "Erreur locale"}` });
    return NextResponse.json({ error: "Opération locale incomplète. Consulte le Journal et relance le scan." }, { status: 500 });
  }
}
