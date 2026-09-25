"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SteamMenuIcon } from "@/components/SteamMenuIcon";

type SearchResult = { appid: string; name: string; image: string | null; existing: { id: string; name: string; contentType: "GAME" | "DLC" } | null };
type Submission = {
  id: string; rootGameName: string; developers: string[]; phase: "STUDIOS" | "DLC" | "DONE";
  studioIndex: number; gameIds: string[]; gameIndex: number; scannedGames: number;
  importedDlcs: number; rejectedDlcs: number; errors: number; error?: string;
  studiosTotal?: number; gamesTotal?: number; currentGame?: string;
};
const STORAGE_KEY = "sm_catalog_submission_id";

export function AjouterJeuClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSubmission = useCallback(async (id: string) => {
    const response = await fetch(`/api/catalog-submission?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json() as Submission;
  }, []);

  useEffect(() => {
    const id = localStorage.getItem(STORAGE_KEY);
    if (!id) return;
    void loadSubmission(id).then((state) => { if (state) setSubmission(state); else localStorage.removeItem(STORAGE_KEY); });
  }, [loadSubmission]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = query.trim();
    if (term.length < 2) { setResults([]); setSearching(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true); setError("");
      try {
        const response = await fetch(`/api/catalog-submission/search?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Recherche Steam impossible.");
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Recherche Steam impossible."); }
      finally { setSearching(false); }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  async function advance(id: string) {
    setWorking(true); setError("");
    try {
      let state = await loadSubmission(id);
      if (!state) throw new Error("Cette soumission n’est plus disponible.");
      setSubmission(state);
      while (state.phase === "STUDIOS") {
        const studio = state.developers[state.studioIndex];
        if (!studio) { state = { ...state, phase: "DLC" }; setSubmission(state); break; }
        setMessage(`Synchronisation du studio ${studio} (${state.studioIndex + 1}/${state.developers.length})…`);
        const response = await fetch("/api/admin/studios/sync", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: studio, submissionId: id }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? `Synchronisation de ${studio} interrompue.`);
        state = await loadSubmission(id) ?? state;
        setSubmission(state);
      }
      while (state.phase === "DLC") {
        setMessage(`Recherche des DLC et extensions… ${state.scannedGames}/${state.gamesTotal ?? state.gameIds.length} jeux vérifiés.`);
        const response = await fetch("/api/catalog-submission/dlc", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
        });
        const data = await response.json() as Submission;
        state = data;
        setSubmission(state);
        if (!response.ok) throw new Error(data.error ?? "Le scan est en pause; tu peux le reprendre ici.");
      }
      if (state.phase === "DONE") {
        setMessage(`Terminé : « ${state.rootGameName} » et les jeux associés sont au catalogue, avec ${state.importedDlcs} DLC ajouté(s). Aucune carte n’a été ajoutée à ta collection.`);
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La soumission est interrompue.");
    } finally { setWorking(false); }
  }

  async function submitGame() {
    if (!selected || selected.existing) return;
    setWorking(true); setError(""); setMessage("Envoi du jeu au catalogue…");
    try {
      const response = await fetch("/api/catalog-submission", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appid: selected.appid }),
      });
      const data = await response.json();
      if (data.activeId) {
        localStorage.setItem(STORAGE_KEY, data.activeId);
        const active = await loadSubmission(data.activeId);
        if (active) setSubmission(active);
        setError(data.error ?? "Reprends d’abord la contribution déjà lancée.");
        setWorking(false); return;
      }
      if (data.alreadyExists) {
        const updated = { ...selected, existing: data.game };
        setSelected(updated); setResults((current) => current.map((item) => item.appid === selected.appid ? updated : item));
        setMessage(data.message ?? `« ${selected.name} » existe déjà dans le catalogue.`);
        setWorking(false); return;
      }
      if (!response.ok) throw new Error(data.error ?? "Impossible d’ajouter ce jeu.");
      localStorage.setItem(STORAGE_KEY, data.id);
      setSubmission(data as Submission);
      setSelected(null); setQuery(""); setResults([]);
      await advance(data.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Soumission impossible."); }
    finally { setWorking(false); }
  }

  const progress = !submission ? 0 : submission.phase === "STUDIOS"
    ? submission.developers.length ? submission.studioIndex / submission.developers.length * 35 : 35
    : submission.phase === "DLC" ? 40 + (submission.gamesTotal ? submission.scannedGames / Math.max(1, submission.gamesTotal) * 60 : 0) : 100;

  return <div className="mx-auto max-w-3xl space-y-6">
    <header className="rounded-2xl border border-amber-900/60 bg-gradient-to-br from-gray-900 via-gray-900 to-amber-950/20 p-5 sm:p-7">
      <div className="flex items-center gap-3"><SteamMenuIcon name="submit" className="h-12 w-12" /><div><p className="text-xs uppercase tracking-[.2em] text-amber-500">Contribution au catalogue</p><h1 className="text-2xl font-bold text-white">Ajouter un jeu</h1></div></div>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-300">Propose un jeu manquant. Après validation, Steam Masters ajoutera le jeu, ses studios, les autres jeux Steam référencés de ces studios et les DLC trouvés pour ces jeux.</p>
      <p className="mt-2 rounded-lg border border-gray-800 bg-black/20 p-3 text-xs leading-5 text-gray-400">Les cartes créées rejoignent le catalogue commun et pourront être obtenues dans les boosters. Elles ne sont pas ajoutées directement à ta collection.</p>
    </header>

    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-5">
      <label htmlFor="steam-game-search" className="mb-2 block text-sm font-semibold text-gray-200">Rechercher sur Steam</label>
      <input id="steam-game-search" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); setMessage(""); }} placeholder="Nom du jeu…" disabled={working} className="w-full rounded-lg border border-gray-700 bg-gray-950 px-4 py-3 text-white outline-none focus:border-amber-600" />
      {searching && <p className="mt-2 text-xs text-gray-500">Recherche dans le catalogue Steam…</p>}
      {!!results.length && <div className="mt-3 divide-y divide-gray-800 overflow-hidden rounded-lg border border-gray-800">{results.map((result) => <button type="button" key={result.appid} disabled={working || !!result.existing} onClick={() => { setSelected(result); setMessage(""); }} className={`flex w-full items-center gap-3 p-3 text-left transition ${result.existing ? "cursor-not-allowed bg-amber-950/20 opacity-75" : selected?.appid === result.appid ? "bg-amber-950/40" : "hover:bg-gray-800"}`}>
        {result.image ? <img src={result.image} alt="" className="h-10 w-16 rounded object-cover" /> : <span className="flex h-10 w-16 items-center justify-center rounded bg-gray-800">🎮</span>}
        <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-white">{result.name}</strong><small className={result.existing ? "text-amber-300" : "text-gray-500"}>{result.existing ? "Déjà présent au catalogue" : `AppID ${result.appid}`}</small></span>
        {result.existing && <span className="text-xs text-amber-300">Déjà ajouté</span>}
      </button>)}</div>}
      {query.trim().length >= 2 && !searching && results.length === 0 && !error && <p className="mt-3 text-sm text-gray-500">Aucun jeu trouvé. Essaie un autre nom.</p>}
      {selected && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-900/60 bg-amber-950/20 p-3"><span className="text-sm text-amber-100">Sélection : <strong>{selected.name}</strong></span><button type="button" onClick={() => void submitGame()} disabled={working} className="rounded-lg bg-gradient-to-b from-red-600 to-red-800 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{working ? "Envoi en cours…" : "Envoyer et compléter le catalogue"}</button></div>}
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      {message && !submission && <p aria-live="polite" className="mt-3 text-sm text-amber-200">{message}</p>}
    </section>

    {submission && <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-5" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-white">{submission.phase === "DONE" ? "Soumission terminée" : `Ajout de ${submission.rootGameName}`}</h2><p className="mt-1 text-sm text-gray-400">{message || (submission.phase === "STUDIOS" ? `Studios : ${submission.studioIndex}/${submission.developers.length}` : submission.phase === "DLC" ? `Jeux vérifiés : ${submission.scannedGames}/${submission.gamesTotal ?? submission.gameIds.length} · DLC créés : ${submission.importedDlcs}` : "Terminé")}</p></div>
        {submission.phase !== "DONE" && !working && <button type="button" onClick={() => void advance(submission.id)} className="rounded-lg border border-amber-700 px-4 py-2 text-sm text-amber-200 hover:bg-amber-950/40">Reprendre</button>}
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-800"><div className="h-full rounded-full bg-gradient-to-r from-red-700 via-amber-500 to-amber-200 transition-all" style={{ width: `${Math.min(100, Math.max(progress, submission.phase === "DONE" ? 100 : 3))}%` }} /></div>
      <p className="mt-3 text-xs text-gray-500">{submission.developers.length} studio(s) · {submission.importedDlcs} DLC ajouté(s) · {submission.rejectedDlcs} DLC refusé(s) · {submission.errors} erreur(s). Aucune carte n’est distribuée directement.</p>
      {submission.error && <p className="mt-2 text-xs text-amber-300">Dernier incident : {submission.error}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error} La progression est conservée; tu peux reprendre le traitement.</p>}
    </section>}
  </div>;
}
