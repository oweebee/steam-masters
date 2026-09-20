"use client";
import { useEffect, useMemo, useState } from "react";

type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

type Item = {
  type: "GAME" | "STUDIO";
  id: string;
  name: string;
  headerImage: string | null;
  rarity: Rarity;
  atk: number;
  def: number;
  ownerEstimate: number;
  reviewScore: number;
  tags: string[];
  developers: string[];
  gameCount?: number;
  claimedBy: string | null;
  updatedAt: string;
};

const RARITY_ORDER: Record<Rarity, number> = {
  LEGENDARY: 0,
  EPIC: 1,
  RARE: 2,
  UNCOMMON: 3,
  COMMON: 4,
};

const RARITY_COLOR: Record<Rarity, string> = {
  COMMON: "text-gray-400",
  UNCOMMON: "text-green-400",
  RARE: "text-blue-400",
  EPIC: "text-purple-400",
  LEGENDARY: "text-amber-400",
};

type SortKey = "name" | "rarity" | "atk" | "def" | "ownerEstimate" | "reviewScore" | "updatedAt";
type SortDir = "asc" | "desc";
type TypeFilter = "ALL" | "GAME" | "STUDIO";
type ClaimFilter = "ALL" | "CLAIMED" | "FREE";

export default function AdminCardsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [claimFilter, setClaimFilter] = useState<ClaimFilter>("ALL");
  const [rarityFilter, setRarityFilter] = useState<Rarity | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    fetch("/api/admin/cards")
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
      if (claimFilter === "CLAIMED" && !it.claimedBy) return false;
      if (claimFilter === "FREE" && it.claimedBy) return false;
      return true;
    });

    out = out.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "rarity": cmp = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]; break;
        case "atk": cmp = a.atk - b.atk; break;
        case "def": cmp = a.def - b.def; break;
        case "ownerEstimate": cmp = a.ownerEstimate - b.ownerEstimate; break;
        case "reviewScore": cmp = a.reviewScore - b.reviewScore; break;
        case "updatedAt": cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return out;
  }, [items, search, typeFilter, rarityFilter, claimFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  return (
    <div className="min-h-screen bg-gray-950 p-8">
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
          value={claimFilter}
          onChange={(e) => setClaimFilter(e.target.value as ClaimFilter)}
          className="bg-gray-900 border border-gray-800 text-white rounded-lg px-3 py-2 outline-none"
        >
          <option value="ALL">Réclamée ou non</option>
          <option value="CLAIMED">Réclamée</option>
          <option value="FREE">Libre (pool)</option>
        </select>
      </div>

      <div className="overflow-x-auto border border-gray-800 rounded-xl">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-900 text-gray-400 select-none">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("name")}>
                Nom{sortIndicator("name")}
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("rarity")}>
                Rareté{sortIndicator("rarity")}
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("atk")}>
                ATK{sortIndicator("atk")}
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("def")}>
                DEF (possesseurs est.){sortIndicator("def")}
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("updatedAt")}>
                Maj{sortIndicator("updatedAt")}
              </th>
              <th className="px-4 py-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => (
              <tr key={`${it.type}-${it.id}`} className="border-t border-gray-800 hover:bg-gray-900/50">
                <td className="px-4 py-2 text-gray-400">{it.type === "GAME" ? "🎮 Jeu" : "🏢 Studio"}</td>
                <td className="px-4 py-2 text-white font-medium">{it.name}</td>
                <td className={`px-4 py-2 font-semibold ${RARITY_COLOR[it.rarity]}`}>{it.rarity}</td>
                <td className="px-4 py-2 text-red-400">{it.atk}</td>
                <td className="px-4 py-2 text-blue-400">{it.def.toLocaleString("fr-FR")}</td>
                <td className="px-4 py-2 text-gray-500">{new Date(it.updatedAt).toLocaleDateString("fr-FR")}</td>
                <td className="px-4 py-2">
                  {it.claimedBy ? (
                    <span className="text-amber-400">réclamée par {it.claimedBy}</span>
                  ) : (
                    <span className="text-green-500">libre</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  Aucune carte ne correspond aux filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
