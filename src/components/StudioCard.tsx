"use client";
import Link from "next/link";
import { FlipCard } from "./FlipCard";
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
  const canFlip = games.length > 0 || !!about;
  // Logo vérifié saisi par l'admin en priorité ; sinon image officielle Steam
  // d'un jeu importé de ce studio. Aucun visuel n'est inventé.
  const displayImage = avatarUrl ?? coverImage ?? games.find((game) => game.headerImage)?.headerImage ?? null;

  const front = (
    <div
      className={`steam-card-shell w-full h-full rounded-2xl border-2 ${style.border} ${style.glow} bg-gray-900 overflow-hidden flex flex-col`}
    >
      <div className="steam-card-visual w-full h-36 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center overflow-hidden">
        {displayImage ? (
          <img src={displayImage} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl">🏢</span>
        )}
      </div>

      <div className="steam-card-content p-4 flex flex-col gap-2 flex-1">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">Studio</span>
        <div className="steam-card-nameplate">
          <h3 className="steam-card-title text-white font-bold text-lg leading-tight">{name}</h3>
        </div>
        <p className="text-gray-400 text-xs leading-snug flex-1 line-clamp-3">
          {games.length > 0 ? games.map((game) => game.name).join(" • ") : "Aucun jeu associé"}
        </p>

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
          <p className="text-center text-gray-600 text-[10px] mt-1">Cliquer pour voir les jeux</p>
        )}
      </div>
    </div>
  );

  const back = (
    <div
      className={`steam-card-shell w-full h-full rounded-2xl border-2 ${style.border} ${style.glow} bg-gray-900 flex flex-col p-4 gap-2`}
    >
      <div className="steam-card-nameplate">
        <h3 className="steam-card-title text-white font-bold text-base leading-tight truncate">{name}</h3>
      </div>
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
