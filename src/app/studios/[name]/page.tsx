"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StudioCard } from "@/components/StudioCard";
import type { Rarity } from "@/lib/rarityStyles";
import { CardWatchScope, CardWatchButton } from "@/components/CardWatchControls";
import detailStyles from "@/components/DetailWindows.module.css";

type Studio = {
  id: string;
  name: string;
  gameCount: number;
  atk: number;
  def: number;
  rarity: Rarity;
  about: string | null;
  avatarUrl: string | null;
  games: string[];
};

type GameLink = { name: string; appid: string | null; hasCard: boolean; headerImage?: string | null };

export default function StudioPage({ params }: { params: Promise<{ name: string }> }) {
  const router = useRouter();
  const { name } = use(params);
  const decodedName = decodeURIComponent(name);
  const [studio, setStudio] = useState<Studio | null>(null);
  const [games, setGames] = useState<GameLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const close = () => { if (window.history.length > 1) router.back(); else router.replace("/collection"); };

  useEffect(() => {
    async function load() {
      const [studioRes, gamesRes] = await Promise.all([
        fetch(`/api/studios/info?name=${encodeURIComponent(decodedName)}`, { cache: "no-store" }),
        fetch(`/api/studios/games?name=${encodeURIComponent(decodedName)}`, { cache: "no-store" }),
      ]);
      if (!studioRes.ok) { setNotFound(true); setLoading(false); return; }
      setStudio(await studioRes.json());
      if (gamesRes.ok) {
        const data = await gamesRes.json();
        setGames(Array.isArray(data) ? data : (data.games ?? []));
      }
      setLoading(false);
    }
    void load();
  }, [decodedName]);

  return (
    <main className="min-h-screen bg-gray-950 p-6 flex flex-col items-center gap-8">
      <div className="w-full max-w-2xl">
        <button type="button" onClick={close} className="card-route-close" aria-label="Fermer le studio">×</button>
      </div>

      {loading && (
        <div className="text-gray-400 text-sm mt-20">Chargement du studio…</div>
      )}

      {!loading && notFound && (
        <div className="text-center mt-20">
          <p className="text-red-400 text-lg font-bold mb-2">Studio introuvable</p>
          <p className="text-gray-500 text-sm">« {decodedName} » n&apos;existe pas dans le catalogue.</p>
          <button type="button" onClick={close} className="mt-6 inline-block text-amber-400 hover:underline text-sm">Fermer</button>
        </div>
      )}

      {!loading && studio && (
        <CardWatchScope><div className={`flex w-full max-w-md flex-col items-center gap-6 ${detailStyles.window}`}>
          <h1 className="text-2xl font-bold text-amber-400">{studio.name}</h1>
          <CardWatchButton target={{ studioId: studio.id }} name={studio.name} />
          <StudioCard
            name={studio.name}
            gameCount={studio.gameCount}
            atk={studio.atk}
            def={studio.def}
            rarity={studio.rarity}
            games={games}
            about={studio.about}
            avatarUrl={studio.avatarUrl}
          />
          {studio.about && (
            <p className="text-gray-300 text-sm max-w-md text-center leading-relaxed">{studio.about}</p>
          )}
        </div></CardWatchScope>
      )}
    </main>
  );
}
