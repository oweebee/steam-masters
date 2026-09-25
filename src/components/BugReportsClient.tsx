"use client";
import { useCallback, useEffect, useState } from "react";
type Status = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED";
type Report = { id: string; title: string; description: string; pagePath: string | null; status: Status; adminNote?: string; adminReply: string; createdAt: string; updatedAt: string; user?: { username: string } | null };
const statuses: Record<Status, string> = { OPEN: "Nouveau", IN_PROGRESS: "En cours", RESOLVED: "Résolu", DISMISSED: "Classé sans suite" };
const input = "w-full rounded-lg border border-amber-900/70 bg-stone-950 px-3 py-2 text-sm text-stone-100 outline-none focus:border-amber-500";
const button = "rounded-lg border border-amber-800 bg-gradient-to-b from-red-700 to-red-950 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40";
export function BugReportsClient({ admin = false }: { admin?: boolean }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pagePath, setPagePath] = useState("");
  const [requestId, setRequestId] = useState("");
  const [selected, setSelected] = useState<Report | null>(null);
  const [draft, setDraft] = useState({ status: "OPEN" as Status, adminNote: "", adminReply: "" });
  const choose = useCallback((report: Report) => { setSelected(report); setDraft({ status: report.status, adminNote: report.adminNote ?? "", adminReply: report.adminReply }); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const url = admin ? `/api/admin/bug-reports?status=${filter}&q=${encodeURIComponent(query)}&page=${page}` : "/api/bug-reports";
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Chargement impossible.");
        if (controller.signal.aborted) return;
        setReports(data.reports); setTotal(data.total ?? data.reports.length);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Chargement impossible."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, query ? 300 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [admin, filter, query, page, reload]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setMessage("");
    const id = requestId || crypto.randomUUID(); setRequestId(id);
    try {
      const response = await fetch("/api/bug-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: id, title, description, pagePath }), signal: AbortSignal.timeout(30_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Envoi impossible.");
      setTitle(""); setDescription(""); setPagePath(""); setRequestId(""); setMessage("Signalement transmis à l’administrateur. Son suivi et sa réponse apparaîtront ci-dessous."); setReload((n) => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Envoi interrompu. Tu peux réessayer sans perdre ton message."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!selected || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/bug-reports", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, updatedAt: selected.updatedAt, ...draft }), signal: AbortSignal.timeout(30_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Enregistrement impossible.");
      setSelected(null); setMessage("Suivi enregistré. La réponse est visible par l’auteur du signalement."); setReload((n) => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Enregistrement impossible."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto w-full max-w-6xl space-y-5 p-4 pb-24 sm:p-8">
    <header><h1 className="text-2xl font-bold text-amber-100">{admin ? "Bug Reports · Réception et suivi" : "Bug Report"}</h1><p className="mt-2 text-sm text-stone-400">{admin ? "Consulte les signalements, note tes investigations et réponds aux joueurs." : "Un problème dans l’application ? Décris ce qui s’est passé et ce que tu attendais. Ton message sera visible par l’administration."}</p></header>
    {error && <p role="alert" className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}{message && <p role="status" className="rounded-lg border border-emerald-900 bg-emerald-950/30 p-3 text-sm text-emerald-200">{message}</p>}
    {!admin && <form onSubmit={submit} className="space-y-4 rounded-2xl border border-amber-900/80 bg-gradient-to-br from-stone-900 to-stone-950 p-5"><label className="block space-y-1 text-sm text-amber-100"><span>Sujet</span><input required minLength={3} maxLength={120} className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Le bouton d’échange reste bloqué" /></label><label className="block space-y-1 text-sm text-amber-100"><span>Message et étapes pour reproduire</span><textarea required minLength={10} maxLength={5000} rows={6} className={input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Sur quelle page ? Après quelles actions ? Quel résultat attendais-tu ?" /></label><label className="block space-y-1 text-sm text-amber-100"><span>Page concernée (facultatif)</span><input maxLength={255} className={input} value={pagePath} onChange={(e) => setPagePath(e.target.value)} placeholder="/echanges" /></label><p className="text-xs text-stone-500">N’inclus pas de mot de passe ni de donnée confidentielle. Jusqu’à 5 signalements par heure.</p><button className={button} disabled={busy}>{busy ? "Envoi…" : "Envoyer le signalement"}</button></form>}
    <section className="space-y-3"><div className="flex flex-wrap items-center gap-3"><h2 className="mr-auto font-semibold text-amber-100">{admin ? `${total} signalement(s)` : "Mes 50 derniers signalements"}</h2><button className={button} disabled={loading || busy} onClick={() => { setError(""); setReload((n) => n + 1); }}>Actualiser</button></div>
      {admin && <div className="flex flex-wrap gap-3"><input aria-label="Rechercher des signalements" className={`${input} flex-1`} value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Sujet, message ou joueur…" /><select aria-label="Filtrer par statut" className={`${input} sm:!w-auto`} value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}><option value="ALL">Tous les statuts</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>}
      {loading && <p className="text-sm text-stone-400">Chargement…</p>}
      {!loading && !reports.length && <p className="rounded-xl border border-stone-800 p-6 text-sm text-stone-400">Aucun signalement.</p>}
      {reports.map((report) => <article key={report.id} className="rounded-xl border border-amber-900/60 bg-stone-900/70 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold text-amber-100">{report.title}</h3><span className={`rounded-full border px-2 py-1 text-xs ${report.status === "RESOLVED" ? "border-emerald-800 text-emerald-300" : report.status === "OPEN" ? "border-red-800 text-red-300" : "border-amber-900 text-amber-200"}`}>{statuses[report.status]}</span></div><p className="mt-1 text-xs text-stone-500">{admin ? `${report.user?.username ?? "Compte supprimé"} · ` : ""}{new Date(report.createdAt).toLocaleString("fr-FR")}{report.pagePath ? ` · ${report.pagePath}` : ""}</p><p className="mt-3 whitespace-pre-wrap break-words text-sm text-stone-300">{report.description}</p>{report.adminReply && <div className="mt-3 rounded border border-amber-900 bg-amber-950/20 p-3"><strong className="text-xs text-amber-300">Réponse de l’administration</strong><p className="mt-1 whitespace-pre-wrap break-words text-sm text-stone-200">{report.adminReply}</p></div>}{admin && <button className={`${button} mt-3`} disabled={busy} onClick={() => choose(report)}>Gérer ce signalement</button>}</article>)}
      {admin && <div className="flex items-center justify-between"><button className={button} disabled={!page || loading} onClick={() => setPage((n) => n - 1)}>Précédent</button><span className="text-xs text-stone-400">Page {page + 1}</span><button className={button} disabled={(page + 1) * 25 >= total || loading} onClick={() => setPage((n) => n + 1)}>Suivant</button></div>}
    </section>
    {admin && selected && <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/80 p-4"><section role="dialog" aria-modal="true" aria-label="Gestion du signalement" className="max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-amber-700 bg-stone-950 p-5"><h2 className="text-lg text-amber-100">{selected.title}</h2><label className="block space-y-1 text-sm text-stone-300"><span>Statut</span><select className={input} value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as Status }))}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="block space-y-1 text-sm text-stone-300"><span>Note interne · réservée aux administrateurs</span><textarea className={input} rows={3} maxLength={5000} value={draft.adminNote} onChange={(e) => setDraft((d) => ({ ...d, adminNote: e.target.value }))} /></label><label className="block space-y-1 text-sm text-stone-300"><span>Réponse visible par le joueur</span><textarea className={input} rows={4} maxLength={5000} value={draft.adminReply} onChange={(e) => setDraft((d) => ({ ...d, adminReply: e.target.value }))} /></label>{error && <p role="alert" className="text-sm text-red-300">{error}</p>}<div className="flex gap-2"><button className={button} disabled={busy} onClick={() => void save()}>{busy ? "Enregistrement…" : "Enregistrer"}</button><button className={button} disabled={busy} onClick={() => setSelected(null)}>Fermer</button></div></section></div>}
  </main>;
}
