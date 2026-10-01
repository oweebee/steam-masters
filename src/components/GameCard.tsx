"use client";
import { useState } from "react";
import { CardWatchOnOpen } from "./CardWatchControls";
import detailStyles from "./DetailWindows.module.css";
import { FlipCard } from "./FlipCard";
import { originFromElement } from "./CardZoomDialog";
import { useCardOverlay } from "./CardOverlayContext";
import { CardOrnaments } from "./CardOrnaments";
import { FlameDial } from "./FlameDial";
import { CardCategoryPills, PrivateCategoryLabels, type PrivateCardCategory } from "./CardCategoryPills";
import { RARITY_STYLES, type Rarity } from "@/lib/rarityStyles";
import { platformsForGame } from "@/lib/platforms";
import { usePlatformInfo } from "@/lib/usePlatformNames";
import { platformColor } from "@/lib/platformColors";

function formatOwners(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function formatPrice(cents: number | null, isFree: boolean) {
  if (isFree) return "Gratuit";
  if (cents == null) return "Prix inconnu";
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

export function GameCard({
  id,
  name,
  headerImage,
  description,
  atk,
  def,
  rarity,
  tags,
  developers = [],
  reviewScore,
  peakCcu,
  ownerEstimate,
  priceCents,
  isFree,
  contentType = "GAME",
  onFlipChange,
  forceClosed,
  privateCategories = [],
  onAuction = false,
  source = "STEAM",
  platforms,
  detailOnly = false,
}: {
  id?: string;
  name: string;
  headerImage: string;
  description: string;
  atk: number;
  def: number;
  rarity: Rarity;
  tags: string[];
  developers?: string[];
  reviewScore?: number;
  peakCcu?: number;
  ownerEstimate?: number;
  priceCents?: number | null;
  isFree?: boolean;
  contentType?: "GAME" | "DLC";
  onFlipChange?: (flipped: boolean) => void;
  forceClosed?: boolean;
  privateCategories?: PrivateCardCategory[];
  onAuction?: boolean;
  source?: "STEAM" | "IGDB";
  platforms?: string[];
  detailOnly?: boolean;
}) {
  const style = RARITY_STYLES[rarity];
  const [watchOpen, setWatchOpen] = useState(false);
  const openStudio = useCardOverlay();
  const canFlip = !!id;
  const supports = platformsForGame(platforms, source);
  const platformInfo = usePlatformInfo();
  const platformLogo = supports.length ? platformInfo[supports[0]]?.logo ?? null : null;

  const front = (
    <div
      data-rarity={rarity}
      className={`steam-card-shell w-full h-full rounded-2xl border-2 ${style.border} ${style.glow} bg-gray-900 overflow-hidden flex flex-col`}
    >
      <CardOrnaments platformLogo={platformLogo} />
      <div className={`steam-card-visual ${source === "IGDB" ? "steam-card-visual--igdb" : ""}`}>
        <img src={headerImage} alt={name} className="w-full object-cover" />
        <CardCategoryPills categories={privateCategories} />
        {contentType === "DLC" && <span className="steam-card-dlc-badge">DLC</span>}
      </div>
      <FlameDial rarity={rarity} />

      <div className="steam-card-content p-2 sm:p-4 flex flex-col gap-1 sm:gap-2 flex-1 overflow-hidden">
        <div className="steam-card-nameplate">
          <h3 className="steam-card-title text-white font-bold text-sm sm:text-lg leading-tight">{name}</h3>
        </div>

        <p className="steam-card-desc text-gray-400 text-xs leading-snug flex-1">{description}</p>

        <div className="steam-statbar flex justify-between items-center pt-2 border-t border-gray-800 mt-2">
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
        {supports.length > 0 && (
          <div className="steam-card-footer-tags flex flex-wrap items-center justify-center gap-1 mt-1">
            {supports.slice(0, 3).map((p) => {
              const info = platformInfo[p];
              return (
                <span key={p} className="steam-platform-tag rounded border px-1.5 py-0.5 text-[9px] tracking-wide" style={{ "--pc": platformColor(info?.name ?? p, p) } as React.CSSProperties}>{info?.name ?? p}</span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const back = (
    <div
      data-rarity={rarity}
      className={`steam-card-shell w-full h-full rounded-2xl border-2 ${style.border} ${style.glow} bg-gray-900 flex flex-col p-4 gap-3 ${detailStyles.gameBack}`}
    >
      <CardOrnaments platformLogo={platformLogo} />
      <img src={headerImage} alt="" aria-hidden="true" className="steam-card-backdrop-image" />
      <div className="steam-card-nameplate">
        <h3 className="steam-card-title text-white font-bold text-base leading-tight truncate">{name}</h3>
      </div>
      {id && <CardWatchOnOpen active={detailOnly || (watchOpen && !forceClosed)} gameId={id} name={name} />}
      <PrivateCategoryLabels categories={privateCategories} />

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="steam-info-panel bg-gray-800 rounded-lg p-2">
          <div className="text-gray-500 text-[10px] uppercase">Avis positifs</div>
          <div className="text-white font-semibold">{reviewScore ?? "—"}%</div>
        </div>
        <div className="steam-info-panel bg-gray-800 rounded-lg p-2">
          <div className="text-gray-500 text-[10px] uppercase">Connectés</div>
          <div className="text-white font-semibold">{peakCcu != null ? formatOwners(peakCcu) : "—"}</div>
        </div>
        <div className="steam-info-panel bg-gray-800 rounded-lg p-2">
          <div className="text-gray-500 text-[10px] uppercase">Possesseurs (est.)</div>
          <div className="text-white font-semibold">{ownerEstimate != null ? formatOwners(ownerEstimate) : "—"}</div>
        </div>
        <div className="steam-info-panel bg-gray-800 rounded-lg p-2">
          <div className="text-gray-500 text-[10px] uppercase">Prix</div>
          <div className="text-white font-semibold">{formatPrice(priceCents ?? null, !!isFree)}</div>
        </div>
      </div>

      <div className="steam-info-panel bg-gray-800 rounded-lg p-2 text-xs">
        <div className="text-gray-500 text-[10px] uppercase mb-0.5">Studio</div>
        <div className="text-white truncate">
          {developers.length > 0
            ? developers.map((dev, i) => (
                <span key={dev}>
                  {i > 0 && <span className="text-gray-600">, </span>}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openStudio?.(dev, originFromElement(event.currentTarget));
                    }}
                    className="card-detail-link hover:text-amber-400 transition-colors"
                  >{dev}</button>
                </span>
              ))
            : "Inconnu"}
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 4).map((t) => (
            <span key={t} className="steam-tag text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="flex-1" />

      {id && (
        <a
          href={source === "IGDB" ? `/api/games/${encodeURIComponent(id)}/external` : `https://store.steampowered.com/app/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="steam-card-action text-center bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg py-2"
        >
          {source === "IGDB" ? "Voir sur IGDB ↗" : "Voir sur Steam ↗"}
        </a>
      )}
    </div>
  );

  if (detailOnly) return back;

  return <FlipCard
    front={front}
    back={back}
    canFlip={canFlip}
    onFlipChange={opened => { setWatchOpen(opened); onFlipChange?.(opened); }}
    forceClosed={forceClosed}
  />;
}
