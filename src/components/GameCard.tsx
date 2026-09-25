"use client";
import { FlipCard } from "./FlipCard";
import { CardOrnaments } from "./CardOrnaments";
import { FlameDial } from "./FlameDial";
import { CardCategoryPills, PrivateCategoryLabels, type PrivateCardCategory } from "./CardCategoryPills";
import { RARITY_STYLES, type Rarity } from "@/lib/rarityStyles";

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
  privateCategories = [],
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
  privateCategories?: PrivateCardCategory[];
}) {
  const style = RARITY_STYLES[rarity];
  const canFlip = !!id;

  const front = (
    <div
      data-rarity={rarity}
      className={`steam-card-shell w-full h-full rounded-2xl border-2 ${style.border} ${style.glow} bg-gray-900 overflow-hidden flex flex-col`}
    >
      <CardOrnaments />
      <div className="steam-card-visual">
        <img src={headerImage} alt={name} className="w-full h-36 object-cover" />
        <FlameDial rarity={rarity} />
        <CardCategoryPills categories={privateCategories} />
      </div>

      <div className="steam-card-content p-4 flex flex-col gap-2 flex-1">
        <div className="steam-card-nameplate">
          <h3 className="steam-card-title text-white font-bold text-lg leading-tight">{name}</h3>
          {contentType === "DLC" && <span className="ml-2 rounded border border-amber-700/70 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-300">DLC</span>}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((t) => (
              <span key={t} className="steam-tag text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                {t}
              </span>
            ))}
          </div>
        )}

        <p className="text-gray-400 text-xs leading-snug line-clamp-4 flex-1">{description}</p>

        <div className="steam-statbar flex justify-between items-center pt-2 border-t border-gray-800 mt-2">
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
          <p className="text-center text-gray-600 text-[10px] mt-1">Cliquer pour retourner</p>
        )}
      </div>
    </div>
  );

  const back = (
    <div
      data-rarity={rarity}
      className={`steam-card-shell w-full h-full rounded-2xl border-2 ${style.border} ${style.glow} bg-gray-900 flex flex-col p-4 gap-3`}
    >
      <CardOrnaments />
      <div className="steam-card-nameplate">
        <h3 className="steam-card-title text-white font-bold text-base leading-tight truncate">{name}</h3>
      </div>
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
        <div className="text-white truncate">{developers.length > 0 ? developers.join(", ") : "Inconnu"}</div>
      </div>

      <div className="flex-1" />

      {id && (
        <a
          href={`https://store.steampowered.com/app/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="steam-card-action text-center bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg py-2"
        >
          Voir sur Steam ↗
        </a>
      )}
      <p className="text-center text-gray-600 text-[10px]">Cliquer pour revenir</p>
    </div>
  );

  return <FlipCard front={front} back={back} canFlip={canFlip} onFlipChange={onFlipChange} />;
}
