"use client";
import { useEffect, useState } from "react";
import { GameCard } from "@/components/GameCard";
import { StudioCard } from "@/components/StudioCard";

type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

type Game = {
  id: string;
  name: string;
  headerImage: string;
  description: string;
  atk: number;
  def: number;
  rarity: Rarity;
  tags: string[];
  developers: string[];
  reviewScore: number;
  peakCcu: number;
  ownerEstimate: number;
  priceCents: number | null;
  isFree: boolean;
  contentType: "GAME" | "DLC";
};

type Studio = {
  id: string;
  name: string;
  gameCount: number;
  atk: number;
  def: number;
  rarity: Rarity;
  avatarUrl: string | null;
  coverImage: string | null;
  games: { name: string; appid: string | null; hasCard: boolean; headerImage: string | null }[];
};
type OpenedBooster = { game: Game | null; studio: Studio | null };

function formatDuration(ms: number) {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

export function PackClient() {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [readyCount, setReadyCount] = useState(0);
  const [maxCredits, setMaxCredits] = useState(5);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [openedCards, setOpenedCards] = useState<OpenedBooster[]>([]);

  async function loadStatus() {
    const res = await fetch("/api/booster");
    if (res.ok) {
      const data = await res.json();
      setRemainingMs(data.remainingMs);
      setReadyCount(data.readyCount ?? 0);
      setMaxCredits(data.maxCredits ?? 5);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (remainingMs === null || remainingMs <= 0) return;
    const t = setInterval(() => {
      setRemainingMs((prev) => {
        if (prev === null) return null;
        if (prev <= 1000) {
          void loadStatus();
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [remainingMs]);

  async function openBooster(count: number | "all" = 1) {
    setOpening(true);
    setError("");
    setOpenedCards([]);
    const res = await fetch("/api/booster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count }) });
    const data = await res.json();
    setOpening(false);
    if (!res.ok) {
      setError(data.error);
      setRemainingMs(data.remainingMs ?? null);
      if (data.readyCount !== undefined) setReadyCount(data.readyCount);
      return;
    }
    setOpenedCards(Array.isArray(data.cards) ? data.cards : [{ game: data.game ?? null, studio: data.studio ?? null }]);
    await loadStatus();
  }

  const canOpen = readyCount > 0;

  return (
    <div className="max-w-2xl mx-auto text-center">
      <h1 className="text-2xl font-bold text-white mb-1">Ouvrir un paquet</h1>
      <p className="text-gray-500 text-sm mb-4">Les paquets gratuits s’accumulent pendant tes absences, jusqu’à {maxCredits}.</p>

      <div className="mx-auto mb-6 max-w-sm rounded-xl border border-amber-900/70 bg-gray-900/80 p-4 shadow-[inset_0_1px_0_rgba(251,191,36,.08)]">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-gray-300">Paquets disponibles</span>
          <span className="font-mono font-bold text-amber-300">{readyCount} / {maxCredits}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-800">
          <div className="h-full rounded-full bg-gradient-to-r from-red-800 via-amber-500 to-yellow-200 transition-all" style={{ width: `${(readyCount / maxCredits) * 100}%` }} />
        </div>
        {remainingMs !== null && readyCount < maxCredits && <p className="mt-2 text-xs text-gray-500">{readyCount ? "Le prochain s’ajoute dans " : "Prochain paquet dans "}<span className="text-gray-300">{formatDuration(remainingMs)}</span></p>}
      </div>

      <button
        onClick={() => void openBooster(1)}
        disabled={!canOpen || opening}
        className="group mx-auto block"
      >
        <div
          className={`w-40 h-52 mx-auto rounded-2xl border-2 flex items-center justify-center transition
          ${canOpen && !opening
            ? "border-red-700 bg-gradient-to-br from-red-950 via-gray-900 to-amber-950 shadow-[0_0_30px_rgba(169,31,31,0.34)] group-hover:scale-105"
            : "border-gray-800 bg-gray-900 opacity-50"}`}
        >
          <span className="relative text-5xl">📦{readyCount > 1 && <span className="absolute -right-5 -top-4 rounded-full border border-amber-300 bg-amber-600 px-2 py-0.5 text-xs font-bold text-black">{readyCount}</span>}</span>
        </div>
      </button>

      <div className="mt-6">
        {opening ? (
          <p className="text-red-400 font-semibold">Ouverture…</p>
        ) : canOpen ? (
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={() => void openBooster(1)} className="rounded-xl bg-blue-600 px-8 py-3 font-bold text-white transition hover:bg-blue-500">Ouvrir 1 paquet</button>
            {readyCount > 1 && <button onClick={() => void openBooster("all")} className="rounded-xl border border-amber-500 bg-gradient-to-b from-amber-500 to-amber-700 px-8 py-3 font-bold text-gray-950 shadow-[0_0_20px_rgba(245,158,11,.2)] transition hover:brightness-110">Ouvrir les {readyCount}</button>}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">Le paquet gratuit se recharge automatiquement.</p>
        )}
      </div>

      {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

      {openedCards.length > 0 && (
        <div className="flex flex-col items-center gap-2 mt-10">
          <p className="text-green-400 text-sm">{openedCards.length === 1 ? "Nouvelle carte obtenue !" : `${openedCards.length} nouvelles cartes obtenues !`}</p>
          <div className="flex flex-wrap justify-center gap-6">
          {openedCards.map(({ game, studio }, index) => <div key={`${game?.id ?? studio?.id ?? index}-${index}`}>
          {game && (
            <GameCard
              id={game.id} name={game.name} headerImage={game.headerImage} description={game.description}
              atk={game.atk} def={game.def} rarity={game.rarity} tags={game.tags} developers={game.developers}
              reviewScore={game.reviewScore} peakCcu={game.peakCcu} ownerEstimate={game.ownerEstimate}
              priceCents={game.priceCents} isFree={game.isFree} contentType={game.contentType}
            />
          )}
          {studio && (
            <StudioCard
              name={studio.name} gameCount={studio.gameCount} atk={studio.atk} def={studio.def}
              rarity={studio.rarity} avatarUrl={studio.avatarUrl} coverImage={studio.coverImage} games={studio.games}
            />
          )}
          </div>)}
          </div>
        </div>
      )}
    </div>
  );
}
