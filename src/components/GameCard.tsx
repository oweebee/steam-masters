"use client";
import { useState } from "react";

type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

const RARITY_STYLES: Record<Rarity, { border: string; glow: string; label: string; text: string }> = {
  COMMON:    { border: "border-gray-500",   glow: "",                             label: "bg-gray-600",   text: "Commune" },
  UNCOMMON:  { border: "border-green-500",  glow: "shadow-[0_0_12px_rgba(34,197,94,0.4)]",  label: "bg-green-600",  text: "Peu commune" },
  RARE:      { border: "border-blue-500",   glow: "shadow-[0_0_14px_rgba(59,130,246,0.5)]", label: "bg-blue-600",   text: "Rare" },
  EPIC:      { border: "border-purple-500", glow: "shadow-[0_0_16px_rgba(168,85,247,0.6)]", label: "bg-purple-600", text: "Épique" },
  LEGENDARY: { border: "border-amber-400",  glow: "shadow-[0_0_20px_rgba(251,191,36,0.7)]", label: "bg-amber-500",  text: "Légendaire" },
};

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
}) {
  const style = RARITY_STYLES[rarity];
  const [flipped, setFlipped] = useState(false);
  const canFlip = !!id;

  return (
    <div
      className="relative w-72 h-[26rem] [perspective:1200px]"
      onClick={() => canFlip && setFlipped((f) => !f)}
    >
      <div
        className={`relative w-full h-full transition-transform duration-500 [transform-style:preserve-3d] ${
          flipped ? "[transform:rotateY(180deg)]" : ""
        } ${canFlip ? "cursor-pointer" : ""}`}
      >
        {/* FACE AVANT */}
        <div
          className={`absolute inset-0 [backface-visibility:hidden] rounded-2xl border-2 ${style.border} ${style.glow} bg-gray-900 overflow-hidden flex flex-col`}
        >
          <span
            className={`absolute top-2 right-2 z-10 ${style.label} text-white text-xs font-bold px-2 py-1 rounded-full`}
          >
            {style.text}
          </span>

          <img src={headerImage} alt={name} className="w-full h-36 object-cover" />

          <div className="p-4 flex flex-col gap-2 flex-1">
            <h3 className="text-white font-bold text-lg leading-tight">{name}</h3>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 3).map((t) => (
                  <span key={t} className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                    {t}
                  </span>
                ))}
              </div>
            )}

            <p className="text-gray-400 text-xs leading-snug line-clamp-4 flex-1">{description}</p>

            <div className="flex justify-between items-center pt-2 border-t border-gray-800 mt-2">
              <div className="flex items-center gap-1 text-red-400 font-bold">
                <span className="text-xs">ATK</span>
                <span>{atk}</span>
              </div>
              <div className="flex items-center gap-1 text-blue-400 font-bold">
                <span className="text-xs">DEF</span>
                <span>{def}</span>
              </div>
            </div>
            {canFlip && (
              <p className="text-center text-gray-600 text-[10px] mt-1">Cliquer pour retourner</p>
            )}
          </div>
        </div>

        {/* FACE ARRIÈRE */}
        <div
          className={`absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-2xl border-2 ${style.border} ${style.glow} bg-gray-900 flex flex-col p-4 gap-3`}
        >
          <h3 className="text-white font-bold text-base leading-tight truncate">{name}</h3>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-800 rounded-lg p-2">
              <div className="text-gray-500 text-[10px] uppercase">Avis positifs</div>
              <div className="text-white font-semibold">{reviewScore ?? "—"}%</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2">
              <div className="text-gray-500 text-[10px] uppercase">Connectés</div>
              <div className="text-white font-semibold">{peakCcu != null ? formatOwners(peakCcu) : "—"}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2">
              <div className="text-gray-500 text-[10px] uppercase">Possesseurs (est.)</div>
              <div className="text-white font-semibold">{ownerEstimate != null ? formatOwners(ownerEstimate) : "—"}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2">
              <div className="text-gray-500 text-[10px] uppercase">Prix</div>
              <div className="text-white font-semibold">{formatPrice(priceCents ?? null, !!isFree)}</div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-2 text-xs">
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
              className="text-center bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg py-2"
            >
              Voir sur Steam ↗
            </a>
          )}
          <p className="text-center text-gray-600 text-[10px]">Cliquer pour revenir</p>
        </div>
      </div>
    </div>
  );
}
