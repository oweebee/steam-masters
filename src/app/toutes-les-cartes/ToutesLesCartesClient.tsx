"use client";
import { useEffect, useMemo, useState } from "react";
import { GameCard } from "@/components/GameCard";
import { StudioCard } from "@/components/StudioCard";

type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

type Item = {
  type: "GAME" | "STUDIO";
  id: string;
  name: string;
  headerImage: string | null;
  description?: string;
  rarity: Rarity;
  atk: number;
  def: number;
  ownerEstimate: number;
  reviewScore: number;
  peakCcu?: number;
  priceCents?: number | null;
  isFree?: boolean;
  tags: string[];
  developers: string[];
  gameCount?: number;
  games?: { name: string; appid: string | null; hasCard: boolean }[];
  about?: string | null;
  avatarUrl?: string | null;
  copies: number;
  updatedAt: string;
};

const RARITY_ORDER: Record<Rarity, number> = {
  LEGENDARY: 0,
  EPIC: 1,
  RARE: 2,
  UNCOMMON: 3,
  COMMON: 4,
};

type SortKey = "name" | "rarity" | "atk" | "def";
type SortDir = "asc" | "desc";
type TypeFilter = "ALL" | "GAME" | "STUDIO";

export function ToutesLesCartesClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [rarityFilter, setRarityFilter] = useState<Rarity | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("rarity");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    fetch("/api/cards")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setItems(data);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = items.filter((it) => {
      if (q && !it.name.toLowerCase().includes(q) && !it.developers.some((d) => d.toLowerCase().includes(q))) return false;
      if (typeFilter !== "ALL" && it.type !== typeFilter) return false;
      if (rarityFilter !== "ALL" && it.rarity !== rarityFilter) return false;
      return true;
    });

    out = out.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "rarity": cmp = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]; break;
        case "atk": cmp = a.atk - b.atk; break;
        case "def": cmp = a.def - b.def; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return out;
  }, [items, search, typeFilter, rarityFilter, sortKey, sortDir]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Toutes les cartes</h1>
      <p className="text-gray-500 text-sm mb-6">
        {loading ? "Chargement…" : `${filtered.length} / ${items.length} carte(s)`}
      </p>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          placeholder="Rechercher (nom du jeu / studio)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-gray-900 border border-gray-800 text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 min-w-[260px]"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          className="bg-gray-900 border border-gray-800 text-white rounded-lg px-3 py-2 outline-none"
        >
          <option value="ALL">Tous types</option>
          <option value="GAME">Jeux</option>
          <option value="STUDIO">Studios</option>
        </select>
        <select
          value={rarityFilter}
          onChange={(e) => setRarityFilter(e.target.value as Rarity | "ALL")}
          className="bg-gray-900 border border-gray-800 text-white rounded-lg px-3 py-2 outline-none"
        >
          <option value="ALL">Toutes raretés</option>
          <option value="LEGENDARY">Légendaire</option>
          <option value="EPIC">Épique</option>
          <option value="RARE">Rare</option>
          <option value="UNCOMMON">Peu commune</option>
          <option value="COMMON">Commune</option>
        </select>
        <select
          value={`${sortKey}-${sortDir}`}
          onChange={(e) => {
            const [k, d] = e.target.value.split("-") as [SortKey, SortDir];
            setSortKey(k);
            setSortDir(d);
          }}
          className="bg-gray-900 border border-gray-800 text-white rounded-lg px-3 py-2 outline-none"
        >
          <option value="rarity-asc">Rareté (légendaire → commune)</option>
          <option value="rarity-desc">Rareté (commune → légendaire)</option>
          <option value="name-asc">Nom (A→Z)</option>
          <option value="name-desc">Nom (Z→A)</option>
          <option value="atk-desc">ATK (haut → bas)</option>
          <option value="def-desc">DEF (haut → bas)</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-6">
        {filtered.map((it) =>
          it.type === "GAME" ? (
            <div key={`GAME-${it.id}`} id={`card-GAME-${it.id}`}>
              <GameCard
                id={it.id}
                name={it.name}
                headerImage={it.headerImage ?? ""}
                description={it.description ?? ""}
                atk={it.atk}
                def={it.def}
                rarity={it.rarity}
                tags={it.tags}
                developers={it.developers}
                reviewScore={it.reviewScore}
                peakCcu={it.peakCcu}
                ownerEstimate={it.ownerEstimate}
                priceCents={it.priceCents}
                isFree={it.isFree}
              />
            </div>
          ) : (
            <div key={`STUDIO-${it.id}`} id={`card-STUDIO-${it.id}`}>
              <StudioCard
                name={it.name}
                gameCount={it.gameCount ?? 0}
                atk={it.atk}
                def={it.def}
                rarity={it.rarity}
                games={it.games ?? []}
                about={it.about}
                avatarUrl={it.avatarUrl}
              />
            </div>
          )
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-gray-500 text-sm">Aucune carte ne correspond aux filtres.</p>
        )}
      </div>
    </div>
  );
}
