"use client";
import { useEffect, useRef, useState } from "react";
import { GameCard } from "@/components/GameCard";

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
};

type Suggestion = { appid: number; name: string; tinyImage: string };
type StudioMatch = { id: string; name: string; gameCount: number };
type ImportGameDetail = {
  id: string;
  name: string;
  headerImage: string;
  def: number;
  rarity: string;
  developers: string[];
  sourceStudio?: string;
};
type SeedReport = {
  initialGames: ImportGameDetail[];
  associatedGames: ImportGameDetail[];
  createdStudios: string[];
  totalCards: number;
  errors: string[];
};
const RARITY_NAME: Record<string, string> = {
  COMMON: "Commune",
  UNCOMMON: "Peu commune",
  RARE: "Rare",
  EPIC: "Épique",
  LEGENDARY: "Légendaire",
};

export default function AdminGamesPage() {
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
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0, imported: 0, errors: 0 });
  const [syncMessage, setSyncMessage] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState("");
  const [seedProgress, setSeedProgress] = useState({ base: 0, studiosDone: 0, studiosTotal: 0, errors: 0 });
  const [seedReport, setSeedReport] = useState<SeedReport | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    const res = await fetch("/api/admin/games");
    setGames(await res.json());
  }

  useEffect(() => { load(); }, []);

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
    const res = await fetch("/api/admin/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appid }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }
    setQuery("");
    setAppid("");
    setLoading(false);
    load();
  }

  async function syncAllStudios() {
    setSyncingStudios(true);
    setSyncMessage("");
    setSyncProgress({ done: 0, total: 0, imported: 0, errors: 0 });

    const listRes = await fetch("/api/admin/studios/sync");
    if (!listRes.ok) {
      setSyncMessage("Impossible de charger la liste des studios.");
      setSyncingStudios(false);
      return;
    }

    const listData = await listRes.json();
    const queue: string[] = Array.isArray(listData.studios) ? [...listData.studios] : [];
    const known = new Set(queue);
    let imported = 0;
    let errors = 0;

    for (let index = 0; index < queue.length; index += 1) {
      setSyncMessage(`Synchronisation de ${queue[index]}…`);
      const res = await fetch("/api/admin/studios/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: queue[index] }),
      });
      if (res.ok) {
        const data = await res.json();
        imported += data.imported ?? 0;
        errors += Array.isArray(data.errors) ? data.errors.length : 0;
        for (const related of data.relatedStudios ?? []) {
          if (!known.has(related)) {
            known.add(related);
            queue.push(related);
          }
        }
      } else {
        errors += 1;
      }
      setSyncProgress({ done: index + 1, total: queue.length, imported, errors });
    }

    setSyncMessage(`Terminé : ${imported} jeu(x) Steam ajouté(s), ${errors} erreur(s).`);
    setSyncingStudios(false);
    load();
  }

  async function addTwentyNewGames() {
    setSeeding(true);
    setSeedMessage("Recherche de jeux absents du catalogue…");
    setSeedProgress({ base: 0, studiosDone: 0, studiosTotal: 0, errors: 0 });
    setSeedReport(null);

    const [beforeGamesRes, beforeStudiosRes, discoveryRes] = await Promise.all([
      fetch("/api/admin/games"),
      fetch("/api/admin/studios/sync"),
      fetch("/api/admin/games/discover"),
    ]);
    if (!beforeGamesRes.ok || !beforeStudiosRes.ok || !discoveryRes.ok) {
      const errorData = await discoveryRes.json().catch(() => ({}));
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
    const initialGames: ImportGameDetail[] = [];
    const associatedGameDetails = new Map<string, ImportGameDetail>();
    const errorDetails: string[] = [];
    let base = 0;
    let errors = 0;

    for (const candidate of candidates) {
      if (base >= 20) break;
      setSeedMessage(`Import du jeu inédit ${base + 1}/20…`);
      const response = await fetch("/api/admin/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appid: candidate }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        errors += 1;
        errorDetails.push(`#${candidate} : ${failure.error ?? "import refusé"}`);
        setSeedProgress((current) => ({ ...current, errors }));
        continue;
      }
      const game: Game = await response.json();
      initialGames.push({
        id: game.id,
        name: game.name,
        headerImage: game.headerImage,
        def: game.def,
        rarity: game.rarity,
        developers: game.developers,
      });
      base += 1;
      for (const developer of game.developers) {
        if (!knownStudios.has(developer)) {
          knownStudios.add(developer);
          studioQueue.push(developer);
        }
      }
      setSeedProgress({ base, studiosDone: 0, studiosTotal: studioQueue.length, errors });
    }

    if (base < 20) {
      setSeedMessage(`Import incomplet : ${base}/20 jeux ajoutés. ${errors} candidat(s) refusé(s) par Steam.`);
      setSeedReport({ initialGames, associatedGames: [], createdStudios: [], totalCards: base, errors: errorDetails });
      setSeeding(false);
      load();
      return;
    }

    for (let index = 0; index < studioQueue.length; index += 1) {
      setSeedMessage(`Complétion du studio ${studioQueue[index]}…`);
      const response = await fetch("/api/admin/studios/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: studioQueue[index] }),
      });
      if (response.ok) {
        const data = await response.json();
        errors += Array.isArray(data.errors) ? data.errors.length : 0;
        for (const game of data.importedGames ?? []) {
          associatedGameDetails.set(game.id, {
            ...game,
            developers: [],
            sourceStudio: studioQueue[index],
          });
        }
        for (const failure of data.errors ?? []) {
          errorDetails.push(`${studioQueue[index]} · #${failure.appid} : ${failure.error}`);
        }
        for (const related of data.relatedStudios ?? []) {
          if (!knownStudios.has(related)) {
            knownStudios.add(related);
            studioQueue.push(related);
          }
        }
      } else {
        errors += 1;
        const failure = await response.json().catch(() => ({}));
        errorDetails.push(`${studioQueue[index]} : ${failure.error ?? "synchronisation impossible"}`);
      }
      setSeedProgress({ base, studiosDone: index + 1, studiosTotal: studioQueue.length, errors });
    }

    const [afterGamesRes, afterStudiosRes] = await Promise.all([
      fetch("/api/admin/games"),
      fetch("/api/admin/studios/sync"),
    ]);
    if (!afterGamesRes.ok || !afterStudiosRes.ok) {
      setSeedMessage(`Import terminé, mais le décompte final n’a pas pu être chargé. ${errors} erreur(s).`);
      setSeeding(false);
      load();
      return;
    }
    const afterGames: Game[] = await afterGamesRes.json();
    const afterStudiosData = await afterStudiosRes.json();
    const newGames = Math.max(0, afterGames.length - beforeGames.length);
    const associatedGameCount = Math.max(0, newGames - base);
    const beforeStudioCount = Array.isArray(beforeStudiosData.studios) ? beforeStudiosData.studios.length : 0;
    const afterStudioCount = Array.isArray(afterStudiosData.studios) ? afterStudiosData.studios.length : 0;
    const newStudios = Math.max(0, afterStudioCount - beforeStudioCount);
    const totalCards = newGames + newStudios;
    const beforeStudioNames = new Set<string>(Array.isArray(beforeStudiosData.studios) ? beforeStudiosData.studios : []);
    const createdStudios = (Array.isArray(afterStudiosData.studios) ? afterStudiosData.studios : [])
      .filter((studio: string) => !beforeStudioNames.has(studio));

    setSeedMessage(
      `Terminé : ${base} jeux inédits + ${associatedGameCount} jeux associés + ${newStudios} studios = ${totalCards} nouvelles cartes. ${errors} erreur(s).`
    );
    setSeedReport({
      initialGames,
      associatedGames: Array.from(associatedGameDetails.values()),
      createdStudios,
      totalCards,
      errors: errorDetails,
    });
    setSeeding(false);
    load();
  }

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Import de jeux Steam</h1>

      <form onSubmit={importGame} className="flex gap-2 mb-8 max-w-md relative">
        <div className="flex-1 relative">
          <input
            required
            placeholder="Nom du jeu (ex: Half-Life)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
            <h2 className="text-white font-semibold">Extension automatique du catalogue</h2>
            <p className="text-gray-500 text-xs mt-1">
              Ajoute 20 jeux Steam absents, leurs studios, puis tous les jeux manquants de ces studios.
            </p>
          </div>
          <button
            type="button"
            onClick={addTwentyNewGames}
            disabled={seeding || syncingStudios}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
          >
            {seeding ? "Ajout en cours…" : "Ajouter 20 jeux inédits"}
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
        {seedReport && (
          <div className="steam-import-report">
            <div className="steam-import-summary">
              <span><strong>{seedReport.initialGames.length}</strong> jeux initiaux</span>
              <span><strong>{seedReport.associatedGames.length}</strong> jeux des studios</span>
              <span><strong>{seedReport.createdStudios.length}</strong> studios créés</span>
              <span><strong>{seedReport.totalCards}</strong> cartes au total</span>
            </div>

            <details open>
              <summary>Jeux importés directement ({seedReport.initialGames.length})</summary>
              <div className="steam-import-game-list">
                {seedReport.initialGames.map((game) => (
                  <div key={game.id} className="steam-import-game">
                    <img src={game.headerImage} alt="" />
                    <span className="min-w-0">
                      <strong>{game.name}</strong>
                      <small>DEF {game.def.toLocaleString("fr-FR")} · {RARITY_NAME[game.rarity] ?? game.rarity}</small>
                      <small>{game.developers.join(" · ")}</small>
                    </span>
                  </div>
                ))}
              </div>
            </details>

            <details>
              <summary>Studios nouvellement liés ({seedReport.createdStudios.length})</summary>
              <div className="steam-import-studios">
                {seedReport.createdStudios.map((studio) => <span key={studio}>⚙ {studio}</span>)}
                {seedReport.createdStudios.length === 0 && <p>Aucun nouveau studio.</p>}
              </div>
            </details>

            <details>
              <summary>Cartes Jeu recréées depuis les studios ({seedReport.associatedGames.length})</summary>
              <div className="steam-import-game-list">
                {seedReport.associatedGames.map((game) => (
                  <div key={game.id} className="steam-import-game">
                    <img src={game.headerImage} alt="" />
                    <span className="min-w-0">
                      <strong>{game.name}</strong>
                      <small>via {game.sourceStudio} · DEF {game.def.toLocaleString("fr-FR")}</small>
                      <small>{RARITY_NAME[game.rarity] ?? game.rarity}</small>
                    </span>
                  </div>
                ))}
                {seedReport.associatedGames.length === 0 && <p>Aucune carte supplémentaire.</p>}
              </div>
            </details>

            {seedReport.errors.length > 0 && (
              <details>
                <summary>Imports refusés ({seedReport.errors.length})</summary>
                <ul className="steam-import-errors">
                  {seedReport.errors.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
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
            onClick={syncAllStudios}
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
                {syncProgress.done}/{syncProgress.total} studios · {syncProgress.imported} jeux ajoutés · {syncProgress.errors} erreurs
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-6">
        {games.map((g) => (
          <GameCard
            key={g.id}
            id={g.id}
            name={g.name}
            headerImage={g.headerImage}
            description={g.description}
            atk={g.atk}
            def={g.def}
            rarity={g.rarity}
            tags={g.tags}
            developers={g.developers}
            reviewScore={g.reviewScore}
            peakCcu={g.peakCcu}
            ownerEstimate={g.ownerEstimate}
            priceCents={g.priceCents}
            isFree={g.isFree}
          />
        ))}
      </div>
    </div>
  );
}
