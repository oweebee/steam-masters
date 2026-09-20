"use client";
import { useEffect, useState } from "react";
import { GameCard } from "@/components/GameCard";
import { StudioCard } from "@/components/StudioCard";

type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

type Card = {
  id: string;
  game: {
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
  } | null;
  studio: {
    id: string;
    name: string;
    gameCount: number;
    atk: number;
    def: number;
    rarity: Rarity;
    games: { name: string; appid: string | null; hasCard: boolean }[];
    about: string | null;
    avatarUrl: string | null;
  } | null;
};

export function CollectionClient() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/collection")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setCards(data);
        setLoaded(true);
      });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Ma collection ({cards.length})</h1>
      <div className="flex flex-wrap gap-6">
        {cards.map((c) =>
          c.game ? (
            <GameCard
              key={c.id}
              id={c.game.id}
              name={c.game.name}
              headerImage={c.game.headerImage}
              description={c.game.description}
              atk={c.game.atk}
              def={c.game.def}
              rarity={c.game.rarity}
              tags={c.game.tags}
              developers={c.game.developers}
              reviewScore={c.game.reviewScore}
              peakCcu={c.game.peakCcu}
              ownerEstimate={c.game.ownerEstimate}
              priceCents={c.game.priceCents}
              isFree={c.game.isFree}
            />
          ) : c.studio ? (
            <StudioCard
              key={c.id}
              name={c.studio.name}
              gameCount={c.studio.gameCount}
              atk={c.studio.atk}
              def={c.studio.def}
              rarity={c.studio.rarity}
              games={c.studio.games}
              about={c.studio.about}
              avatarUrl={c.studio.avatarUrl}
            />
          ) : null
        )}
        {loaded && cards.length === 0 && (
          <p className="text-gray-500 text-sm">Aucune carte pour l'instant — ouvre un paquet !</p>
        )}
      </div>
    </div>
  );
}
