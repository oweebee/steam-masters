"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlipCard } from "./FlipCard";
import { GameCard } from "./GameCard";
import { CardZoomDialog, originFromElement, type CardZoomOrigin } from "./CardZoomDialog";
import { CardOrnaments } from "./CardOrnaments";
import { FlameDial } from "./FlameDial";
import { CardCategoryPills, PrivateCategoryLabels, type PrivateCardCategory } from "./CardCategoryPills";
import { RARITY_STYLES, type Rarity } from "@/lib/rarityStyles";
import { SteampunkStudioPlaceholder } from "./SteampunkStudioPlaceholder";
import { groupStudioLicenses } from "@/lib/studioLicenses";
import { CardWatchScope, CardWatchButton, CardWatchOnOpen } from "./CardWatchControls";
import detailStyles from "./DetailWindows.module.css";

type GameLink = { name: string; appid: string | null; hasCard: boolean; headerImage?: string | null };
type GamePreview = {
  id: string; name: string; headerImage: string; description: string; atk: number; def: number;
  rarity: Rarity; tags: string[]; developers: string[]; reviewScore: number; peakCcu: number;
  ownerEstimate: number; priceCents: number | null; isFree: boolean; source?: "STEAM" | "IGDB"; platforms?: string[];
};

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
  onFlipChange,
  forceClosed,
  privateCategories = [],
  onAuction = false,
  detailOnly = false,
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
  onFlipChange?: (flipped: boolean) => void;
  forceClosed?: boolean;
  privateCategories?: PrivateCardCategory[];
  onAuction?: boolean;
  detailOnly?: boolean;
}) {
  const style = RARITY_STYLES[rarity];
  const [watchOpen, setWatchOpen] = useState(false);
  const [resolvedGames, setResolvedGames] = useState<GameLink[]>(games);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [previews, setPreviews] = useState<GamePreview[]>([]);
  const [previewError, setPreviewError] = useState("");
  const [openingGameId, setOpeningGameId] = useState<string | null>(null);
  const [previewOrigin, setPreviewOrigin] = useState<CardZoomOrigin | null>(null);
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
  const licenses = useMemo(() => groupStudioLicenses(resolvedGames), [resolvedGames]);
  const displayedGameCount = licenses.length || gameCount;
  const canFlip = true; // Even an empty catalogue entry can be followed.
  // Logo vérifié saisi par l'admin en priorité ; sinon image officielle Steam
  // d'un jeu importé de ce studio. Aucun visuel n'est inventé.
  const displayImage = avatarUrl ?? coverImage ?? gameImages[0] ?? null;

  async function openGames(origin: CardZoomOrigin, key: string, versions: GameLink[]) {
    const ids = versions.filter((game) => game.hasCard && game.appid).map((game) => game.appid!);
    if (!ids.length) return;
    setOpeningGameId(key);
    setPreviewOrigin(origin);
    setPreviewError("");
    try {
      const results = await Promise.allSettled(ids.map(async (appid) => {
        const response = await fetch(`/api/games/${encodeURIComponent(appid)}?studio=${encodeURIComponent(name)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error("Carte indisponible");
        return response.json() as Promise<GamePreview>;
      }));
      const cards = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      if (!cards.length) throw new Error("Carte indisponible");
      setPreviews(cards);
    } catch { setPreviewError("Impossible d’ouvrir cette carte."); }
    finally { setOpeningGameId(null); }
  }

  const front = (
    <div
      ref={frontRef}
      data-rarity={rarity}
      className={`steam-card-shell w-full h-full rounded-2xl border-2 ${style.border} ${style.glow} bg-gray-900 overflow-hidden flex flex-col`}
    >
      <CardOrnaments />
      <div className="steam-card-content p-4 flex flex-col gap-2 flex-1 overflow-hidden">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">Studio</span>
        <div className="steam-card-nameplate">
          <h3 className="steam-card-title text-white font-bold text-lg leading-tight">{name}</h3>
        </div>
        <div className="min-h-12">
          <span className="text-[10px] uppercase tracking-wide text-amber-700">Jeux</span>
          <p className="text-gray-400 text-xs leading-snug line-clamp-2">
            {resolvedGames.length > 0
              ? licenses.map((license) => license.name).join(" • ")
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

        <div className="steam-card-visual steam-studio-visual w-[calc(100%+2rem)] h-28 -mx-4 mt-auto bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
          {gameImages.length > 1 ? (
            <div className={`steam-studio-mosaic steam-studio-mosaic-${Math.min(gameImages.length, 4)}`}>
              {gameImages.slice(0, 4).map((image, index) => (
                <img key={image} src={image} alt={`${name} — jeu ${index + 1}`} />
              ))}
            </div>
          ) : displayImage ? (
            <img src={displayImage} alt={name} />
          ) : (
            <SteampunkStudioPlaceholder className="w-full h-full object-cover" />
          )}
          <FlameDial rarity={rarity} />
          <CardCategoryPills categories={privateCategories} studio />
        </div>

        <div className="steam-statbar flex justify-between items-center pt-2 border-t border-gray-800">
          <div className="steam-stat steam-stat-atk flex items-center gap-1 text-red-400 font-bold">
            <span className="text-xs">ATK</span>
            <span>{atk}</span>
          </div>
          {onAuction && <span className="steam-auction-indicator" title="Cette carte est aux enchères" aria-label="Cette carte est aux enchères"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 7 3-3 4 4-3 3M5 10l3-3 4 4-3 3M11 14l6 6m-3-2 2-2 3 3-2 2M4 20h8" /></svg></span>}
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
      {displayImage && <img src={displayImage} alt="" aria-hidden="true" className="steam-card-backdrop-image" />}
      <div className="steam-card-nameplate">
        <h3 className="steam-card-title text-white font-bold text-base leading-tight truncate">{name}</h3>
      </div>
      <PrivateCategoryLabels categories={privateCategories} />
      {about && (
        <p className="text-gray-400 text-xs leading-snug line-clamp-3 border-b border-gray-800 pb-2">{about}</p>
      )}
      <p className="text-gray-500 text-[10px] uppercase">Licences du studio ({displayedGameCount})</p>
      <div className={`steam-card-desc flex-1 min-h-0 flex flex-col gap-1 ${detailStyles.studioList}`}>
        {licenses.map((license) => {
          const available = license.versions.filter((game) => game.hasCard && game.appid);
          return available.length ? (
            <button
              type="button"
              key={license.key}
              onClick={(event) => { event.stopPropagation(); void openGames(originFromElement(event.currentTarget), license.key, license.versions); }}
              disabled={openingGameId === license.key}
              className="steam-info-panel bg-gray-800 text-blue-400 hover:text-blue-300 hover:underline text-xs rounded-lg px-2 py-1.5 truncate"
            >
              {openingGameId === license.key ? "Ouverture…" : <>{license.name}{available.length > 1 && <span className="studio-license-count">{available.length} versions</span>}</>}
            </button>
          ) : (
            <div key={license.key} className="steam-info-panel bg-gray-800 text-gray-300 text-xs rounded-lg px-2 py-1.5 truncate">
              {license.name}
            </div>
          );
        })}
      </div>
      {previewError && <p role="alert" className="text-red-400 text-xs">{previewError}</p>}
      <CardWatchOnOpen active={detailOnly || (watchOpen && !forceClosed)} name={name} />
    </div>
  );

  const overlay = previews.length === 1 ? (
    <CardZoomDialog open onClose={() => setPreviews([])} origin={previewOrigin} size="card" label={`la carte ${previews[0].name}`}>
      <div className="card-detail-card"><GameCard {...previews[0]} detailOnly /></div>
    </CardZoomDialog>
  ) : previews.length > 1 ? (
    <CardZoomDialog open onClose={() => setPreviews([])} origin={previewOrigin} size="wide" label={`les versions de ${previews[0].name}`}>
      <div className={`studio-versions-dialog ${detailStyles.window} ${detailStyles.versions}`}>
        <header><span>Licence du studio</span><h2>{previews[0].name}</h2><p>{previews.length} version{previews.length > 1 ? "s" : ""} dans le catalogue</p></header>
        <CardWatchScope><div className="studio-versions-grid">{previews.map((preview) => <div className={detailStyles.item} key={preview.id}><GameCard {...preview} /><CardWatchButton target={{ gameId: preview.id }} name={preview.name} /></div>)}</div></CardWatchScope>
      </div>
    </CardZoomDialog>
  ) : null;

  if (detailOnly) return <>{back}{overlay}</>;

  return <>
    <FlipCard
      front={front}
      back={back}
      canFlip={canFlip}
      onFlipChange={opened => { setWatchOpen(opened); onFlipChange?.(opened); }}
      forceClosed={forceClosed}
    />
    {overlay}
  </>;
}
