"use client";
import { useEffect, useMemo, useState } from "react";
import { GameCard } from "@/components/GameCard";
import { StudioCard } from "@/components/StudioCard";

type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
type TypeFilter = "ALL" | "GAME" | "DLC" | "STUDIO";
type SortKey = "name" | "rarity" | "atk" | "def" | "ownerEstimate" | "copies";
type SortDir = "asc" | "desc";

const RARITY_ORDER: Record<Rarity, number> = { LEGENDARY: 0, EPIC: 1, RARE: 2, UNCOMMON: 3, COMMON: 4 };
const RARITY_LABEL: Record<Rarity, string> = { COMMON: "⚪ Commun", UNCOMMON: "🟢 Peu commun", RARE: "🔵 Rare", EPIC: "🟣 Épique", LEGENDARY: "🟠 Légendaire" };

type Item = {
  type: "GAME" | "STUDIO";
  contentType?: "GAME" | "DLC";
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

export default function ToutesLesCartesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [rarityFilter, setRarityFilter] = useState<Rarity | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("rarity");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [shown, setShown] = useState(60);
  useEffect(() => { setShown(60); }, [search, typeFilter, rarityFilter, sortKey, sortDir, view]);

  useEffect(() => {
    fetch("/api/cards")
      .then((r) => r.json())
      .then((data) => { setItems(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = items.filter((item) => {
      if (typeFilter === "STUDIO" && item.type !== "STUDIO") return false;
      if (typeFilter === "GAME" && (item.type !== "GAME" || item.contentType !== "GAME")) return false;
      if (typeFilter === "DLC" && (item.type !== "GAME" || item.contentType !== "DLC")) return false;
      if (rarityFilter !== "ALL" && item.rarity !== rarityFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!item.name.toLowerCase().includes(q) && !(item.tags ?? []).some((t) => t.toLowerCase().includes(q))) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "rarity") cmp = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
      else if (sortKey === "name") cmp = a.name.localeCompare(b.name, "fr");
      else if (sortKey === "atk") cmp = a.atk - b.atk;
      else if (sortKey === "def") cmp = a.def - b.def;
      else if (sortKey === "ownerEstimate") cmp = a.ownerEstimate - b.ownerEstimate;
      else if (sortKey === "copies") cmp = a.copies - b.copies;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [items, typeFilter, rarityFilter, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="steam-main min-h-screen pb-16">
      <div className="max-w-7xl mx-auto px-4 pt-6">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold text-amber-200 flex-1">Toutes les cartes</h1>
          <button onClick={() => setView("grid")} className={`px-3 py-1.5 rounded text-sm border transition ${view === "grid" ? "border-amber-500 text-amber-200" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>🃏 Grille</button>
          <button onClick={() => setView("list")} className={`px-3 py-1.5 rounded text-sm border transition ${view === "list" ? "border-amber-500 text-amber-200" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>☰ Liste</button>
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap gap-2 mb-5">
          <input
            type="text" placeholder="Rechercher…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm w-48 focus:border-amber-500 outline-none"
          />
          {(["ALL", "GAME", "DLC", "STUDIO"] as TypeFilter[]).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-2 rounded-lg text-sm border transition ${typeFilter === t ? "border-amber-500 bg-amber-950/40 text-amber-200" : "border-gray-700 text-gray-400 hover:border-gray-600"}`}>
              {t === "ALL" ? "Tous" : t}
            </button>
          ))}
          <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value as Rarity | "ALL")}
            className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none">
            <option value="ALL">Toutes raretés</option>
            {(["LEGENDARY", "EPIC", "RARE", "UNCOMMON", "COMMON"] as Rarity[]).map((r) => (
              <option key={r} value={r}>{RARITY_LABEL[r]}</option>
            ))}
          </select>
          <select value={`${sortKey}_${sortDir}`} onChange={(e) => { const [k, d] = e.target.value.split("_"); setSortKey(k as SortKey); setSortDir(d as SortDir); }}
            className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 py-2 text-sm focus:border-amber-500 outline-none">
            <option value="rarity_asc">Rareté ↑</option>
            <option value="rarity_desc">Rareté ↓</option>
            <option value="name_asc">Nom A→Z</option>
            <option value="name_desc">Nom Z→A</option>
            <option value="atk_desc">ATK ↓</option>
            <option value="def_desc">DEF ↓</option>
            <option value="copies_desc">Copies ↓</option>
            <option value="ownerEstimate_desc">Popularité ↓</option>
          </select>
          <span className="text-gray-500 text-sm self-center">{loading ? "Chargement…" : `${filtered.length} cartes`}</span>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-20">Chargement du catalogue…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 text-center py-20">Aucune carte trouvée.</p>
        ) : view === "grid" ? (
          <div className="flex flex-wrap gap-6 justify-center">
            {filtered.slice(0, shown).map((item) =>
              item.type === "STUDIO" ? (
                <StudioCard
                  key={item.id}
                  name={item.name}
                  rarity={item.rarity}
                  atk={item.atk}
                  def={item.def}
                  ownerEstimate={item.ownerEstimate}
                  reviewScore={item.reviewScore}
                  gameCount={item.gameCount ?? 0}
                  games={item.games ?? []}
                  about={item.about ?? undefined}
                  avatarUrl={item.avatarUrl ?? undefined}
                />
              ) : (
                <GameCard
                  key={item.id}
                  id={item.id}
                  name={item.name}
                  headerImage={item.headerImage ?? ""}
                  description={item.description ?? ""}
                  rarity={item.rarity}
                  atk={item.atk}
                  def={item.def}
                  ownerEstimate={item.ownerEstimate}
                  reviewScore={item.reviewScore}
                  peakCcu={item.peakCcu}
                  priceCents={item.priceCents}
                  isFree={item.isFree}
                  tags={item.tags}
                  developers={item.developers}
                  contentType={item.contentType ?? "GAME"}
                />
              )
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-950/80 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left cursor-pointer hover:text-gray-300" onClick={() => toggleSort("name")}>Nom{sortArrow("name")}</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left cursor-pointer hover:text-gray-300" onClick={() => toggleSort("rarity")}>Rareté{sortArrow("rarity")}</th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:text-gray-300" onClick={() => toggleSort("atk")}>ATK{sortArrow("atk")}</th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:text-gray-300" onClick={() => toggleSort("def")}>DEF{sortArrow("def")}</th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:text-gray-300" onClick={() => toggleSort("copies")}>Copies{sortArrow("copies")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, shown).map((item) => (
                  <tr key={item.id} className="border-t border-gray-800 hover:bg-gray-800/40 transition">
                    <td className="px-4 py-3 font-medium text-white">
                      {item.headerImage && <img src={item.headerImage} alt="" className="inline-block w-8 h-5 object-cover rounded mr-2 align-middle" />}
                      {item.name}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{item.type === "STUDIO" ? "Studio" : item.contentType === "DLC" ? "DLC" : "Jeu"}</td>
                    <td className="px-4 py-3">{RARITY_LABEL[item.rarity]}</td>
                    <td className="px-4 py-3 text-right font-mono text-amber-200">{item.atk}</td>
                    <td className="px-4 py-3 text-right font-mono text-blue-300">{item.def}</td>
                    <td className="px-4 py-3 text-right text-gray-400">{item.copies.toLocaleString("fr-FR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length > shown && (
          <div className="mt-6 text-center">
            <button type="button" onClick={() => setShown((n) => n + 120)} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800">
              Afficher plus ({shown} / {filtered.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
