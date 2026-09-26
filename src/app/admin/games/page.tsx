"use client";
import { useEffect, useRef, useState } from "react";
import { GameCard } from "@/components/GameCard";
import { CoherencePanel } from "./CoherencePanel";

type Game = {
  id: string;
  name: string;
  description: string;
  headerImage: string;
  atk: number;
  def: number;
  rarity: "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
  tags: string[];
  developers: string[];
  reviewScore: number;
  peakCcu: number;
  ownerEstimate: number;
  priceCents: number | null;
  isFree: boolean;
  contentType: "GAME" | "DLC";
};
type DlcScanState = { scannedGames: number; total: number; imported: number; rejected: number; errors: number; done: boolean; cancelled?: boolean; current?: string; error?: string; retryable?: boolean; runId?: string };

type Suggestion = { appid: number; name: string; tinyImage: string };
type StudioMatch = { id: string; name: string; gameCount: number };
type Rarity = Game["rarity"];
type RarityWeights = Record<Rarity, number>;
type AdminSection = "import" | "coherence" | "distribution";
type RarityOverview = { weights: RarityWeights; cooldownMinutes: number; instances: Record<Rarity, number>; catalog: Record<Rarity, number>; instanceTotal: number; catalogTotal: number };
type CatalogIssue = { scope: "GAME" | "DLC" | "STUDIO" | "LINK"; itemId: string; parentId?: string; name: string; reason: string; firstSeen: string; lastSeen: string; attempts: number };

const DEFAULT_WEIGHTS: RarityWeights = { LEGENDARY: 0.5, EPIC: 5, RARE: 10, UNCOMMON: 20, COMMON: 64.5 };
const RARITY_ORDER: Rarity[] = ["LEGENDARY", "EPIC", "RARE", "UNCOMMON", "COMMON"];
const RARITY_NAMES: Record<Rarity, string> = { LEGENDARY: "Orange · Légendaire", EPIC: "Violet · Épique", RARE: "Bleu · Rare", UNCOMMON: "Vert · Peu commune", COMMON: "Blanc · Commune" };

function createRunId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function formatCooldown(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

async function resilientFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch {
    return null;
  }
}

