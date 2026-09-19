"use client";
import { useEffect, useState } from "react";
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

export default function AdminGamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [appid, setAppid] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/admin/games");
    setGames(await res.json());
  }

  useEffect(() => { load(); }, []);

  async function importGame(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appid }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }
    setAppid("");
    setLoading(false);
    load();
  }

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Import de jeux Steam</h1>

      <form onSubmit={importGame} className="flex gap-2 mb-8 max-w-md">
        <input
          required
          placeholder="AppID Steam (ex: 1145360)"
          value={appid}
          onChange={(e) => setAppid(e.target.value)}
          className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading}
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
