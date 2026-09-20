"use client";
import Link from "next/link";
import { FlipCard } from "./FlipCard";

type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

type GameLink = { name: string; appid: string | null; hasCard: boolean };

const RARITY_STYLES: Record<Rarity, { border: string; glow: string; label: string; text: string }> = {
  COMMON:    { border: "border-gray-500",   glow: "",                             label: "bg-gray-600",   text: "Commune" },
  UNCOMMON:  { border: "border-green-500",  glow: "shadow-[0_0_12px_rgba(34,197,94,0.4)]",  label: "bg-green-600",  text: "Peu commune" },
  RARE:      { border: "border-blue-500",   glow: "shadow-[0_0_14px_rgba(59,130,246,0.5)]", label: "bg-blue-600",   text: "Rare" },
  EPIC:      { border: "border-purple-500", glow: "shadow-[0_0_16px_rgba(168,85,247,0.6)]", label: "bg-purple-600", text: "Épique" },
  LEGENDARY: { border: "border-amber-400",  glow: "shadow-[0_0_20px_rgba(251,191,36,0.7)]", label: "bg-amber-500",  text: "Légendaire" },
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
}: {
  name: string;
  gameCount: number;
  atk: number;
  def: number;
  rarity: Rarity;
  games?: GameLink[];
  about?: string | null;
  avatarUrl?: string | null;
}) {
  const style = RARITY_STYLES[rarity];
  const canFlip = games.length > 0 || !!about;

  const front = (
    <div
      className={`w-full h-full rounded-2xl border-2 ${style.border} ${style.glow} bg-gray-900 overflow-hidden flex flex-col`}
    >
      <span
        className={`absolute top-2 right-2 z-10 ${style.label} text-white text-xs font-bold px-2 py-1 rounded-full`}
      >
        {style.text}
      </span>

      <div className="w-full h-36 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center overflow-hidden">
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl">🏢</span>
        )}
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">Studio</span>
        <h3 className="text-white font-bold text-lg leading-tight">{name}</h3>
        <p className="text-gray-400 text-xs leading-snug flex-1">
          {gameCount} jeu{gameCount > 1 ? "x" : ""} en base
        </p>

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
          <p className="text-center text-gray-600 text-[10px] mt-1">Cliquer pour voir les jeux</p>
        )}
      </div>
    </div>
  );

  const back = (
    <div
      className={`w-full h-full rounded-2xl border-2 ${style.border} ${style.glow} bg-gray-900 flex flex-col p-4 gap-2`}
    >
      <h3 className="text-white font-bold text-base leading-tight truncate">{name}</h3>
      {about && (
        <p className="text-gray-400 text-xs leading-snug line-clamp-3 border-b border-gray-800 pb-2">{about}</p>
      )}
      <p className="text-gray-500 text-[10px] uppercase">Jeux sur Steam ({games.length})</p>
      <div className="flex-1 overflow-y-auto flex flex-col gap-1">
        {games.map((g) =>
          g.hasCard && g.appid ? (
            <Link
              key={g.name}
              href={`/toutes-les-cartes#card-GAME-${g.appid}`}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-800 text-blue-400 hover:text-blue-300 hover:underline text-xs rounded-lg px-2 py-1.5 truncate"
            >
              {g.name}
            </Link>
          ) : (
            <div key={g.name} className="bg-gray-800 text-gray-300 text-xs rounded-lg px-2 py-1.5 truncate">
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
