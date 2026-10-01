"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { GameCard } from "@/components/GameCard";
import { StudioCard } from "@/components/StudioCard";
import { usePlatformNames } from "@/lib/usePlatformNames";

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
  source?: "STEAM" | "IGDB";
  platforms?: string[];
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
  const [platformFilter, setPlatformFilter] = useState<string>("ALL");
  const [shown, setShown] = useState(60);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [watchBusy, setWatchBusy] = useState<Set<string>>(new Set());

  useEffect(() => { setShown(60); }, [search, typeFilter, rarityFilter, sortKey, sortDir, view, platformFilter]);

  useEffect(() => {
    fetch("/api/cards")
      .then((r) => r.json())
      .then((data) => { setItems(data); setLoading(false); })
      .catch(() => setLoading(false));
    fetch("/api/card-watch")
      .then((r) => r.json())
      .then((data: { gameId?: string | null; studioId?: string | null }[]) => {
        const ids = new Set<string>();
        for (const w of data) {
          if (w.gameId) ids.add(w.gameId);
          if (w.studioId) ids.add(w.studioId);
        }
        setWatchedIds(ids);
      })
      .catch(() => {});
  }, []);

  const toggleWatch = useCallback(async (item: Item) => {
    const key = item.id;
    if (watchBusy.has(key)) return;
    setWatchBusy((s) => new Set([...s, key]));
    try {
      const body = item.type === "STUDIO" ? { studioId: item.id } : { gameId: item.id };
      const r = await fetch("/api/card-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      setWatchedIds((prev) => {
        const next = new Set(prev);
        if (data.watching) next.add(key); else next.delete(key);
        return next;
      });
    } catch {}
    setWatchBusy((s) => { const n = new Set(s); n.delete(key); return n; });
  }, [watchBusy]);

  const platformName = usePlatformNames();
  const allPlatforms = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) for (const p of (it.platforms ?? [])) s.add(p);
    return Array.from(s).sort((a, b) => platformName(a).localeCompare(platformName(b), "fr"));
  }, [items, platformName]);

  const filtered = useMemo(() => {
    let list = items.filter((item) => {
      if (typeFilter === "STUDIO" && item.type !== "STUDIO") return false;
      if (typeFilter === "GAME" && (item.type !== "GAME" || item.contentType !== "GAME")) return false;
      if (typeFilter === "DLC" && (item.type !== "GAME" || item.contentType !== "DLC")) return false;
      if (rarityFilter !== "ALL" && item.rarity !== rarityFilter) return false;
      if (platformFilter !== "ALL" && !(item.platforms ?? []).includes(platformFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!item.name.toLowerCase().includes(q) && !(item.tags ?? []).some((t) => t.toLowerCase().includes(q))) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      // Watched items first
      const aW = watchedIds.has(a.id) ? 0 : 1;
      const bW = watchedIds.has(b.id) ? 0 : 1;
      if (aW !== bW) return aW - bW;

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
  }, [items, typeFilter, rarityFilter, search, sortKey, sortDir, watchedIds, platformFilter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  function WatchBtn({ item }: { item: Item }) {
    const watched = watchedIds.has(item.id);
    const busy = watchBusy.has(item.id);
    const [anim, setAnim] = useState("");

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      setAnim(watched ? "anim-out" : "anim-in");
      void toggleWatch(item);
    };

    return (
      <button
        type="button"
        title={watched ? "Ne plus suivre" : "Suivre cette carte"}
        disabled={busy}
        onClick={handleClick}
        className={`watch-gem-socket ${watched ? "is-watched" : ""}`}
      >
        <svg className="watch-socket-mechanics" viewBox="0 0 32 32" aria-hidden="true">
          <circle className="watch-socket-ring" cx="16" cy="16" r="14.15" />
          <circle className="watch-socket-detail" cx="16" cy="16" r="11.95" />
          <path className="watch-socket-notch" d="M10.4 3.15h11.2M10.4 28.85h11.2M3.15 10.4v11.2M28.85 10.4v11.2" />
          <circle className="watch-socket-bolt" cx="16" cy="4.35" r="1.05" /><circle className="watch-socket-bolt" cx="27.65" cy="16" r="1.05" /><circle className="watch-socket-bolt" cx="16" cy="27.65" r="1.05" /><circle className="watch-socket-bolt" cx="4.35" cy="16" r="1.05" />
          <g className="watch-socket-clamps"><path d="M10.8 4.9h3.05l2.15 2.15 2.15-2.15h3.05" /><path d="M27.1 10.8v3.05L24.95 16l2.15 2.15v3.05" /><path d="M21.2 27.1h-3.05L16 24.95l-2.15 2.15h-3.05" /><path d="M4.9 21.2v-3.05L7.05 16 4.9 13.85V10.8" /></g>
        </svg>
        <span
          className={`watch-gem ${anim}`}
          onAnimationEnd={() => setAnim("")}
        >
          <svg className="watch-faceted-gem" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="watchGemRed" x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse"><stop stopColor="#fff9f5"/><stop offset=".12" stopColor="#ffb4a8"/><stop offset=".31" stopColor="#ef3035"/><stop offset=".62" stopColor="#a30712"/><stop offset="1" stopColor="#300006"/></linearGradient><radialGradient id="watchGemLight" cx=".25" cy=".16" r=".75"><stop stopColor="#fff" stopOpacity=".95"/><stop offset=".18" stopColor="#ffd7d3" stopOpacity=".52"/><stop offset=".58" stopColor="#ff3138" stopOpacity="0"/></radialGradient></defs><path d="M16 2.3 26.6 8.8 29 18.2 16 29.7 3 18.2 5.4 8.8Z" fill="url(#watchGemRed)" stroke="#ffd0c8" strokeOpacity=".95" strokeWidth=".8"/><path d="m16 2.3 5.1 7-5.1 5.55-5.1-5.55z" fill="#ffe1db" fillOpacity=".68"/><path d="m5.4 8.8 5.5.5 5.1 5.55L3 18.2z" fill="#ff6965" fillOpacity=".72"/><path d="m26.6 8.8-5.5.5-5.1 5.55 13 3.35z" fill="#78000c" fillOpacity=".78"/><path d="m3 18.2 13-3.35-3.1 11.7z" fill="#d20a16" fillOpacity=".86"/><path d="m29 18.2-13-3.35 3.1 11.7z" fill="#540008" fillOpacity=".9"/><path d="m10.9 9.3 5.1 5.55-3.1 11.7-5.2-8.35z" fill="#f52229" fillOpacity=".58"/><path d="m21.1 9.3-5.1 5.55 3.1 11.7 5.2-8.35z" fill="#72000b" fillOpacity=".7"/><path d="M16 2.3 5.4 8.8 3 18.2 16 29.7 29 18.2 26.6 8.8Z" fill="url(#watchGemLight)"/><ellipse cx="10.7" cy="7.35" rx="4.2" ry="1.55" fill="#fff" fillOpacity=".78" transform="rotate(-30 10.7 7.35)"/><circle cx="8.45" cy="10.15" r="1" fill="#fff" fillOpacity=".92"/></svg>
          <svg viewBox="0 0 30 30" width="30" height="30" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="gemBase" cx="45%" cy="40%" r="55%"><stop offset="0%" stopColor="#ff6b6b" stopOpacity="0.95"/><stop offset="35%" stopColor="#dc2626" stopOpacity="0.85"/><stop offset="70%" stopColor="#991b1b" stopOpacity="0.75"/><stop offset="100%" stopColor="#450a0a" stopOpacity="0.65"/></radialGradient><radialGradient id="gemGlow" cx="50%" cy="50%" r="50%"><stop offset="50%" stopColor="rgba(255,60,60,0)" /><stop offset="100%" stopColor="rgba(255,40,40,0.5)"/></radialGradient><linearGradient id="facetHL" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="rgba(255,255,255,0.6)"/><stop offset="100%" stopColor="rgba(255,255,255,0)"/></linearGradient></defs><circle cx="15" cy="15" r="14.5" fill="url(#gemGlow)"/><circle cx="15" cy="15" r="13" fill="url(#gemBase)" stroke="rgba(255,100,100,0.4)" strokeWidth="0.5"/><polygon points="15,2 19.5,6 15,15" fill="rgba(255,180,180,0.3)"/><polygon points="15,2 10.5,6 15,15" fill="rgba(255,140,140,0.2)"/><polygon points="19.5,6 26,9 15,15" fill="rgba(255,120,120,0.15)"/><polygon points="10.5,6 4,9 15,15" fill="rgba(255,200,200,0.25)"/><polygon points="26,9 28,15 15,15" fill="rgba(200,50,50,0.12)"/><polygon points="4,9 2,15 15,15" fill="rgba(255,160,160,0.18)"/><polygon points="28,15 26,21 15,15" fill="rgba(180,30,30,0.1)"/><polygon points="2,15 4,21 15,15" fill="rgba(255,100,100,0.12)"/><polygon points="26,21 19.5,24 15,15" fill="rgba(150,20,20,0.1)"/><polygon points="4,21 10.5,24 15,15" fill="rgba(200,60,60,0.1)"/><polygon points="19.5,24 15,28 15,15" fill="rgba(120,10,10,0.08)"/><polygon points="10.5,24 15,28 15,15" fill="rgba(160,40,40,0.1)"/><polygon points="15,2 19.5,6 15,15" fill="url(#facetHL)" opacity="0.5"/><polygon points="15,2 10.5,6 15,15" fill="url(#facetHL)" opacity="0.3"/><circle cx="15" cy="15" r="13" fill="none" stroke="rgba(255,150,150,0.15)" strokeWidth="0.3"/><line x1="15" y1="2" x2="15" y2="15" stroke="rgba(255,200,200,0.12)" strokeWidth="0.3"/><line x1="19.5" y1="6" x2="15" y2="15" stroke="rgba(255,200,200,0.1)" strokeWidth="0.3"/><line x1="10.5" y1="6" x2="15" y2="15" stroke="rgba(255,200,200,0.1)" strokeWidth="0.3"/><line x1="26" y1="9" x2="15" y2="15" stroke="rgba(255,200,200,0.08)" strokeWidth="0.3"/><line x1="4" y1="9" x2="15" y2="15" stroke="rgba(255,200,200,0.08)" strokeWidth="0.3"/><line x1="28" y1="15" x2="15" y2="15" stroke="rgba(255,200,200,0.06)" strokeWidth="0.3"/><line x1="2" y1="15" x2="15" y2="15" stroke="rgba(255,200,200,0.06)" strokeWidth="0.3"/><line x1="26" y1="21" x2="15" y2="15" stroke="rgba(255,200,200,0.06)" strokeWidth="0.3"/><line x1="4" y1="21" x2="15" y2="15" stroke="rgba(255,200,200,0.06)" strokeWidth="0.3"/><line x1="19.5" y1="24" x2="15" y2="15" stroke="rgba(255,200,200,0.06)" strokeWidth="0.3"/><line x1="10.5" y1="24" x2="15" y2="15" stroke="rgba(255,200,200,0.06)" strokeWidth="0.3"/><line x1="15" y1="28" x2="15" y2="15" stroke="rgba(255,200,200,0.06)" strokeWidth="0.3"/><ellipse cx="11" cy="8" rx="4" ry="2.5" fill="rgba(255,255,255,0.25)" transform="rotate(-20 11 8)"/><circle cx="9" cy="7" r="1.5" fill="rgba(255,255,255,0.4)"/><circle cx="11.5" cy="5.5" r="0.7" fill="rgba(255,255,255,0.5)"/></svg>
        </span>
      </button>
    );
  }

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-7xl mx-auto px-0 sm:px-4 pt-1 sm:pt-6">
        <div className="flex items-center gap-2 mb-3 sm:mb-6">
          <h1 className="text-lg sm:text-2xl font-bold text-amber-200 min-w-0 truncate">Toutes les cartes</h1>
          <span className="sm:hidden flex-1 min-w-0 truncate text-[11px] text-stone-500">{loading ? "…" : filtered.length}{watchedIds.size > 0 && <span className="ml-1 text-amber-400">💎{watchedIds.size}</span>}</span>
          <span className="hidden sm:block flex-1" />
          <button onClick={() => setView("grid")} aria-label="Vue grille" className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded text-sm border transition ${view === "grid" ? "border-amber-500 text-amber-200" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>🃏<span className="hidden sm:inline"> Grille</span></button>
          <button onClick={() => setView("list")} aria-label="Vue liste" className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded text-sm border transition ${view === "list" ? "border-amber-500 text-amber-200" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>☰<span className="hidden sm:inline"> Liste</span></button>
        </div>

        <div className="steam-collection-filters">
          <label className="steam-collection-search"><span aria-hidden="true">⌕</span><input
            type="text" placeholder="Rechercher…" value={search}
            onChange={(e) => setSearch(e.target.value)}
          /></label>
          <label className="steam-filter-select steam-type-select" data-prefix="▦"><span>Type</span><select aria-label="Type de carte" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}>
            <option value="ALL">Tous</option><option value="GAME">Jeux</option><option value="DLC">DLC</option><option value="STUDIO">Studios</option>
          </select></label>
          <div className="steam-type-seg" role="group" aria-label="Type de carte">
          {(["ALL", "GAME", "DLC", "STUDIO"] as TypeFilter[]).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)} aria-pressed={typeFilter === t}
              className={`px-3 py-2 rounded-lg text-sm border transition ${typeFilter === t ? "border-amber-500 bg-amber-950/40 text-amber-200" : "border-gray-700 text-gray-400 hover:border-gray-600"}`}>
              {t === "ALL" ? "Tous" : t === "GAME" ? "Jeux" : t === "DLC" ? "DLC" : "Studios"}
            </button>
          ))}
          </div>
          <label className="steam-filter-select" data-prefix="◆"><span>Rareté</span><select aria-label="Rareté" value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value as Rarity | "ALL")}>
            <option value="ALL">Toutes</option>
            {(["LEGENDARY", "EPIC", "RARE", "UNCOMMON", "COMMON"] as Rarity[]).map((r) => (
              <option key={r} value={r}>{RARITY_LABEL[r]}</option>
            ))}
          </select></label>
          {allPlatforms.length > 0 && (
            <label className="steam-filter-select" data-prefix="🎮"><span>Plateforme</span><select aria-label="Plateforme" value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
              <option value="ALL">Toutes</option>
              {allPlatforms.map((p) => <option key={p} value={p}>{platformName(p)}</option>)}
            </select></label>
          )}
          <label className="steam-filter-select" data-prefix="⇅"><span>Trier</span><select aria-label="Trier" value={`${sortKey}_${sortDir}`} onChange={(e) => { const [k, d] = e.target.value.split("_"); setSortKey(k as SortKey); setSortDir(d as SortDir); }}>
            <option value="rarity_asc">Rareté ↑</option>
            <option value="rarity_desc">Rareté ↓</option>
            <option value="name_asc">Nom A→Z</option>
            <option value="name_desc">Nom Z→A</option>
            <option value="atk_desc">ATK ↓</option>
            <option value="def_desc">DEF ↓</option>
            <option value="copies_desc">Copies ↓</option>
            <option value="ownerEstimate_desc">Popularité ↓</option>
          </select></label>
          <small>
            {loading ? "Chargement…" : `${filtered.length} cartes`}
            {watchedIds.size > 0 && <span className="ml-2 text-amber-400">💎 {watchedIds.size} suivie(s)</span>}
          </small>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-20">Chargement du catalogue…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 text-center py-20">Aucune carte trouvée.</p>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.slice(0, shown).map((item) => (
              <div key={item.id} className="watch-card-wrap h-[26rem]">
                <WatchBtn item={item} />
                {item.type === "STUDIO" ? (
                  <StudioCard
                    name={item.name}
                    rarity={item.rarity}
                    atk={item.atk}
                    def={item.def}
                    gameCount={item.gameCount ?? 0}
                    games={item.games ?? []}
                    about={item.about ?? undefined}
                    avatarUrl={item.avatarUrl ?? undefined}
                  />
                ) : (
                  <GameCard
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
                    source={item.source}
                    platforms={item.platforms}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-950/80 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">💎</th>
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
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void toggleWatch(item)}
                        disabled={watchBusy.has(item.id)}
                        className="text-base leading-none"
                        title={watchedIds.has(item.id) ? "Ne plus suivre" : "Suivre"}
                      >
                        watchedIds.has(item.id) ? "💎" : "◇"
                      </button>
                    </td>
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
