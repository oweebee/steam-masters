"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { IgdbCoherencePanel } from "../games/IgdbCoherencePanel";
import { StudioDuplicatesPanel } from "@/components/StudioDuplicatesPanel";
import { GameCard } from "@/components/GameCard";
import { StudioCard } from "@/components/StudioCard";

type Game = {
  id: string; name: string; description: string; headerImage: string; atk: number; def: number;
  rarity: "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY"; tags: string[]; developers: string[];
  reviewScore: number; peakCcu: number; ownerEstimate: number; priceCents: number | null; isFree: boolean;
  contentType: "GAME" | "DLC";
  platforms: string[];
};
type Suggestion = { igdbId: number; name: string };
type Platform = { id: number; name: string; abbreviation?: string | null };
type Section = "import" | "coherence" | "studios";
type DlcScanState = { scannedGames: number; total: number; imported: number; rejected: number; errors: number; done: boolean; cancelled?: boolean; current?: string; error?: string; retryable?: boolean; runId?: string };
type BulkEvent = { id: string; label: string; status: "pending" | "success" | "error" };
type StudioImport = { created: number; updated: number; linked: number; studios?: Studio[] };
type Studio = { id: string; name: string; gameCount: number; atk: number; def: number; rarity: "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY"; games: string[] };
type ImportedGame = Game & { studioImport?: StudioImport };

const IGDB_PLATFORMS: { id: number | null; label: string }[] = [
  { id: null, label: "Toutes les plateformes" },
  { id: 6, label: "PC (Windows)" },
  { id: 13, label: "DOS" },
  { id: 14, label: "Mac" },
  { id: 3, label: "Linux" },
  { id: 7, label: "PlayStation" },
  { id: 8, label: "PlayStation 2" },
  { id: 9, label: "PlayStation 3" },
  { id: 48, label: "PlayStation 4" },
  { id: 167, label: "PlayStation 5" },
  { id: 11, label: "Xbox" },
  { id: 12, label: "Xbox 360" },
  { id: 49, label: "Xbox One" },
  { id: 169, label: "Xbox Series X|S" },
  { id: 4, label: "N64" },
  { id: 5, label: "Wii" },
  { id: 41, label: "Wii U" },
  { id: 130, label: "Nintendo Switch" },
  { id: 18, label: "NES" },
  { id: 19, label: "SNES" },
  { id: 29, label: "Mega Drive / Genesis" },
  { id: 32, label: "Sega Saturn" },
  { id: 23, label: "Dreamcast" },
  { id: 33, label: "Game Boy" },
  { id: 22, label: "Game Boy Color" },
  { id: 24, label: "Game Boy Advance" },
  { id: 137, label: "New Nintendo 3DS" },
  { id: 16, label: "Amiga" },
  { id: 52, label: "Arcade" },
  { id: 65, label: "Jaguar" },
];

function createRunId(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }

async function resilientFetch(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 30_000) {
  try {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return await fetch(input, { ...init, signal });
  } catch { return null; }
}

