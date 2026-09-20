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
};

type Suggestion = { appid: number; name: string; tinyImage: string };
type StudioMatch = { id: string; name: string; gameCount: number };

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

      <div className="flex flex-wrap gap-6">
        {games.map((g) => (
          <GameCard
            key={g.id}
            name={g.name}
            headerImage={g.headerImage}
            description={g.description}
            atk={g.atk}
            def={g.def}
            rarity={g.rarity}
            tags={g.tags}
          />
        ))}
      </div>
    </div>
  );
}
