"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlipCard } from "./FlipCard";
import { CardOrnaments } from "./CardOrnaments";
import { RARITY_STYLES, type Rarity } from "@/lib/rarityStyles";

type GameLink = { name: string; appid: string | null; hasCard: boolean; headerImage?: string | null };

export function StudioCard({
  name,
  gameCount,
  atk,
  def,
  rarity,
  games = [],
  about,
  avatarUrl,
  coverImage,
}: {
  name: string;
  gameCount: number;
  atk: number;
  def: number;
  rarity: Rarity;
  games?: GameLink[];
  about?: string | null;
  avatarUrl?: string | null;
  coverImage?: string | null;
}) {
  const style = RARITY_STYLES[rarity];
  const [resolvedGames, setResolvedGames] = useState<GameLink[]>(games);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const frontRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = frontRef.current;
    if (!node) return;

    let cancelled = false;
    const loadOfficialGames = async () => {
      setLoadState("loading");
      try {
        const res = await fetch(`/api/studios/games?name=${encodeURIComponent(name)}`);
        if (!res.ok) throw new Error("Catalogue indisponible");
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          setResolvedGames((current) => {
            const currentById = new Map(current.map((game) => [game.appid ?? game.name, game]));
            return data.map((game: GameLink) => ({
              ...currentById.get(game.appid ?? game.name),
              ...game,
            }));
          });
        }
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    };

    if (!("IntersectionObserver" in window)) {
      loadOfficialGames();
      return () => { cancelled = true; };
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      loadOfficialGames();
    }, { rootMargin: "200px" });
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [name, reloadKey]);

  const gameImages = useMemo(
    () => Array.from(new Set(resolvedGames.map((game) => game.headerImage).filter((image): image is string => !!image))),
    [resolvedGames]
  );
  const displayedGameCount = Math.max(gameCount, resolvedGames.length);
  const canFlip = resolvedGames.length > 0 || !!about;
  // Logo vérifié saisi par l'admin en priorité ; sinon image officielle Steam
  // d'un jeu importé de ce studio. Aucun visuel n'est inventé.
  const displayImage = avatarUrl ?? coverImage ?? gameImages[0] ?? null;

  const front = (
    <div
      ref={frontRef}
      data-rarity={rarity}
      className={`steam-card-shell w-full h-full rounded-2xl border-2 ${style.border} ${style.glow} bg-gray-900 overflow-hidden flex flex-col`}
    >
      <CardOrnaments />
      <div className="steam-card-content p-4 flex flex-col gap-2 flex-1">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">Studio</span>
        <div className="steam-card-nameplate">
          <h3 className="steam-card-title text-white font-bold text-lg leading-tight">{name}</h3>
        </div>
        <div className="min-h-12">
          <span className="text-[10px] uppercase tracking-wide text-amber-700">Jeux</span>
          <p className="text-gray-400 text-xs leading-snug line-clamp-2">
            {resolvedGames.length > 0
              ? resolvedGames.map((game) => game.name).join(" • ")
              : loadState === "loading"
                ? "Recherche sur Steam…"
                : loadState === "error"
                  ? "Catalogue momentanément indisponible"
                  : "Aucun jeu Steam trouvé"}
          </p>
          {resolvedGames.length === 0 && loadState === "error" && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setReloadKey((value) => value + 1);
              }}
              className="mt-1 text-[10px] text-amber-600 hover:text-amber-400 underline"
            >
              Réessayer
            </button>
          )}
        </div>

        <div className="steam-card-visual steam-studio-visual w-[calc(100%+2rem)] h-28 -mx-4 mt-auto bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center overflow-hidden">
          {gameImages.length > 1 ? (
            <div className={`steam-studio-mosaic steam-studio-mosaic-${Math.min(gameImages.length, 4)}`}>
              {gameImages.slice(0, 4).map((image, index) => (
                <img key={image} src={image} alt={`${name} — jeu ${index + 1}`} />
              ))}
            </div>
          ) : displayImage ? (
            <img src={displayImage} alt={name} />
          ) : (
            <span className="text-4xl">🏢</span>
          )}
          <span className="steam-card-image-dial" aria-hidden="true"><i /></span>
        </div>

        <div className="steam-statbar flex justify-between items-center pt-2 border-t border-gray-800">
          <div className="steam-stat steam-stat-atk flex items-center gap-1 text-red-400 font-bold">
            <span className="text-xs">ATK</span>
            <span>{atk}</span>
          </div>
          <div className="steam-stat steam-stat-def flex items-center gap-1 text-blue-400 font-bold">
            <span className="text-xs">DEF</span>
            <span>{def}</span>
          </div>
        </div>
        {canFlip && (
          <p className="text-center text-gray-600 text-[10px] mt-1">Cliquer pour voir les jeux</p>
        )}
      </div>
    </div>
  );

  const back = (
    <div
      data-rarity={rarity}
      className={`steam-card-shell w-full h-full rounded-2xl border-2 ${style.border} ${style.glow} bg-gray-900 flex flex-col p-4 gap-2`}
    >
      <CardOrnaments />
      <div className="steam-card-nameplate">
        <h3 className="steam-card-title text-white font-bold text-base leading-tight truncate">{name}</h3>
      </div>
      {about && (
        <p className="text-gray-400 text-xs leading-snug line-clamp-3 border-b border-gray-800 pb-2">{about}</p>
      )}
      <p className="text-gray-500 text-[10px] uppercase">Jeux sur Steam ({displayedGameCount})</p>
      <div className="flex-1 overflow-y-auto flex flex-col gap-1">
        {resolvedGames.map((g) =>
          g.hasCard && g.appid ? (
            <Link
              key={g.name}
              href={`/toutes-les-cartes#card-GAME-${g.appid}`}
              onClick={(e) => e.stopPropagation()}
              className="steam-info-panel bg-gray-800 text-blue-400 hover:text-blue-300 hover:underline text-xs rounded-lg px-2 py-1.5 truncate"
            >
              {g.name}
            </Link>
          ) : (
            <div key={g.name} className="steam-info-panel bg-gray-800 text-gray-300 text-xs rounded-lg px-2 py-1.5 truncate">
              {g.name}
            </div>
          )
        )}
      </div>
      <p className="text-center text-gray-600 text-[10px]">Cliquer pour revenir</p>
    </div>
  );

  return <FlipCard front={front} back={back} canFlip={canFlip} />;
}
