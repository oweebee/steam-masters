"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CardOverlayContext } from "./CardOverlayContext";
import { CardZoomDialog, type CardZoomOrigin } from "./CardZoomDialog";
import { StudioCard } from "./StudioCard";
import type { Rarity } from "@/lib/rarityStyles";

type StudioData = { id: string; name: string; gameCount: number; atk: number; def: number; rarity: Rarity; about: string | null; avatarUrl: string | null };
type GameLink = { name: string; appid: string | null; hasCard: boolean; headerImage?: string | null };
type Entry = { key: number; name: string; origin?: CardZoomOrigin | null };

function LinkedStudio({ entry, close }: { entry: Entry; close: () => void }) {
  const [studio, setStudio] = useState<StudioData | null>(null);
  const [games, setGames] = useState<GameLink[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    Promise.all([
      fetch(`/api/studios/info?name=${encodeURIComponent(entry.name)}`, { cache: "no-store", signal }),
      fetch(`/api/studios/games?name=${encodeURIComponent(entry.name)}`, { cache: "no-store", signal }),
    ]).then(async ([studioResponse, gamesResponse]) => {
      if (!studioResponse.ok) throw new Error("Studio indisponible.");
      const studioData = await studioResponse.json();
      const gamesData = gamesResponse.ok ? await gamesResponse.json() : [];
      if (!controller.signal.aborted) {
        setStudio(studioData);
        setGames(Array.isArray(gamesData) ? gamesData : gamesData.games ?? []);
      }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Studio indisponible."); });
    return () => controller.abort();
  }, [entry.name]);

  if (!studio) return <CardZoomDialog open onClose={close} origin={entry.origin} label={`le studio ${entry.name}`}><div className="card-link-loading"><strong>{entry.name}</strong><p>{error || "Ouverture du studio…"}</p></div></CardZoomDialog>;
  return <CardZoomDialog open onClose={close} origin={entry.origin} label={`le studio ${entry.name}`} size="card">
    <div className="card-detail-card"><StudioCard {...studio} games={games} detailOnly /></div>
  </CardZoomDialog>;
}

export function CardOverlayProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const openStudio = useCallback((name: string, origin?: CardZoomOrigin | null) => {
    setEntries(current => [...current, { key: Date.now() + Math.random(), name, origin }]);
  }, []);
  return <CardOverlayContext.Provider value={openStudio}>
    {children}
    {entries.map(entry => <LinkedStudio key={entry.key} entry={entry} close={() => setEntries(current => current.filter(item => item.key !== entry.key))} />)}
  </CardOverlayContext.Provider>;
}