export default function AdminIgdbPage() {
  const [section, setSection] = useState<Section>("import");
  const [query, setQuery] = useState("");
  const [igdbId, setIgdbId] = useState("");
  const [bulkPlatform, setBulkPlatform] = useState<number | null>(null);
  const [bulkRandomPlatforms, setBulkRandomPlatforms] = useState(false);
  const [bulkCount, setBulkCount] = useState(100);
  const [platforms, setPlatforms] = useState<Platform[]>(IGDB_PLATFORMS.filter((p): p is { id: number; label: string } => p.id !== null).map((p) => ({ id: p.id, name: p.label })));
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importedCards, setImportedCards] = useState<Game[]>([]);
  const [importedStudios, setImportedStudios] = useState<Studio[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, created: 0, errors: 0, studiosCreated: 0, studiosUpdated: 0 });
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [bulkEvents, setBulkEvents] = useState<BulkEvent[]>([]);
  const bulkStopped = useRef(false);

  const [dlcScan, setDlcScan] = useState<DlcScanState | null>(null);
  const [scanningDlcs, setScanningDlcs] = useState(false);
  const dlcStopped = useRef(false);

  const [backfillMsg, setBackfillMsg] = useState("");
  const [backfilling, setBackfilling] = useState(false);
  const [recalcingStats, setRecalcingStats] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [purgingPc, setPurgingPc] = useState(false);
  const [purgePcMsg, setPurgePcMsg] = useState("");
  const [splitMsg, setSplitMsg] = useState("");
  const [recalcStatsMsg, setRecalcStatsMsg] = useState("");
  const [platformCounts, setPlatformCounts] = useState<{ platform: string; count: number }[]>([]);
  const [completePlatformIds, setCompletePlatformIds] = useState<number[]>([]);
  const [platformCatalogTotals, setPlatformCatalogTotals] = useState<Record<number, number>>({});
  const [platformCountsTotal, setPlatformCountsTotal] = useState(0);
  const [platformCountsLoading, setPlatformCountsLoading] = useState(false);

  // Les comptages en base stockent le nom court (abréviation) alors que le menu d'import
  // affiche le nom complet (voir getIgdbPlatformNames) : on fait ici la jonction par
  // nom OU abréviation pour que les deux listes correspondent, et on inclut les
  // plateformes sans aucun jeu importé (count 0) pour repérer les manquants.
  const unifiedPlatformCounts = useMemo(() => {
    const byKey = new Map<string, number>();
    for (const row of platformCounts) byKey.set(row.platform, row.count);
    return platforms
      .map((p) => {
        const count = byKey.get(p.name) ?? (p.abbreviation ? byKey.get(p.abbreviation) ?? 0 : 0);
        const catalogTotal = platformCatalogTotals[p.id] ?? null;
        const complete = (catalogTotal !== null && catalogTotal > 0 && count >= catalogTotal) || completePlatformIds.includes(p.id);
        return { id: p.id, name: p.name, count, catalogTotal, complete };
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [platforms, platformCounts, completePlatformIds, platformCatalogTotals]);

  const loadPlatformCounts = () => {
    setPlatformCountsLoading(true);
    fetch("/api/admin/igdb/platform-counts").then(async (r) => r.ok ? r.json() : Promise.reject()).then((d: { total: number; platforms: { platform: string; count: number }[]; completePlatformIds?: number[]; catalogTotals?: { platformId: number; total: number }[] }) => {
      setPlatformCounts(d.platforms ?? []);
      setPlatformCountsTotal(d.total ?? 0);
      setCompletePlatformIds(d.completePlatformIds ?? []);
      setPlatformCatalogTotals(Object.fromEntries((d.catalogTotals ?? []).map((row) => [row.platformId, row.total])));
    }).catch(() => {}).finally(() => setPlatformCountsLoading(false));
  };

  useEffect(() => {
    fetch("/api/admin/igdb/dlc-scan").then((r) => r.json()).then((d) => setDlcScan(d.state)).catch(() => {});
    fetch("/api/admin/igdb/platforms").then(async (r) => r.ok ? r.json() : Promise.reject()).then((rows: Platform[]) => {
      if (Array.isArray(rows) && rows.length) setPlatforms(rows);
    }).catch(() => {});
    const initial = window.setTimeout(loadPlatformCounts, 0);
    return () => window.clearTimeout(initial);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) return;
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/igdb/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
        setShowSuggestions(true);
      } finally { setSearching(false); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  function changeQuery(value: string) {
    setQuery(value);
    setIgdbId("");
    if (value.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); }
  }

  function pickSuggestion(s: Suggestion) { setIgdbId(String(s.igdbId)); setQuery(s.name); setShowSuggestions(false); }

  async function importGame(e: React.FormEvent) {
    e.preventDefault();
    if (!igdbId) { setError("Choisis un jeu dans la liste de suggestions."); return; }
    setLoading(true); setError("");
    const res = await resilientFetch("/api/admin/igdb/import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ igdbId, runId: createRunId("igdb-manual-import") }),
    });
    if (!res) { setError("Connexion interrompue pendant l'import. Consulte le Journal."); setLoading(false); return; }
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }
    setImportedCards((prev) => [data as Game, ...prev]);
    const si = (data as ImportedGame).studioImport;
    if (si?.studios?.length) setImportedStudios((prev) => { const ids = new Set(prev.map(s => s.id)); return [...si.studios!.filter(s => !ids.has(s.id)), ...prev]; });
    setQuery(""); setIgdbId(""); setLoading(false);
  }

  async function bulkImport() {
    if (bulkRunning) return;
    if (!bulkRandomPlatforms && bulkPlatform == null) { setBulkMsg("Choisis d'abord la plateforme à importer."); return; }
    const target = Math.max(1, Math.min(1000, bulkCount));
    setBulkRunning(true); setBulkMsg("Découverte IGDB…"); bulkStopped.current = false;
    setBulkProgress({ done: 0, total: 0, created: 0, errors: 0, studiosCreated: 0, studiosUpdated: 0 });
    setBulkErrors([]);
    setBulkEvents([]);
    try {
      let ids: string[] = [];
      const candidateNames = new Map<string, string>();
      const idPlatform = new Map<string, number>();

      if (bulkRandomPlatforms) {
        const pool = [...platforms].sort(() => Math.random() - 0.5);
        for (const platform of pool) {
          if (ids.length >= target) break;
          const discoverRes = await fetch(`/api/admin/igdb/discover?runId=${createRunId("igdb-discover")}&platform=${platform.id}&limit=${target}`);
          const discoverData = await discoverRes.json();
          if (!discoverRes.ok) continue;
          const pIds: string[] = discoverData.ids ?? [];
          for (const candidate of (discoverData.candidates ?? []) as { id: string; name: string }[]) {
            if (!candidateNames.has(candidate.id)) candidateNames.set(candidate.id, candidate.name);
          }
          for (const id of pIds) {
            if (idPlatform.has(id) || ids.length >= target) continue;
            idPlatform.set(id, platform.id);
            ids.push(id);
          }
        }
        // Ordre de célébrité conservé (total_rating_count desc côté IGDB) : les jeux les plus connus
        // d'abord, les moins connus en dernier — pas de mélange aléatoire ici.
        ids = ids.slice(0, target);
        if (ids.length === 0) { setBulkMsg("Aucun jeu absent du catalogue trouvé (plateformes aléatoires)."); return; }
      } else {
        const discoverRes = await fetch(`/api/admin/igdb/discover?runId=${createRunId("igdb-discover")}&platform=${bulkPlatform}&limit=${target}`);
        const discoverData = await discoverRes.json();
        if (!discoverRes.ok) throw new Error(discoverData.error ?? "Découverte IGDB impossible.");
        ids = (discoverData.ids ?? []).slice(0, target);
        for (const candidate of (discoverData.candidates ?? []) as { id: string; name: string }[]) candidateNames.set(candidate.id, candidate.name);
        for (const id of ids) idPlatform.set(id, bulkPlatform!);
        if (ids.length === 0) { setBulkMsg(`Aucun jeu absent du catalogue trouvé pour ${platformName(bulkPlatform)}.`); return; }
      }

      setBulkEvents(ids.slice(0, 8).map((id) => ({ id, label: candidateNames.get(id) ?? `Candidat IGDB #${id.replace(/^igdb-/, "")}`, status: "pending" })));
      setBulkProgress({ done: 0, total: ids.length, created: 0, errors: 0, studiosCreated: 0, studiosUpdated: 0 });
      let created = 0;
      let errors = 0;
      let studiosCreated = 0;
      let studiosUpdated = 0;
      for (let i = 0; i < ids.length && !bulkStopped.current; i++) {
        setBulkMsg(`Import ${i + 1}/${ids.length} · id ${ids[i]}…`);
        const res = await resilientFetch("/api/admin/igdb/import", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ igdbId: ids[i].replace(/^igdb-/, ""), platformId: idPlatform.get(ids[i]) ?? bulkPlatform, runId: createRunId("igdb-bulk"), skipRecalc: true }),
        });
        const data = res ? await res.json().catch(() => null) : null;
        const studioImport = data?.studioImport as StudioImport | undefined;
        const label = res?.ok
          ? `${data.name} · carte créée · ${studioImport?.created ?? 0} studio(s) créé(s), ${studioImport?.updated ?? 0} mis à jour`
          : `${ids[i]} · ${data?.error ?? "connexion interrompue"}`;
        if (res?.ok) {
          created += 1;
          studiosCreated += studioImport?.created ?? 0;
          studiosUpdated += studioImport?.updated ?? 0;
          setImportedCards((prev) => [data as ImportedGame, ...prev]);
          if (studioImport?.studios?.length) setImportedStudios((prev) => { const ids = new Set(prev.map(s => s.id)); return [...studioImport.studios!.filter(s => !ids.has(s.id)), ...prev]; });
        }
        else { errors += 1; setBulkErrors((previous) => [...previous.slice(-4), label]); }
        const status: BulkEvent["status"] = res?.ok ? "success" : "error";
        setBulkEvents((previous) => [...previous.filter((event) => event.id !== ids[i]), { id: ids[i], label, status }].slice(-8));
        setBulkProgress({ done: i + 1, total: ids.length, created, errors, studiosCreated, studiosUpdated });
      }
      const summary = `${created} carte(s) créée(s), ${studiosCreated} studio(s) créé(s), ${studiosUpdated} studio(s) mis à jour, ${errors} échec(s).`;
      setBulkMsg(bulkStopped.current ? `Import arrêté : ${summary}` : `Import terminé : ${summary}`);
      if (created > 0) await fetch("/api/admin/rarity-recalc", { method: "POST" }).catch(() => {});
    } catch (e) {
      setBulkMsg(e instanceof Error ? e.message : "Erreur import en masse.");
    } finally { setBulkRunning(false); loadPlatformCounts(); }
  }

  async function runDlcScan(restart = false) {
    if (scanningDlcs) return;
    setScanningDlcs(true); dlcStopped.current = false;
    try {
      let done = false;
      let first = true;
      while (!done && !dlcStopped.current) {
        const res = await fetch("/api/admin/igdb/dlc-scan", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(first && restart ? { restart: true } : {}),
          signal: AbortSignal.timeout(310_000),
        });
        first = false;
        const data = await res.json() as DlcScanState & { error?: string };
        setDlcScan(data);
        done = Boolean(data.done);
        if (data.error && !data.retryable) break;
        if (!done && !dlcStopped.current) await new Promise((r) => setTimeout(r, 200));
      }
    } finally { setScanningDlcs(false); }
  }

  function platformName(id: number | null) {
    if (id == null) return "Toutes les plateformes";
    const item = platforms.find((p) => p.id === id);
    return item ? `${item.name}${item.abbreviation ? ` (${item.abbreviation})` : ""}` : `Plateforme #${id}`;
  }
  async function backfillPlatforms() {
    if (backfilling) return;
    setBackfilling(true); setBackfillMsg("Backfill en cours…");
    try {
      const res = await fetch("/api/admin/igdb/backfill-platforms", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Backfill impossible.");
      setBackfillMsg(`${data.updated}/${data.scanned} fiche(s) mise(s) à jour.`);
    } catch (e) {
      setBackfillMsg(e instanceof Error ? e.message : "Erreur backfill.");
    } finally { setBackfilling(false); }
  }
  async function purgePc() {
    if (purgingPc) return;
    if (!window.confirm("Supprimer les cartes IGDB PC sorties en 2005 ou après (ou sans date PC) ? Les fiches possédées par un joueur sont conservées.")) return;
    setPurgingPc(true); setPurgePcMsg("Purge en cours…");
    try {
      const res = await fetch("/api/admin/igdb/purge-pc", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Purge impossible.");
      setPurgePcMsg(`${data.deleted} carte(s) IGDB PC supprimée(s) · ${data.cleaned} fiche(s) nettoyée(s) · ${data.kept} conservée(s) (avant 2005)${data.keptOwned?.length ? ` · conservées (possédées) : ${data.keptOwned.join(", ")}` : ""}`);
      loadPlatformCounts();
    } catch (e) {
      setPurgePcMsg(e instanceof Error ? e.message : "Erreur purge.");
    } finally { setPurgingPc(false); }
  }
  async function splitPlatforms() {
    if (splitting) return;
    setSplitting(true); setSplitMsg("Scission en cours…");
    try {
      const res = await fetch("/api/admin/igdb/split-platforms", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scission impossible.");
      setSplitMsg(`${data.split} jeu(x) scindé(s) · ${data.created} carte(s) plateforme créée(s)${data.unresolved?.length ? ` · supports non résolus : ${data.unresolved.join(", ")}` : ""}`);
      loadPlatformCounts();
    } catch (e) {
      setSplitMsg(e instanceof Error ? e.message : "Erreur scission.");
    } finally { setSplitting(false); }
  }
  async function recalcStats() {
    if (recalcingStats) return;
    setRecalcingStats(true); setRecalcStatsMsg("Recalcul en cours… (peut prendre plusieurs minutes sur un gros catalogue)");
    try {
      const res = await fetch("/api/admin/igdb/recalc-stats", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Recalcul impossible.");
      setRecalcStatsMsg(`${data.updated}/${data.scanned} fiche(s) recalculée(s).`);
      loadPlatformCounts();
    } catch (e) {
      setRecalcStatsMsg(e instanceof Error ? e.message : "Erreur recalcul.");
    } finally { setRecalcingStats(false); }
  }

  return (
    <div className="min-h-screen bg-gray-950 p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Catalogue IGDB</h1>
      <p className="mb-5 text-sm text-gray-500">Import et cohérence des jeux/DLC rétro (hors Steam), source IGDB. Complète le catalogue Steam existant, table partagée.</p>

      <nav className="mb-6 flex flex-wrap gap-2 rounded-xl border border-gray-800 bg-gray-900/70 p-2" aria-label="Outils IGDB">
        {(["import", "coherence", "studios"] as const).map((key) => { const labels = { import: "⬇ Importer", coherence: "⚙ Cohérence", studios: "🏢 Studios" }; return <button key={key} type="button" onClick={() => setSection(key)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${section === key ? "border border-amber-700 bg-amber-950/70 text-amber-200 shadow-[inset_0_1px_0_rgba(251,191,36,.1)]" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}>{labels[key]}</button>; })}
      </nav>

      {section === "import" && <div className="space-y-4 max-w-5xl">
        <div className="rounded-xl border border-amber-900/60 bg-stone-950 p-4">
          <h2 className="text-white font-semibold mb-3">Import manuel</h2>
          <form onSubmit={importGame} className="relative">
            <input
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
              onFocus={() => suggestions.length && setShowSuggestions(true)}
              placeholder="Rechercher un jeu IGDB…"
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 max-h-64 overflow-auto">
                {suggestions.map((s) => (
                  <li key={s.igdbId}>
                    <button type="button" onClick={() => pickSuggestion(s)} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-800">{s.name} <span className="text-gray-600">#{s.igdbId}</span></button>
                  </li>
                ))}
              </ul>
            )}
            {searching && <p className="mt-1 text-xs text-gray-500">Recherche…</p>}
            <button type="submit" disabled={loading || !igdbId} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40">{loading ? "Import…" : "Importer"}</button>
          </form>
          {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        </div>

        <div className="rounded-xl border border-amber-900/60 bg-stone-950 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold">Jeux IGDB par plateforme · {platformCountsTotal} dans la base</h2>
              <p className="mt-0.5 text-xs text-gray-500">Dans la base / total disponible sur IGDB</p>
            </div>
            <button type="button" onClick={loadPlatformCounts} disabled={platformCountsLoading} className="rounded-lg border border-gray-700 px-3 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40">{platformCountsLoading ? "…" : "↻ Actualiser"}</button>
          </div>
          {platforms.length === 0 ? <p className="text-xs text-gray-500">{platformCountsLoading ? "Chargement…" : "Aucun jeu IGDB en base."}</p> : (
            <div className="max-h-56 overflow-auto rounded-lg border border-gray-800">
              <table className="w-full text-sm">
                <tbody>
                  {unifiedPlatformCounts.map((row) => {
                    const selected = !bulkRandomPlatforms && bulkPlatform === row.id;
                    return <tr key={row.id} className={`border-b last:border-0 ${row.complete ? "border-emerald-900/60" : "border-gray-800/70"}`}>
                      <td colSpan={2} className="p-0">
                        <button
                          type="button"
                          aria-pressed={selected}
                          disabled={bulkRunning}
                          onClick={() => { setBulkPlatform(row.id); setBulkRandomPlatforms(false); }}
                          className={`grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "bg-blue-950/70 ring-1 ring-inset ring-blue-500" : row.complete ? "bg-emerald-950/35 hover:bg-emerald-950/55" : "hover:bg-gray-800/70"}`}
                        >
                          <span className={selected ? "font-semibold text-blue-200" : row.complete ? "font-semibold text-emerald-300" : "text-gray-300"}>{selected && <span className="mr-2 text-blue-400" aria-label="Plateforme sélectionnée">●</span>}{!selected && row.complete && <span className="mr-2" aria-label="Catalogue complet">✓</span>}{row.name}</span>
                          <span className={`text-right font-semibold ${selected ? "text-blue-200" : row.complete ? "text-emerald-300" : row.count === 0 ? "text-gray-600" : "text-amber-200"}`}>
                            {row.count}<span className="font-normal text-gray-500"> / {row.catalogTotal ?? "—"}</span>
                          </span>
                        </button>
                      </td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-amber-900/60 bg-stone-950 p-4">
          <h2 className="text-white font-semibold mb-1">Import en masse · jeux absents du catalogue</h2>
          <p className="text-xs text-gray-500 mb-3">Clique une plateforme dans le tableau ci-dessus : seuls ses jeux absents seront découverts et importés. Les DLC sont traités séparément par le scan dédié.</p>
          <label className="mb-2 flex items-center gap-2 text-xs text-gray-400">
            <input type="checkbox" checked={bulkRandomPlatforms} onChange={(e) => setBulkRandomPlatforms(e.target.checked)} disabled={bulkRunning} />
            Plateformes aléatoires (mélange les plateformes sur les jeux importés, au lieu d&apos;une seule)
          </label>
          <div className={`mb-3 max-w-md rounded-lg border px-4 py-2.5 text-sm ${bulkRandomPlatforms ? "border-purple-800 bg-purple-950/30 text-purple-200" : bulkPlatform == null ? "border-gray-800 bg-gray-950 text-gray-500" : "border-blue-800 bg-blue-950/35 text-blue-200"}`}>
            <span className="mr-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Sélection</span>
            {bulkRandomPlatforms ? "Plateformes aléatoires" : bulkPlatform == null ? "Clique une plateforme dans le tableau" : platformName(bulkPlatform)}
          </div>
          <label className="mb-3 flex items-center gap-3 max-w-md text-xs text-gray-400">
            <span className="shrink-0">Nombre à importer</span>
            <input aria-label="Nombre de jeux à importer" type="range" min="1" max="1000" step="1" value={bulkCount} disabled={bulkRunning} onChange={(e) => setBulkCount(Number(e.target.value))} className="w-full accent-blue-500" />
            <input aria-label="Nombre de jeux à importer (saisie directe)" type="number" min="1" max="1000" value={bulkCount} disabled={bulkRunning} onChange={(e) => setBulkCount(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))} className="w-20 shrink-0 rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-right font-mono text-white" />
          </label>
          <div className="flex items-center gap-2">
            <button onClick={() => void bulkImport()} disabled={bulkRunning || (!bulkRandomPlatforms && bulkPlatform == null)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40">{bulkRunning ? "Import en cours…" : `Lancer l'import en masse · ${bulkCount} jeux`}</button>
            {bulkRunning && <button onClick={() => { bulkStopped.current = true; }} className="rounded-lg border border-red-900 px-4 py-2 text-sm text-red-300">Arrêter</button>}
          </div>
          {(bulkRunning || bulkMsg) && (
            <div className="mt-3 space-y-2 text-xs text-gray-400" aria-live="polite">
              {bulkProgress.total > 0 && <div className="overflow-hidden rounded-full border border-amber-900/70 bg-gray-950 h-2"><div className="h-full bg-gradient-to-r from-red-800 via-amber-600 to-amber-200 transition-all duration-300" style={{ width: `${Math.max(2, bulkProgress.done / bulkProgress.total * 100)}%` }} /></div>}
              {bulkProgress.total > 0 && <p>{bulkProgress.done}/{bulkProgress.total} · <span className="text-emerald-400">{bulkProgress.created} carte(s) créée(s)</span> · <span className="text-sky-300">{bulkProgress.studiosCreated} studio(s) créé(s)</span> · <span className="text-gray-300">{bulkProgress.studiosUpdated} studio(s) mis à jour</span> · <span className="text-red-400">{bulkProgress.errors} échec(s)</span></p>}
              {bulkMsg && <p className="text-amber-200">{bulkMsg}</p>}
              {bulkEvents.length > 0 && <ol className="grid gap-1 rounded-lg border border-gray-800 bg-gray-950/70 p-2">
                {bulkEvents.map((event) => <li key={event.id} className={`flex items-center gap-2 ${event.status === "success" ? "text-emerald-300" : event.status === "error" ? "text-red-300" : "text-gray-400"}`}><span aria-hidden="true">{event.status === "success" ? "✓" : event.status === "error" ? "×" : "◌"}</span><span className="truncate">{event.label}</span></li>)}
              </ol>}
              {bulkErrors.length > 0 && <ul className="space-y-0.5 text-red-300">{bulkErrors.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}</ul>}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-amber-900/60 bg-stone-950 p-4">
          <h2 className="text-white font-semibold mb-1">Scan DLC IGDB</h2>
          <p className="text-xs text-gray-500 mb-3">Parcourt les jeux IGDB déjà en base et importe leurs DLC/extensions connus.</p>
          <div className="flex items-center gap-2">
            <button onClick={() => void runDlcScan(!dlcScan || dlcScan.done)} disabled={scanningDlcs} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40">{scanningDlcs ? "Scan en cours…" : dlcScan && !dlcScan.done ? "Reprendre le scan" : "Lancer le scan DLC"}</button>
            {scanningDlcs && <button onClick={() => { dlcStopped.current = true; }} className="rounded-lg border border-red-900 px-4 py-2 text-sm text-red-300">Arrêter</button>}
          </div>
          {dlcScan && (
            <p className="mt-2 text-xs text-gray-400">{dlcScan.scannedGames}/{dlcScan.total} jeux analysés · <span className="text-emerald-400">{dlcScan.imported} DLC importés</span> · {dlcScan.rejected} refusés · {dlcScan.errors} erreurs{dlcScan.current ? ` · ${dlcScan.current}` : ""}</p>
          )}
        </div>

        <div className="rounded-xl border border-amber-900/60 bg-stone-950 p-4">
          <h2 className="text-white font-semibold mb-1">Backfill plateformes IGDB</h2>
          <p className="text-xs text-gray-500 mb-3">Renseigne le champ plateforme des cartes IGDB importées avant l&apos;ajout de ce filtre (platforms=[] en base).</p>
          <button onClick={() => void backfillPlatforms()} disabled={backfilling} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{backfilling ? "Backfill…" : "Lancer le backfill"}</button>
          {backfillMsg && <p className="mt-2 text-xs text-amber-200">{backfillMsg}</p>}
        </div>

        <div className="rounded-xl border border-amber-900/60 bg-stone-950 p-4">
          <h2 className="text-white font-semibold mb-1">Recalculer ATK/DEF des jeux IGDB</h2>
          <p className="text-xs text-gray-500 mb-3">La majorité des jeux IGDB (surtout rétro) n&apos;ont ni note critique ni follows/hypes IGDB, ce qui donnait ATK≈0 et DEF=5 pour presque tout le catalogue. Utilise maintenant aussi la note mixte et le nombre d&apos;avis IGDB (bien plus souvent renseignés). Relance ce recalcul pour corriger les fiches déjà importées.</p>
          <button onClick={() => void recalcStats()} disabled={recalcingStats} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{recalcingStats ? "Recalcul…" : "Recalculer ATK/DEF"}</button>
          {recalcStatsMsg && <p className="mt-2 text-xs text-amber-200">{recalcStatsMsg}</p>}
        </div>

        <div className="rounded-xl border border-amber-900/60 bg-stone-950 p-4">
          <h2 className="text-white font-semibold mb-1">Une carte par plateforme</h2>
          <p className="text-xs text-gray-500 mb-3">Scinde les jeux IGDB importés avec plusieurs plateformes : une carte distincte par support (mêmes stats). La fiche d&apos;origine garde la 1re plateforme et ses cartes joueurs.</p>
          <button onClick={() => void splitPlatforms()} disabled={splitting} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{splitting ? "Scission…" : "Scinder les jeux multi-plateformes"}</button>
          {splitMsg && <p className="mt-2 text-xs text-amber-200">{splitMsg}</p>}
        </div>

        <div className="rounded-xl border border-amber-900/60 bg-stone-950 p-4">
          <h2 className="text-white font-semibold mb-1">PC IGDB : jeux jusqu&apos;en 2004</h2>
          <p className="text-xs text-gray-500 mb-3">Steam gère le PC à partir de 2005. L&apos;import IGDB PC ne prend que les jeux avec une sortie PC datée avant 2005. Ce bouton supprime les cartes IGDB PC existantes qui ne respectent pas cette règle (sauf celles possédées par un joueur).</p>
          <button onClick={() => void purgePc()} disabled={purgingPc} className="rounded-lg bg-red-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{purgingPc ? "Purge…" : "Supprimer les cartes IGDB PC après 2004"}</button>
          {purgePcMsg && <p className="mt-2 text-xs text-amber-200">{purgePcMsg}</p>}
        </div>

        {importedCards.length > 0 && (
          <div className="rounded-xl border border-amber-900/60 bg-stone-950 p-4">
            <h2 className="text-white font-semibold mb-3">Cartes créées ({importedCards.length})</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {importedCards.map((g) => <GameCard key={g.id} {...g} source="IGDB" />)}
            </div>
          </div>
        )}

        {importedStudios.length > 0 && (
          <div className="rounded-xl border border-amber-900/60 bg-stone-950 p-4">
            <h2 className="text-white font-semibold mb-3">Studios créés/mis à jour ({importedStudios.length})</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {importedStudios.map((s) => (
                <StudioCard key={s.id} name={s.name} gameCount={s.gameCount} atk={s.atk} def={s.def} rarity={s.rarity} games={s.games.map(g => ({ name: g, appid: null, hasCard: true }))} />
              ))}
            </div>
          </div>
        )}
      </div>}

      {section === "coherence" && (
        <div className="space-y-4">
          <IgdbCoherencePanel externalBusy={loading || bulkRunning || scanningDlcs} />
        </div>
      )}

      {section === "studios" && (
        <div className="space-y-4">
          <StudioDuplicatesPanel />
        </div>
      )}

    </div>
  );
}
