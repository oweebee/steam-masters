"use client";
import { useEffect, useState } from "react";
import { GameCard } from "@/components/GameCard";

type Card = {
  id: string;
  game: {
    id: string;
    name: string;
    headerImage: string;
    description: string;
    atk: number;
    def: number;
    rarity: "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
    tags: string[];
  };
};

function formatDuration(ms: number) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}

export function DashboardClient() {
  const [cards, setCards] = useState<Card[]>([]);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [lastOpened, setLastOpened] = useState<Card["game"] | null>(null);

  async function loadCollection() {
    const res = await fetch("/api/collection");
    if (res.ok) setCards(await res.json());
  }

  async function loadBoosterStatus() {
    const res = await fetch("/api/booster");
    if (res.ok) {
      const data = await res.json();
      setRemainingMs(data.remainingMs);
    }
  }

  useEffect(() => {
    loadCollection();
    loadBoosterStatus();
  }, []);

  useEffect(() => {
    if (remainingMs === null || remainingMs <= 0) return;
    const t = setInterval(() => {
      setRemainingMs((prev) => (prev === null ? null : Math.max(0, prev - 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [remainingMs]);

  async function openBooster() {
    setOpening(true);
    setError("");
    setLastOpened(null);
    const res = await fetch("/api/booster", { method: "POST" });
    const data = await res.json();
    setOpening(false);
    if (!res.ok) {
      setError(data.error);
      setRemainingMs(data.remainingMs ?? null);
      return;
    }
    setLastOpened(data.game);
    loadCollection();
    loadBoosterStatus();
  }

  const canOpen = remainingMs === 0;

  return (
    <div className="mt-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-8 flex flex-col items-center gap-4">
        <button
          onClick={openBooster}
          disabled={!canOpen || opening}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl px-8 py-4 text-lg transition"
        >
          {opening ? "Ouverture…" : canOpen ? "Ouvrir un booster gratuit" : `Prochain booster dans ${formatDuration(remainingMs ?? 0)}`}
        </button>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {lastOpened && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-green-400 text-sm">Nouvelle carte obtenue !</p>
            <GameCard
              name={lastOpened.name}
              headerImage={lastOpened.headerImage}
              description={lastOpened.description}
              atk={lastOpened.atk}
              def={lastOpened.def}
              rarity={lastOpened.rarity}
              tags={lastOpened.tags}
            />
          </div>
        )}
      </div>

      <h2 className="text-xl font-bold text-white mb-4">Ma collection ({cards.length})</h2>
      <div className="flex flex-wrap gap-6">
        {cards.map((c) => (
          <GameCard
            key={c.id}
            name={c.game.name}
            headerImage={c.game.headerImage}
            description={c.game.description}
            atk={c.game.atk}
            def={c.game.def}
            rarity={c.game.rarity}
            tags={c.game.tags}
          />
        ))}
        {cards.length === 0 && <p className="text-gray-500 text-sm">Aucune carte pour l'instant — ouvre un booster !</p>}
      </div>
    </div>
  );
}
