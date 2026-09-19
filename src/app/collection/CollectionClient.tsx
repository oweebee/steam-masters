"use client";
import { useEffect, useState } from "react";
import { GameCard } from "@/components/GameCard";

type Card = {
  id: string;
  game: {
    id: string;
    name: string;
    headerImage: string;
    description: string;
    atk: number;
    def: number;
    rarity: "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
    tags: string[];
  };
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
        {cards.map((c) => (
          <GameCard
            key={c.id}
            name={c.game.name}
            headerImage={c.game.headerImage}
            description={c.game.description}
            atk={c.game.atk}
            def={c.game.def}
            rarity={c.game.rarity}
            tags={c.game.tags}
          />
        ))}
        {loaded && cards.length === 0 && (
          <p className="text-gray-500 text-sm">Aucune carte pour l'instant — ouvre un paquet !</p>
        )}
      </div>
    </div>
  );
}
