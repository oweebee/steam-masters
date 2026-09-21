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
};

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
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [lastOpened, setLastOpened] = useState<Game | null>(null);
  const [lastOpenedStudio, setLastOpenedStudio] = useState<Studio | null>(null);

  async function loadStatus() {
    const res = await fetch("/api/booster");
    if (res.ok) {
      const data = await res.json();
      setRemainingMs(data.remainingMs);
    }
  }

  useEffect(() => {
    loadStatus();
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
    setLastOpenedStudio(null);
    const res = await fetch("/api/booster", { method: "POST" });
    const data = await res.json();
    setOpening(false);
    if (!res.ok) {
      setError(data.error);
      setRemainingMs(data.remainingMs ?? null);
      return;
    }
    if (data.game) setLastOpened(data.game);
    if (data.studio) setLastOpenedStudio(data.studio);
    loadStatus();
  }

  const canOpen = remainingMs === 0;

  return (
    <div className="max-w-2xl mx-auto text-center">
      <h1 className="text-2xl font-bold text-white mb-1">Ouvrir un paquet</h1>
      <p className="text-gray-500 text-sm mb-8">Découvrez une nouvelle carte Steam</p>

      <button
        onClick={openBooster}
        disabled={!canOpen || opening}
        className="group mx-auto block"
      >
        <div
          className={`w-40 h-52 mx-auto rounded-2xl border-2 flex items-center justify-center transition
          ${canOpen && !opening
            ? "border-red-700 bg-gradient-to-br from-red-950 via-gray-900 to-amber-950 shadow-[0_0_30px_rgba(169,31,31,0.34)] group-hover:scale-105"
            : "border-gray-800 bg-gray-900 opacity-50"}`}
        >
          <span className="text-5xl">📦</span>
        </div>
      </button>

      <div className="mt-6">
        {opening ? (
          <p className="text-red-400 font-semibold">Ouverture…</p>
        ) : canOpen ? (
          <button
            onClick={openBooster}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl px-8 py-3 transition"
          >
            Ouvrir
          </button>
        ) : (
          <p className="text-gray-400 text-sm">
            Prochain paquet dans <span className="text-white font-semibold">{formatDuration(remainingMs ?? 0)}</span>
          </p>
        )}
      </div>

      {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

      {(lastOpened || lastOpenedStudio) && (
        <div className="flex flex-col items-center gap-2 mt-10">
          <p className="text-green-400 text-sm">Nouvelle carte obtenue !</p>
          {lastOpened && (
            <GameCard
              id={lastOpened.id}
              name={lastOpened.name}
              headerImage={lastOpened.headerImage}
              description={lastOpened.description}
              atk={lastOpened.atk}
              def={lastOpened.def}
              rarity={lastOpened.rarity}
              tags={lastOpened.tags}
              developers={lastOpened.developers}
              reviewScore={lastOpened.reviewScore}
              peakCcu={lastOpened.peakCcu}
              ownerEstimate={lastOpened.ownerEstimate}
              priceCents={lastOpened.priceCents}
              isFree={lastOpened.isFree}
            />
          )}
          {lastOpenedStudio && (
            <StudioCard
              name={lastOpenedStudio.name}
              gameCount={lastOpenedStudio.gameCount}
              atk={lastOpenedStudio.atk}
              def={lastOpenedStudio.def}
              rarity={lastOpenedStudio.rarity}
              avatarUrl={lastOpenedStudio.avatarUrl}
              coverImage={lastOpenedStudio.coverImage}
            />
          )}
        </div>
      )}
    </div>
  );
}