export default function AdminGamesPage() {
  const [section, setSection] = useState<AdminSection>("import");
  const [games, setGames] = useState<Game[]>([]);
  const [query, setQuery] = useState("");
  const [appid, setAppid] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [studioMatches, setStudioMatches] = useState<StudioMatch[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [syncingStudios, setSyncingStudios] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0, imported: 0, errors: 0, dlcsChecked: 0, dlcsLinked: 0, dlcsMissing: 0 });
  const [syncMessage, setSyncMessage] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState("");
  const [seedProgress, setSeedProgress] = useState({ base: 0, studiosDone: 0, studiosTotal: 0, errors: 0 });
  const [repairing, setRepairing] = useState(false);
  const [repairMessage, setRepairMessage] = useState("");
  const [dlcScan, setDlcScan] = useState<DlcScanState | null>(null);
  const [targetDlcScan, setTargetDlcScan] = useState<DlcScanState | null>(null);
  const [scanningDlcs, setScanningDlcs] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [rarityOverview, setRarityOverview] = useState<RarityOverview | null>(null);
  const [rarityDraft, setRarityDraft] = useState<RarityWeights>(DEFAULT_WEIGHTS);
  const [cooldownDraft, setCooldownDraft] = useState(60);
  const [savingRarity, setSavingRarity] = useState(false);
  const [rarityMessage, setRarityMessage] = useState("");
  const [redistWorking, setRedistWorking] = useState(false);
  const [redistMsg, setRedistMsg] = useState("");
  const [catalogIssues, setCatalogIssues] = useState<CatalogIssue[]>([]);
  const [issueFilter, setIssueFilter] = useState("ALL");
  const [issueSearch, setIssueSearch] = useState("");
  const [purgingIssues, setPurgingIssues] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    const res = await fetch("/api/admin/games");
    setGames(await res.json());
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    fetch("/api/admin/games/dlc-scan").then((response) => response.json()).then((data) => {
      setDlcScan(data.state);
    }).catch(() => {});
    fetch("/api/admin/games/dlc-scan?scope=targeted").then((response) => response.json()).then((data) => setTargetDlcScan(data.state)).catch(() => {});
    void refreshRarityOverview();
    void refreshCatalogIssues();
  }, []);

  async function refreshRarityOverview() {
    const response = await fetch("/api/admin/rarity-config");
    if (!response.ok) return;
    const data = await response.json() as RarityOverview;
    setRarityOverview(data);
    setRarityDraft(data.weights);
    setCooldownDraft(data.cooldownMinutes);
  }

  async function refreshCatalogIssues() {
    const response = await fetch("/api/admin/catalog-issues");
    if (response.ok) {
      const data = await response.json();
      setCatalogIssues(Array.isArray(data.issues) ? data.issues : []);
    }
  }

  async function redistCatalogRarity() {
    setRedistWorking(true); setRedistMsg("");
    const res = await fetch("/api/admin/consistency", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const data = await res.json();
    setRedistWorking(false);
    if (res.ok) setRedistMsg(`✓ ${data.gamesRarityFixed ?? 0} raretés catalogue · ${data.studiosUpserted ?? 0} studios · ${data.cardsRarityFixed ?? 0} cartes`);
    else setRedistMsg(`Erreur : ${data.error ?? "Inconnu"}`);
  }

  async function saveRaritySettings() {
    const sum = RARITY_ORDER.reduce((total, rarity) => total + (Number(rarityDraft[rarity]) || 0), 0);
    if (Math.abs(sum - 100) > 0.01) {
      setRarityMessage(`La somme est de ${sum.toLocaleString("fr-FR")} % : il faut exactement 100 %.`);
      return;
    }
    setSavingRarity(true);
    setRarityMessage("");
    try {
      const response = await fetch("/api/admin/rarity-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights: rarityDraft, cooldownMinutes: cooldownDraft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Enregistrement impossible.");
      setRarityMessage("Réglages enregistrés. Ils s’appliquent aux prochains boosters uniquement.");
      await refreshRarityOverview();
    } catch (caught) {
      setRarityMessage(caught instanceof Error ? caught.message : "Enregistrement impossible.");
    } finally {
      setSavingRarity(false);
    }
  }

  async function purgeAllCatalogIssues() {
    if (!window.confirm(`Purger définitivement les ${catalogIssues.length} échec(s) mémorisé(s) ? Ils pourront être retentés au prochain scan.`)) return;
    setPurgingIssues(true);
    try {
      const response = await fetch("/api/admin/catalog-issues", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Purge impossible.");
      await refreshCatalogIssues();
      setRepairMessage(`${data.purged ?? 0} échec(s) retiré(s) des archives; ils seront réessayés aux prochains scans.`);
    } catch (caught) {
      setRepairMessage(caught instanceof Error ? caught.message : "Purge impossible.");
    } finally {
      setPurgingIssues(false);
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setAppid("");
    if (query.trim().length < 2) {
      setSuggestions([]);
      setStudioMatches([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const [gamesRes, studiosRes] = await Promise.all([
          fetch(`/api/admin/games/search?q=${encodeURIComponent(query.trim())}`),
          fetch(`/api/admin/studios/search?q=${encodeURIComponent(query.trim())}`),
        ]);
        const gamesData = await gamesRes.json();
        const studiosData = await studiosRes.json();
        setSuggestions(Array.isArray(gamesData) ? gamesData : []);
        setStudioMatches(Array.isArray(studiosData) ? studiosData : []);
        setShowSuggestions(true);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  function pickSuggestion(s: Suggestion) {
    setAppid(String(s.appid));
    setQuery(s.name);
    setShowSuggestions(false);
  }

  async function importGame(e: React.FormEvent) {
    e.preventDefault();
    if (!appid) { setError("Choisis un jeu dans la liste de suggestions."); return; }
    setLoading(true);
    setError("");
    const res = await resilientFetch("/api/admin/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appid, runId: createRunId("manual-import") }),
    });
    if (!res) { setError("Connexion interrompue pendant l’import. Consulte le Journal."); setLoading(false); return; }
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }
    setQuery("");
    setAppid("");
    setLoading(false);
    load();
  }

  async function syncAllStudios(sharedRunId?: string) {
    const runId = sharedRunId ?? createRunId("studio-sync");
    setSyncingStudios(true);
    setSyncMessage("");
    setSyncProgress({ done: 0, total: 0, imported: 0, errors: 0, dlcsChecked: 0, dlcsLinked: 0, dlcsMissing: 0 });

    const listRes = await resilientFetch("/api/admin/studios/sync");
    if (!listRes?.ok) {
      setSyncMessage("Impossible de charger la liste des studios.");
      setSyncingStudios(false);
      return;
    }

    const listData = await listRes.json();
    const queue: string[] = Array.isArray(listData.studios) ? [...listData.studios] : [];
    const known = new Set(queue);
    let imported = 0;
    let errors = 0;
    let dlcsChecked = 0;
    let dlcsLinked = 0;
    let dlcsMissing = 0;

    for (let index = 0; index < queue.length; index += 1) {
      setSyncMessage(`Synchronisation de ${queue[index]}…`);
      const res = await resilientFetch("/api/admin/studios/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: queue[index], runId }),
      });
      if (res?.ok) {
        const data = await res.json();
        imported += data.imported ?? 0;
        errors += Array.isArray(data.errors) ? data.errors.length : 0;
        dlcsChecked += data.dlcsChecked ?? 0;
        dlcsLinked += data.dlcsLinked ?? 0;
        dlcsMissing += data.dlcsMissing ?? 0;
        for (const related of data.relatedStudios ?? []) {
          if (!known.has(related)) {
            known.add(related);
            queue.push(related);
          }
        }
      } else {
        errors += 1;
        setSyncMessage(`${queue[index]} interrompu ou en erreur, passage au studio suivant…`);
      }
      setSyncProgress({ done: index + 1, total: queue.length, imported, errors, dlcsChecked, dlcsLinked, dlcsMissing });
      if (index < queue.length - 1) await new Promise((r) => setTimeout(r, 400));
    }

    setSyncMessage(`Terminé : ${imported} jeu(x) ajouté(s), ${dlcsChecked} DLC vérifié(s), ${dlcsLinked} lien(s) studio réparé(s), ${dlcsMissing} DLC à cataloguer, ${errors} erreur(s).`);
    setSyncingStudios(false);
    load();
  }

  async function fullRepairScan() {
    const runId = createRunId("full-repair");
    setRepairing(true);
    setRepairMessage("Réparation locale (raretés, DLC, images, fiches studio, orphelins)…");
    const res = await resilientFetch("/api/admin/consistency", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId }),
    });
    if (!res?.ok) {
      setRepairMessage("Échec de la réparation locale.");
      setRepairing(false);
      return;
    }
    const data = await res.json();
    setRepairMessage(
      `Local OK : ${data.gamesRarityFixed} rareté(s) catalogue corrigée(s), ${data.cardsRarityFixed ?? 0} carte(s) réalignée(s), ${data.dlcsScanned ?? 0} DLC vérifié(s), ${data.dlcStudiosLinked ?? 0} lien(s) studio DLC réparé(s), ${data.dlcsWithoutStudio ?? 0} DLC sans studio, ${data.dlcDefenseFixed ?? 0} DEF DLC corrigée(s), ${data.dlcImagesRestored ?? 0} image(s) DLC restaurée(s), ${data.studiosUpserted} studio(s) recalculé(s), ` +
      `${data.orphanStudiosRemoved} orphelin(s) supprimé(s). Recherche des jeux manquants sur Steam (peut prendre plusieurs minutes)…`
    );
    load();
    await syncAllStudios(runId);
    setRepairMessage("Vérification des DLC de tout le catalogue…");
    const dlcResult = await scanDlcs({ scope: "catalog", runId });
    setRepairMessage(dlcResult?.done ? "Contrôle terminé : jeux, studios, liens DLC et raretés vérifiés." : "Contrôle local terminé; scan DLC incomplet, tu peux le reprendre dans l’onglet Imports.");
    setRepairing(false);
  }

  async function scanDlcs(options: { scope?: "catalog" | "targeted"; parentGameIds?: string[]; runId?: string } = {}) {
    const scope = options.scope ?? "catalog";
    const usesTargetState = scope === "targeted";
    setScanningDlcs(true);
    setCancelRequested(false);
    let state = usesTargetState ? targetDlcScan : dlcScan;
    const runId = options.runId ?? state?.runId ?? createRunId(usesTargetState ? "dlc-import" : "dlc-catalog");
    let firstRequest = true;
    try {
      do {
        const response = await resilientFetch("/api/admin/games/dlc-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId,
            scope,
            ...(firstRequest && options.parentGameIds ? { parentGameIds: options.parentGameIds } : {}),
            restart: firstRequest && options.parentGameIds ? true : state?.done === true,
          }),
        });
        const payload = await response?.json().catch(() => null);
        if (!response?.ok) {
          if (payload && typeof payload === "object") {
            state = payload as DlcScanState;
            if (usesTargetState) setTargetDlcScan(state); else setDlcScan(state);
          }
          throw new Error(payload?.retryable
            ? `Steam limite les requêtes. Le curseur est conservé sur ${payload.current ?? "le contenu en cours"}; attends un peu puis reprends le scan.`
            : payload?.error ?? "Connexion ou synchronisation interrompue; le curseur est conservé pour reprendre.");
        }
        state = payload as DlcScanState;
        firstRequest = false;
        if (usesTargetState) setTargetDlcScan(state); else setDlcScan(state);
      } while (state && !state.done);
      await Promise.all([load(), refreshCatalogIssues(), refreshRarityOverview()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scan DLC interrompu; tu peux le reprendre.");
    } finally {
      setScanningDlcs(false);
      setCancelRequested(false);
    }
    return state ?? null;
  }

  async function interruptDlcScan(deferUntilBatchEnds: boolean, scope: "catalog" | "targeted" = "catalog") {
    setCancelRequested(true);
    setError("");
    try {
      const response = await resilientFetch("/api/admin/games/dlc-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancel: true, defer: deferUntilBatchEnds, scope }),
      });
      const data = await response?.json().catch(() => null);
      if (!response?.ok || !data) throw new Error("Impossible de demander l’arrêt du scan.");
      if (data.state) scope === "targeted" ? setTargetDlcScan(data.state as DlcScanState) : setDlcScan(data.state as DlcScanState);
      if (data.done) {
        scope === "targeted" ? setTargetDlcScan(data as DlcScanState) : setDlcScan(data as DlcScanState);
        load();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible d’interrompre le scan DLC.");
      setCancelRequested(false);
    } finally {
      if (!deferUntilBatchEnds) setCancelRequested(false);
    }
  }

  async function addTwentyNewGames() {
    const runId = createRunId("catalog-extension");
    setSeeding(true);
    setSeedMessage("Recherche de jeux absents du catalogue…");
    setSeedProgress({ base: 0, studiosDone: 0, studiosTotal: 0, errors: 0 });

    const [beforeGamesRes, beforeStudiosRes, discoveryRes] = await Promise.all([
      resilientFetch("/api/admin/games"),
      resilientFetch("/api/admin/studios/sync"),
      resilientFetch(`/api/admin/games/discover?runId=${encodeURIComponent(runId)}`),
    ]);
    if (!beforeGamesRes?.ok || !beforeStudiosRes?.ok || !discoveryRes?.ok) {
      const errorData = await discoveryRes?.json().catch(() => ({})) ?? {};
      setSeedMessage(errorData.error ?? "Impossible de préparer l’import automatique.");
      setSeeding(false);
      return;
    }

    const beforeGames: Game[] = await beforeGamesRes.json();
    const beforeStudiosData = await beforeStudiosRes.json();
    const discoveryData = await discoveryRes.json();
    const candidates: string[] = Array.isArray(discoveryData.appids) ? discoveryData.appids : [];
    const studioQueue: string[] = [];
    const knownStudios = new Set<string>();
    let base = 0;
    let errors = 0;

    for (const candidate of candidates) {
      if (base >= 20) break;
      setSeedMessage(`Import du jeu inédit ${base + 1}/20…`);
      const response = await resilientFetch("/api/admin/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appid: candidate, runId, skipRecalc: true }),
      });
      if (!response?.ok) {
        errors += 1;
        setSeedProgress((current) => ({ ...current, errors }));
        continue;
      }
      const game: Game = await response.json();
      base += 1;
      for (const developer of game.developers) {
        if (!knownStudios.has(developer)) {
          knownStudios.add(developer);
          studioQueue.push(developer);
        }
      }
      setSeedProgress({ base, studiosDone: 0, studiosTotal: studioQueue.length, errors });
    }

    if (base === 0) {
      setSeedMessage(`Import incomplet : ${base}/20 jeux ajoutés. ${errors} candidat(s) refusé(s) par Steam.`);
      setSeeding(false);
      load();
      return;
    }

    if (base < 20) setSeedMessage(`Import partiel : ${base}/20 jeux initiaux ajoutés. Je complète quand même leurs studios, jeux liés et DLC…`);

    setSeedMessage("Recalcul de la rareté du catalogue…");
    await resilientFetch("/api/admin/consistency", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId }),
    });

    for (let index = 0; index < studioQueue.length; index += 1) {
      setSeedMessage(`Complétion du studio ${studioQueue[index]}…`);
      const studioSignal = AbortSignal.timeout(180_000);
      const response = await resilientFetch("/api/admin/studios/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: studioQueue[index], runId, skipRecalc: true }),
        signal: studioSignal,
      });
      if (response?.ok) {
        const data = await response.json();
        errors += Array.isArray(data.errors) ? data.errors.length : 0;
        for (const related of data.relatedStudios ?? []) {
          if (!knownStudios.has(related)) {
            knownStudios.add(related);
            studioQueue.push(related);
          }
        }
      } else {
        errors += 1;
      }
      setSeedProgress({ base, studiosDone: index + 1, studiosTotal: studioQueue.length, errors });
    }

    setSeedMessage("Recalcul final des raretés…");
    await resilientFetch("/api/admin/consistency", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId }),
    });

    const [afterGamesRes, afterStudiosRes] = await Promise.all([
      resilientFetch("/api/admin/games"),
      resilientFetch("/api/admin/studios/sync"),
    ]);
    if (!afterGamesRes?.ok || !afterStudiosRes?.ok) {
      setSeedMessage(`Import terminé, mais le décompte final n’a pas pu être chargé. ${errors} erreur(s).`);
      setSeeding(false);
      load();
      return;
    }
    const afterGames: Game[] = await afterGamesRes.json();
    const afterStudiosData = await afterStudiosRes.json();
    const newGames = Math.max(0, afterGames.length - beforeGames.length);
    const associatedGames = Math.max(0, newGames - base);
    const knownGameIds = new Set(beforeGames.map((game) => game.id));
    const importedGameIds = afterGames.filter((game) => !knownGameIds.has(game.id) && game.contentType === "GAME").map((game) => game.id);
    const beforeStudioCount = Array.isArray(beforeStudiosData.studios) ? beforeStudiosData.studios.length : 0;
    const afterStudioCount = Array.isArray(afterStudiosData.studios) ? afterStudiosData.studios.length : 0;
    const newStudios = Math.max(0, afterStudioCount - beforeStudioCount);
    setSeedMessage(`Jeux et studios liés terminés. Recherche des DLC pour ${importedGameIds.length} jeu(x)…`);
    const dlcResult = importedGameIds.length ? await scanDlcs({ scope: "targeted", parentGameIds: importedGameIds, runId }) : null;
    const newDlcCount = dlcResult?.imported ?? 0;
    const totalCards = newGames + newStudios + newDlcCount;

    setSeedMessage(
      `${dlcResult?.done === false ? "Import interrompu; reprise DLC disponible. " : "Import complet terminé. "}${base} jeux initiaux + ${associatedGames} jeux associés + ${newStudios} studios + ${newDlcCount} DLC = ${totalCards} nouvelles cartes. ${errors} erreur(s).`
    );
    setSeeding(false);
    load();
  }

  const visibleIssues = catalogIssues.filter((issue) => {
    if (issueFilter !== "ALL" && issue.scope !== issueFilter) return false;
    const queryText = issueSearch.trim().toLocaleLowerCase("fr");
    return !queryText || `${issue.name} ${issue.itemId} ${issue.reason} ${issue.parentId ?? ""}`.toLocaleLowerCase("fr").includes(queryText);
  });

  const currentWeightTotal = RARITY_ORDER.reduce((sum, rarity) => sum + (Number(rarityDraft[rarity]) || 0), 0);
  const rarityDraftChanged = !rarityOverview || RARITY_ORDER.some((rarity) => rarityDraft[rarity] !== rarityOverview.weights[rarity]) || cooldownDraft !== rarityOverview.cooldownMinutes;

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Gestion du catalogue</h1>
      <p className="mb-5 text-sm text-gray-500">Import, cohérence des fiches et paramètres des boosters au même endroit.</p>
      <nav className="mb-6 flex flex-wrap gap-2 rounded-xl border border-gray-800 bg-gray-900/70 p-2" aria-label="Outils du catalogue">
        {(["import", "coherence", "distribution"] as const).map((key) => {
          const labels = { import: "⬇ Importer", coherence: "⚙ Cohérence", distribution: "✦ Répartition & délais" };
          return <button key={key} type="button" onClick={() => setSection(key)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${section === key ? "border border-amber-700 bg-amber-950/70 text-amber-200 shadow-[inset_0_1px_0_rgba(251,191,36,.1)]" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}>{labels[key]}</button>;
        })}
      </nav>

      {section === "import" && <>

      <form onSubmit={importGame} className="flex gap-2 mb-8 max-w-md relative">
        <div className="flex-1 relative">
          <input
            required
            placeholder="Nom du jeu (ex: Half-Life)…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setAppid(""); }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          />
          {showSuggestions && (searching || suggestions.length > 0) && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl max-h-80 overflow-y-auto">
              {searching && <div className="px-4 py-2 text-gray-500 text-sm">Recherche…</div>}
              {!searching && suggestions.map((s) => (
                <button
                  type="button"
                  key={s.appid}
                  onMouseDown={() => pickSuggestion(s)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-700 text-left"
                >
                  <img src={s.tinyImage} alt="" className="w-10 h-6 object-cover rounded" />
                  <span className="text-white text-sm truncate">{s.name}</span>
                  <span className="text-gray-500 text-xs ml-auto">#{s.appid}</span>
                </button>
              ))}
              {!searching && suggestions.length === 0 && (
                <div className="px-4 py-2 text-gray-500 text-sm">Aucun résultat sur le catalogue Steam.</div>
              )}
              {!searching && studioMatches.length > 0 && (
                <div className="border-t border-gray-700">
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-500 bg-gray-900">
                    Studios déjà en base (non importables ici)
                  </div>
                  {studioMatches.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-3 py-2 text-gray-300 text-sm">
                      <span>🏢</span>
                      <span className="truncate">{s.name}</span>
                      <span className="text-gray-500 text-xs ml-auto">{s.gameCount} jeu(x)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={loading || !appid}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {loading ? "Import…" : "Importer"}
        </button>
      </form>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-white font-semibold">Import complet · jeux, studios et DLC</h2>
            <p className="text-gray-500 text-xs mt-1">Ajoute 20 jeux absents, crée leurs studios, complète le catalogue de ces studios puis scanne les DLC de tous les jeux nouvellement ajoutés.</p>
          </div>
          <button
            type="button"
            onClick={addTwentyNewGames}
            disabled={seeding || syncingStudios}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
          >
            {seeding ? "Import complet en cours…" : "Lancer l’import complet · 20 jeux"}
          </button>
        </div>
        {(seeding || seedMessage) && (
          <div className="mt-3 text-xs">
            <p className="text-gray-400">{seedMessage}</p>
            <p className="text-gray-600 mt-1">
              Jeux initiaux : {seedProgress.base}/20 · Studios : {seedProgress.studiosDone}/{seedProgress.studiosTotal} · Erreurs : {seedProgress.errors}
            </p>
          </div>
        )}
        {targetDlcScan && !targetDlcScan.done && !seeding && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-900/60 bg-amber-950/20 p-3">
            <p className="text-xs text-amber-100/80">Import DLC interrompu : {targetDlcScan.scannedGames}/{targetDlcScan.total} jeux vérifiés · {targetDlcScan.imported} DLC ajoutés.</p>
            <button type="button" onClick={() => void scanDlcs({ scope: "targeted" })} disabled={scanningDlcs} className="rounded-lg border border-amber-700 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-900/40 disabled:opacity-50">Reprendre les DLC de cet import</button>
          </div>
        )}
      </div>

      {seeding && <div className="mb-4 max-w-2xl rounded-lg border border-gray-800 bg-gray-900 p-3">
        <div className="h-2 overflow-hidden rounded-full bg-gray-800"><div className="h-full bg-gradient-to-r from-red-800 via-amber-600 to-amber-200 transition-all" style={{ width: `${Math.min(100, Math.max(5, (seedProgress.base / 20) * 35 + (seedProgress.studiosTotal ? seedProgress.studiosDone / seedProgress.studiosTotal * 35 : 0) + (targetDlcScan ? targetDlcScan.scannedGames / Math.max(1, targetDlcScan.total) * 30 : 0)))}%` }} /></div>
        <p className="mt-2 text-xs text-gray-400">{seedMessage}</p>
      </div>}

      <details className="mb-5 max-w-6xl rounded-xl border border-gray-800 bg-gray-900/40 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-300">Actions Steam séparées (imports et synchronisations externes)</summary>
        <p className="mt-2 text-xs text-gray-500">Ces outils consultent Steam et ne font pas partie du scan SQL de cohérence.</p>

      <div className="bg-gray-900 border border-amber-900 rounded-xl p-4 mb-4 max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-white font-semibold">Réparation étendue avec synchronisation Steam</h2>
            <p className="text-gray-500 text-xs mt-1">
              Cette action complète le contrôle local par des appels Steam, importe des fiches et peut durer plusieurs minutes. Pour les liens locaux seuls, utilise le bouton au-dessus.
            </p>
          </div>
          <button
            type="button"
            onClick={fullRepairScan}
            disabled={repairing || syncingStudios || seeding}
            className="bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
          >
            {repairing ? "Scan en cours…" : "Scanner & réparer"}
          </button>
        </div>
        {repairMessage && <p className="text-gray-400 text-xs mt-3">{repairMessage}</p>}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-white font-semibold">Scanner les DLC et extensions</h2>
            <p className="text-gray-500 text-xs mt-1">Action ciblée de rattrapage : vérifie le catalogue entier par lots reprenables, importe les DLC valides et conserve le curseur en cas d’interruption.</p>
          </div>
          <button type="button" onClick={() => scanningDlcs ? void interruptDlcScan(true) : void scanDlcs()} disabled={cancelRequested || (!scanningDlcs && (syncingStudios || seeding || repairing))} className="bg-red-800 hover:bg-red-700 text-white font-semibold rounded-lg px-4 py-2 disabled:opacity-50">
            {scanningDlcs ? cancelRequested ? "Arrêt demandé…" : "Interrompre et valider" : dlcScan && !dlcScan.done ? "Reprendre le scan DLC" : "Scanner tout le catalogue"}
          </button>
        </div>
        {dlcScan && <p className="text-gray-400 text-xs mt-3">{scanningDlcs ? cancelRequested ? "Arrêt après le lot en cours, puis recalcul et validation… " : `Analyse de ${dlcScan.current ?? "Steam"}… ` : dlcScan.cancelled ? "Scan interrompu · données intégrées et raretés recalculées · " : dlcScan.done ? "Scan terminé · " : "Reprise disponible · "}{dlcScan.scannedGames}/{dlcScan.total} jeux · {dlcScan.imported} DLC créés · {dlcScan.rejected} refusés · {dlcScan.errors} erreurs</p>}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-8 max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-white font-semibold">Catalogue complet des studios</h2>
            <p className="text-gray-500 text-xs mt-1">
              Recherche tous leurs jeux officiels Steam et crée les fiches Jeu manquantes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void syncAllStudios()}
            disabled={syncingStudios || seeding}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
          >
            {syncingStudios ? "Synchronisation…" : "Synchroniser tous les studios"}
          </button>
        </div>
        {(syncingStudios || syncMessage) && (
          <div className="mt-3">
            <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full bg-red-700 transition-all"
                style={{ width: `${syncProgress.total > 0 ? (syncProgress.done / syncProgress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-gray-400 text-xs mt-2">{syncMessage}</p>
            {syncProgress.total > 0 && (
              <p className="text-gray-600 text-[11px] mt-1">
                {syncProgress.done}/{syncProgress.total} studios · {syncProgress.imported} jeux ajoutés · {syncProgress.dlcsChecked} DLC vérifiés · {syncProgress.dlcsLinked} liens studio réparés · {syncProgress.dlcsMissing} DLC à cataloguer · {syncProgress.errors} erreurs
              </p>
            )}
          </div>
        )}
      </div>

      <section className="max-w-4xl overflow-hidden rounded-xl border border-amber-900/60 bg-gray-900/80">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-4 py-3">
          <div><h2 className="font-semibold text-white">Échecs et liens à revoir <span className="ml-1 rounded-full bg-red-950 px-2 py-0.5 text-xs text-red-300">{catalogIssues.length}</span></h2><p className="mt-1 text-xs text-gray-500">Les erreurs temporaires restent reprenables; les AppID et anomalies persistantes sont mémorisés ici.</p></div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void refreshCatalogIssues()} className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:bg-gray-800">↻ Actualiser</button>
            <button type="button" onClick={() => void purgeAllCatalogIssues()} disabled={purgingIssues || catalogIssues.length === 0} className="rounded-lg border border-red-900 px-3 py-2 text-xs text-red-200 hover:bg-red-950 disabled:opacity-40">{purgingIssues ? "Purge…" : "Purger les archives"}</button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-[180px_1fr]">
          <select value={issueFilter} onChange={(event) => setIssueFilter(event.target.value)} className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"><option value="ALL">Tous les types</option><option value="GAME">Jeux</option><option value="DLC">DLC</option><option value="STUDIO">Studios</option><option value="LINK">Liens</option></select>
          <input value={issueSearch} onChange={(event) => setIssueSearch(event.target.value)} placeholder="Filtrer par nom, AppID ou raison…" className="min-w-0 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white" />
        </div>
        <div className="max-h-80 overflow-auto border-t border-gray-800">
          {visibleIssues.length ? <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-gray-950 text-gray-500"><tr><th className="px-3 py-2">Type / cible</th><th className="px-3 py-2">Motif mémorisé</th><th className="px-3 py-2">Tentatives</th><th className="px-3 py-2">Dernière détection</th></tr></thead><tbody>{visibleIssues.map((issue) => <tr key={`${issue.scope}:${issue.itemId}`} className="border-t border-gray-800"><td className="px-3 py-2 text-amber-200">{issue.scope} · {issue.name}<span className="block font-mono text-gray-600">{issue.itemId}{issue.parentId ? ` ← ${issue.parentId}` : ""}</span></td><td className="max-w-md px-3 py-2 text-gray-300">{issue.reason}</td><td className="px-3 py-2 text-gray-400">{issue.attempts}</td><td className="whitespace-nowrap px-3 py-2 text-gray-500">{new Date(issue.lastSeen).toLocaleString("fr-FR")}</td></tr>)}</tbody></table> : <p className="p-5 text-center text-sm text-gray-500">Aucun échec ou lien non résolu mémorisé.</p>}
        </div>
      </section>
      </details>

      <div className="flex flex-wrap gap-6">
        {games.map((g) => (
          <GameCard key={g.id} id={g.id} name={g.name} headerImage={g.headerImage} description={g.description}
            atk={g.atk} def={g.def} rarity={g.rarity} tags={g.tags} developers={g.developers} reviewScore={g.reviewScore}
            peakCcu={g.peakCcu} ownerEstimate={g.ownerEstimate} priceCents={g.priceCents} isFree={g.isFree} contentType={g.contentType} />
        ))}
      </div>
      </>}

      {section === "coherence" && <CoherencePanel externalBusy={loading || seeding || scanningDlcs || syncingStudios || repairing} />}

      {section === "distribution" && <section className="max-w-5xl space-y-5">
        <div className="rounded-xl border border-amber-900/60 bg-gradient-to-br from-gray-900 via-gray-900 to-amber-950/20 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-white">Table des taux d’attribution</h2><p className="mt-1 text-sm text-gray-500">Répartition des futurs tirages; les cartes déjà obtenues ne changent pas.</p></div><div className={`rounded-lg border px-3 py-2 font-mono text-sm ${Math.abs(currentWeightTotal - 100) <= 0.01 ? "border-emerald-800 text-emerald-300" : "border-red-800 text-red-300"}`}>Total {currentWeightTotal.toLocaleString("fr-FR")} %</div></div>
          <div className="mt-5 overflow-x-auto rounded-lg border border-gray-800"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-gray-950/70 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-3 py-3">Rareté</th><th className="px-3 py-3">Taux cible</th><th className="px-3 py-3">Aperçu / 1 000</th><th className="px-3 py-3">Exemplaires détenus</th><th className="px-3 py-3">Rareté catalogue</th></tr></thead><tbody>{RARITY_ORDER.map((rarity) => { const weight = rarityDraft[rarity]; const instanceCount = rarityOverview?.instances[rarity] ?? 0; const catalogCount = rarityOverview?.catalog[rarity] ?? 0; return <tr key={rarity} className="border-t border-gray-800"><td className="px-3 py-3 font-semibold text-gray-200">{RARITY_NAMES[rarity]}</td><td className="px-3 py-3"><div className="flex items-center gap-2"><input type="number" min="0" max="100" step="0.1" value={weight} onChange={(event) => setRarityDraft((current) => ({ ...current, [rarity]: Number(event.target.value) }))} className="w-24 rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-right font-mono text-white" /><span className="text-gray-500">%</span></div></td><td className="px-3 py-3 font-mono text-amber-200">{Math.round(weight * 10).toLocaleString("fr-FR")}</td><td className="px-3 py-3"><strong className="text-white">{instanceCount.toLocaleString("fr-FR")}</strong><span className="ml-2 text-gray-500">{rarityOverview?.instanceTotal ? `${(instanceCount / rarityOverview.instanceTotal * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—"}</span></td><td className="px-3 py-3"><strong className="text-white">{catalogCount.toLocaleString("fr-FR")}</strong><span className="ml-2 text-gray-500">{rarityOverview?.catalogTotal ? `${(catalogCount / rarityOverview.catalogTotal * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—"}</span></td></tr>; })}</tbody></table></div>
          <div className="mt-4"><div className="mb-1 flex justify-between text-xs text-gray-500"><span>Aperçu des taux en direct</span><span>{currentWeightTotal.toLocaleString("fr-FR")} %</span></div><div className="flex h-3 overflow-hidden rounded-full bg-gray-800">{RARITY_ORDER.map((rarity) => <div key={rarity} title={`${RARITY_NAMES[rarity]} : ${rarityDraft[rarity]} %`} style={{ width: `${Math.max(0, rarityDraft[rarity])}%` }} className={`${rarity === "LEGENDARY" ? "bg-orange-500" : rarity === "EPIC" ? "bg-purple-500" : rarity === "RARE" ? "bg-blue-500" : rarity === "UNCOMMON" ? "bg-green-500" : "bg-gray-300"} transition-all`} />)}</div></div>
          <p className="mt-3 text-xs text-gray-500">Les plafonds par titre et l’éligibilité aux raretés supérieures peuvent faire différer le résultat réel des chances affichées.</p>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-white">Renouvellement du booster gratuit</h2><p className="mt-1 text-sm text-gray-500">Les paquets non ouverts s’accumulent, jusqu’à cinq. Le réglage agit sur les prochaines échéances.</p></div><div className="rounded-lg border border-amber-800/70 bg-amber-950/30 px-4 py-2 text-right"><span className="block text-[10px] uppercase tracking-wider text-gray-500">Délai choisi</span><strong className="font-mono text-lg text-amber-200">{formatCooldown(cooldownDraft)}</strong></div></div>
          <input aria-label="Délai de renouvellement en minutes" type="range" min="1" max="360" step="1" value={cooldownDraft} onChange={(event) => setCooldownDraft(Number(event.target.value))} className="mt-6 w-full accent-amber-500" />
          <div className="mt-1 flex justify-between text-[10px] text-gray-600"><span>1 min</span><span>3 h</span><span>6 h</span></div>
          <div className="mt-4 flex flex-wrap gap-2">{[1, 15, 30, 60, 180, 360].map((minutes) => <button key={minutes} type="button" onClick={() => setCooldownDraft(minutes)} aria-pressed={cooldownDraft === minutes} className={`rounded-lg border px-3 py-1.5 text-xs transition ${cooldownDraft === minutes ? "border-amber-500 bg-amber-950/60 text-amber-100" : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white"}`}>{formatCooldown(minutes)}</button>)}</div>
        </div>

        <div className="rounded-xl border border-purple-900/60 bg-gray-900 p-5">
          <h2 className="text-lg font-semibold text-white mb-1">Redistribution des raretés catalogue</h2>
          <p className="text-gray-500 text-xs mb-3">Recalcule les raretés de TOUS les jeux, DLC et studios selon leur popularité (ownerEstimate). Ne modifie pas les cartes déjà obtenues.</p>
          <button type="button" onClick={() => void redistCatalogRarity()} disabled={redistWorking}
            className="rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white font-semibold px-5 py-2.5 transition">
            {redistWorking ? "Recalcul en cours…" : "⚙ Recalculer toutes les raretés catalogue"}
          </button>
          {redistMsg && <p className={`text-sm mt-2 ${redistMsg.startsWith("✓") ? "text-emerald-300" : "text-red-400"}`}>{redistMsg}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => void saveRaritySettings()} disabled={savingRarity || !rarityDraftChanged || Math.abs(currentWeightTotal - 100) > 0.01} className="rounded-lg bg-gradient-to-b from-red-600 to-red-800 px-5 py-2.5 font-semibold text-white shadow-lg shadow-red-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{savingRarity ? "Enregistrement…" : "Enregistrer les réglages"}</button><button type="button" onClick={() => { setRarityDraft(DEFAULT_WEIGHTS); setCooldownDraft(60); }} className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800">Valeurs par défaut</button>{rarityMessage && <p className={`text-sm ${rarityMessage.startsWith("Réglages") ? "text-emerald-300" : "text-amber-200"}`}>{rarityMessage}</p>}</div>
      </section>}

    </div>
  );
}
