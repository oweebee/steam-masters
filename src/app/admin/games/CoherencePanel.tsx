"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CoherenceIssue, Relation } from "@/lib/catalogCoherenceCore";
type Issue = CoherenceIssue & { status: "MISSING" | "FAILED"; failureReason?: string; failedAt?: string };
type Report = { issues: Issue[]; scannedAt: string; ignoredCount: number; counts: { games: number; studios: number; dlcs: number } };
const relations: Record<Relation, string> = { GAME_STUDIO: "Jeux → Studios", STUDIO_GAME: "Studios → Jeux", DLC_PARENT: "DLC → Jeux", DLC_STUDIO: "DLC → Studios", GAME_DLC: "Jeux → DLC" };
const methods = { STEAM: "Vérification Steam", LOCAL_LINK: "Lien réparable localement", LOCAL_STUDIO: "Studio créable localement", BLOCKED: "Vérification manuelle" };
const button = "rounded-lg border border-amber-900/80 bg-gradient-to-b from-stone-800 to-stone-950 px-3 py-2 text-sm text-amber-100 shadow-sm hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-40";
async function request(url: string, body?: object) {
  const response = await fetch(url, { method: body ? "POST" : "GET", cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(300_000) });
  const data = await response.json().catch(() => ({ error: "Réponse serveur interrompue. Relance le scan local." }));
  if (!response.ok) throw new Error(data.error ?? "Opération impossible.");
  return data;
}
export function CoherencePanel({ externalBusy }: { externalBusy: boolean }) {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [relation, setRelation] = useState<Relation | "ALL">("ALL");
  const [status, setStatus] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<Issue | null>(null);
  const [importProgress, setImportProgress] = useState<{ index: number; total: number; current: string } | null>(null);
  const [lockWait, setLockWait] = useState(0);
  const [scanElapsed, setScanElapsed] = useState(0);
  const stopped = useRef(false);
  const mounted = useRef(true);
  const locked = busy || importing || externalBusy;
  const refresh = useCallback(async () => {
    const next: Report = await request("/api/admin/coherence");
    if (mounted.current) { setReport(next); setSelected((current) => current.filter((key) => next.issues.some((issue) => issue.key === key))); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    setBusy(true);
    refresh().catch((e) => { if (mounted.current && e.name !== "AbortError" && !String(e.message).startsWith("NetworkError")) setError(e.message); }).finally(() => { if (mounted.current) setBusy(false); });
    return () => { mounted.current = false; stopped.current = true; };
  }, [refresh]);
  useEffect(() => {
    if (!busy || importing) { setScanElapsed(0); return; }
    const id = setInterval(() => setScanElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [busy, importing]);
  useEffect(() => {
    if (!detail) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setDetail(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [detail]);
  const filtered = useMemo(() => (report?.issues ?? []).filter((issue) =>
    (relation === "ALL" || issue.relation === relation) &&
    (status === "ALL" || status === "FAILED" && issue.status === "FAILED" || status === "LOCAL" && issue.method.startsWith("LOCAL") || status === "STEAM" && issue.method === "STEAM") &&
    `${issue.sourceName} ${issue.targetName} ${issue.appId ?? ""} ${issue.reason} ${issue.failureReason ?? ""}`.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr"))
  ), [report, relation, status, query]);
  const lastPage = Math.max(0, Math.ceil(filtered.length / 200) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = filtered.slice(currentPage * 200, currentPage * 200 + 200);
  const selectedIssues = (report?.issues ?? []).filter((issue) => selected.includes(issue.key));
  const steamSelected = selectedIssues.filter((issue) => issue.method === "STEAM");
  const studioSelected = selectedIssues.filter((issue) => issue.method === "LOCAL_STUDIO");
  async function local(action: string) {
    if (locked) return;
    if (action === "ignore" && !window.confirm(`Retirer définitivement ${selected.length} lien(s) ? Ils ne seront plus proposés ni cliquables. Aucune carte détenue par un joueur ne sera supprimée.`)) return;
    setBusy(true); setError("");
    try {
      const data = await request("/api/admin/coherence", { action, keys: action === "create-studios" ? studioSelected.map((i) => i.key) : selected });
      setReport(data); setSelected([]);
      setMessage(action === "scan" ? `Scan terminé : ${data.issues.length} anomalie(s).` : action === "ignore" ? `${data.removed} lien(s) retiré(s) définitivement.` : `${data.links ?? 0} lien(s) réparé(s), ${data.created ?? 0} studio(s) créé(s).`);
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur locale."); }
    finally { setBusy(false); }
  }
  async function ignoreAll() {
    const keys = filtered.map((i) => i.key);
    if (!keys.length || locked) return;
    if (!window.confirm(`Retirer définitivement ${keys.length} lien(s) ? Ils ne seront plus proposés ni cliquables. Aucune carte détenue par un joueur ne sera supprimée.`)) return;
    setBusy(true); setError("");
    try {
      const data = await request("/api/admin/coherence", { action: "ignore", keys });
      setReport(data); setSelected([]);
      setMessage(`${data.removed} lien(s) retiré(s) définitivement.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur locale."); }
    finally { setBusy(false); }
  }
  async function importSelection(issueList?: typeof steamSelected) {
    const list = issueList ?? steamSelected;
    if (locked || !list.length) return;
    setImporting(true); setError(""); stopped.current = false;
    setImportProgress({ index: 0, total: list.length, current: "" });
    let resolved = 0; let failed = 0;
    try {
      for (let index = 0; index < list.length && !stopped.current; index++) {
        const issue = list[index];
        setMessage(`${index + 1}/${list.length} · ${issue.sourceName} → ${issue.targetName}`);
        setImportProgress({ index: index + 1, total: list.length, current: `${issue.sourceName} → ${issue.targetName}` });
        const response = await fetch("/api/admin/coherence/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: issue.key }), signal: AbortSignal.timeout(300_000) });
        const result = await response.json();
        if (result.resolved) resolved++; else failed++;
        if (result.paused && result.retryAfter) {
          const wait = result.retryAfter as number;
          for (let s = wait; s > 0 && !stopped.current; s--) {
            if (mounted.current) { setLockWait(s); setMessage(`Rate-limit Steam — reprise dans ${s}s…`); }
            await new Promise((r) => setTimeout(r, 1000));
          }
          if (mounted.current) setLockWait(0);
          if (!stopped.current) { index--; continue; }
        } else if (response.status >= 500 || result.paused) { stopped.current = true; if (mounted.current) setError(result.error ?? "Serveur indisponible."); }
        if (mounted.current) await refresh();
        if (index + 1 < list.length && !stopped.current) {
          for (let tick = 0; tick < 42 && !stopped.current; tick++) await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    } catch (e) { if (mounted.current) setError(`Traitement interrompu : ${e instanceof Error ? e.message : "connexion perdue"}. Le résultat de l’élément en cours sera visible au prochain scan.`); }
    finally {
      if (mounted.current) {
        setImporting(false); setImportProgress(null); setMessage(`${resolved} lien(s) validé(s), ${failed} échec(s). ${stopped.current ? "Traitement arrêté." : "Traitement terminé."}`);
        await refresh().catch(() => setError("Impossible d’actualiser le résultat. Relance le scan local."));
      }
    }
  }
  function toggle(key: string, checked: boolean) {
    setSelected((current) => checked ? [...new Set([...current, key])].slice(0, 200) : current.filter((entry) => entry !== key));
  }
  return <section className="max-w-7xl space-y-4">
    <div className="rounded-2xl border border-amber-900/80 bg-gradient-to-br from-stone-900 to-stone-950 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-amber-100">Atelier de cohérence</h2><p className="mt-1 text-sm text-stone-400">Contrôle des relations déjà enregistrées dans la base. Aucun appel Steam pendant le scan.</p></div><a href="/admin/logs" className="text-sm text-amber-300 underline">Journal de l’application</a></div>
      <div className="mt-4 flex flex-wrap gap-2"><button className={button} disabled={locked} onClick={() => void local("scan")}>{busy ? "Traitement local…" : "Scanner la base locale"}</button><button className={`${button} !border-amber-600`} disabled={locked} onClick={() => void local("repair-existing-links")}>⚙ Réparer les liens des cartes existantes</button></div>
      {busy && !importing && <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-800/50 bg-amber-950/30 px-3 py-2"><div className="flex items-center gap-2"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" /></span><span className="text-xs text-amber-200">Analyse locale{report ? ` · ${report.counts.games} jeux / ${report.counts.studios} studios / ${report.counts.dlcs} DLC` : " de la base"} en cours…</span></div><span className="font-mono text-xs text-amber-500/70 tabular-nums">{scanElapsed}s</span></div>}{importing && importProgress && <div className="mt-3 space-y-2 rounded-lg border border-amber-900/60 bg-gradient-to-br from-stone-900 to-stone-950 px-3 py-3"><div className="flex items-center justify-between text-xs text-amber-200"><span className="font-medium">Import Steam · {importProgress.index}/{importProgress.total}</span><span className="tabular-nums font-mono">{importProgress.total > 0 ? Math.round(importProgress.index / importProgress.total * 100) : 0} %</span></div><div className="h-1 overflow-hidden rounded-full bg-stone-800"><div className="h-full rounded-full bg-gradient-to-r from-amber-700 to-amber-400 transition-all duration-300" style={{ width: `${importProgress.total > 0 ? importProgress.index / importProgress.total * 100 : 0}%` }} /></div>{importProgress.current && <p className="truncate text-xs text-stone-400">▶︎ {importProgress.current}</p>}{lockWait > 0 && <p className="text-xs text-amber-400">⏳ Rate-limit · reprise dans {lockWait}s</p>}</div>}
      <p className="mt-2 text-xs text-stone-500">La réparation relie les fiches existantes lorsque les données permettent une association certaine. Les cas ambigus restent à examiner.</p>
      {report && <p className="mt-3 text-xs text-stone-400">{report.counts.games} jeux · {report.counts.studios} studios · {report.counts.dlcs} DLC · {report.ignoredCount} liens retirés · scan du {new Date(report.scannedAt).toLocaleString("fr-FR")}</p>}
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Contrôles de cohérence"><button className={button} aria-pressed={relation === "ALL"} onClick={() => { setRelation("ALL"); setPage(0); }}>Tous ({report?.issues.length ?? "—"})</button>{(Object.entries(relations) as [Relation, string][]).map(([key, label]) => <button key={key} className={`${button} ${relation === key ? "!border-amber-400 !text-amber-300" : ""}`} aria-pressed={relation === key} onClick={() => { setRelation(key); setPage(0); }}>{label} · {report?.issues.filter((i) => i.relation === key).length ?? "—"}</button>)}</div>
    <div className="overflow-hidden rounded-xl border border-amber-900/60 bg-stone-950">
      <div className="flex flex-wrap gap-2 border-b border-stone-800 p-3"><input aria-label="Rechercher une anomalie" className="min-w-0 flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-white" placeholder="Nom, AppID, raison…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} /><select aria-label="Filtrer les anomalies" className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-white" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}><option value="ALL">Tous les états</option><option value="FAILED">Échecs / cas ambigus</option><option value="LOCAL">Traitables localement</option><option value="STEAM">Steam requis</option></select></div>
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-800 p-3"><button className={button} disabled={locked} onClick={() => setSelected((current) => [...new Set([...current, ...visible.map((i) => i.key)])].slice(0, 200))}>Sélectionner cette page</button><button className={button} disabled={locked} onClick={() => setSelected([])}>Vider la sélection</button><span className="text-xs text-stone-400">{selected.length}/200 sélectionnés</span></div>
      <div className="flex flex-wrap gap-2 border-b border-stone-800 p-3"><button className={button} disabled={locked || !studioSelected.length} onClick={() => void local("create-studios")}>Créer {studioSelected.length || "les"} studios localement</button><button className={`${button} !border-blue-800`} disabled={locked || !steamSelected.length} onClick={() => void importSelection()}>Créer / vérifier via Steam ({steamSelected.length})</button><button className={`${button} !border-red-900 !text-red-300`} disabled={locked || !selected.length} onClick={() => void local("ignore")}>Retirer définitivement les liens</button><button className={`${button} !border-red-800 !text-red-400`} disabled={locked || !filtered.length} onClick={() => void ignoreAll()}>Retirer tout ({filtered.length})</button><button className={`${button} !border-blue-700 !text-blue-300`} disabled={locked || !filtered.filter((i) => i.method === "STEAM").length} onClick={() => void importSelection(filtered.filter((i) => i.method === "STEAM"))}>Steam tous ({filtered.filter((i) => i.method === "STEAM").length})</button>{importing && <button className={button} onClick={() => { stopped.current = true; setMessage("Arrêt demandé après l’élément en cours…"); }}>Interrompre après cette carte</button>}{!importing && <button className={`${button} !border-yellow-800 !text-yellow-400`} onClick={() => void fetch("/api/admin/coherence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clear-steam-lock" }) }).then(() => setError(""))}>🔓 Libérer le verrou</button>}</div>
      <p className="px-3 py-2 text-xs text-stone-500">Les imports Steam sont déclenchés uniquement ici, un par un. Une limitation Steam met le lot en pause. Les échecs sont conservés sur le serveur.</p>
      {message && !importing && <p role="status" className="px-3 py-2 text-sm text-amber-200">{message}</p>}{importing && message && <div role="status" className="border-y border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">{message}</div>}{error && <p role="alert" className="border-y border-red-900 bg-red-950/40 px-3 py-3 text-sm text-red-200">{error}</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-stone-900 text-xs text-stone-400"><tr><th className="p-3">Choix</th><th className="p-3">Carte source → Carte liée</th><th className="p-3">Traitement</th><th className="p-3">Diagnostic</th></tr></thead><tbody>{visible.map((issue) => <tr key={issue.key} className={`border-t border-stone-800 ${issue.status === "FAILED" ? "bg-red-950/35" : ""}`}><td className="p-3"><input type="checkbox" aria-label={`Sélectionner ${issue.targetName}`} disabled={locked || selected.length >= 200 && !selected.includes(issue.key)} checked={selected.includes(issue.key)} onChange={(e) => toggle(issue.key, e.target.checked)} /></td><td className="p-3"><span className="block text-xs text-stone-500">{relations[issue.relation]}</span><span className="block text-stone-300">{issue.sourceName}</span><button onClick={() => setDetail(issue)} className="text-left font-semibold text-amber-200 underline decoration-amber-900 underline-offset-4">→ {issue.targetName}</button></td><td className="p-3 text-xs text-stone-400">{methods[issue.method]}{issue.status === "FAILED" && <strong className="mt-1 block text-red-300">Échec conservé</strong>}</td><td className="max-w-md p-3 text-xs text-stone-300">{issue.failureReason ?? issue.reason}</td></tr>)}</tbody></table></div>
      {!visible.length && <p className="p-8 text-center text-sm text-stone-400">{busy ? "Lecture de la base…" : !report ? "Lance un scan pour charger les résultats." : filtered.length === 0 && report.issues.length ? "Aucune anomalie pour ces filtres." : "Aucune anomalie détectée dans les références enregistrées."}</p>}
      <div className="flex items-center justify-between gap-2 border-t border-stone-800 p-3 text-xs text-stone-400"><button className={button} disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Précédent</button><span>{filtered.length} résultats · {currentPage + 1}/{lastPage + 1}</span><button className={button} disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Suivant</button></div>
    </div>
    {detail && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4" onClick={() => setDetail(null)}><div role="dialog" aria-modal="true" aria-label="Détail du lien" className="max-h-[85dvh] w-full max-w-lg overflow-auto rounded-2xl border border-amber-700 bg-stone-950 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}><button autoFocus className={`${button} float-right`} onClick={() => setDetail(null)} aria-label="Fermer">×</button><h3 className="pr-10 text-lg text-amber-100">{detail.sourceName} → {detail.targetName}</h3><p className="mt-4 text-sm text-stone-300">{detail.reason}</p>{detail.failureReason && <p className="mt-3 rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">{detail.failureReason}</p>}<p className="mt-4 text-xs text-stone-500">{methods[detail.method]} · Source #{detail.sourceId}{detail.targetId ? ` · Cible #${detail.targetId}` : ""}</p><p className="mt-3 text-xs text-stone-400">Ferme cette fiche puis sélectionne sa ligne pour la traiter.</p></div></div>}
  </section>;
}
