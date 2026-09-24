"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { GameCard } from "@/components/GameCard";
import { StudioCard } from "@/components/StudioCard";

type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

type Instance = { id: string; username: string; rarity: Rarity; atk: number };

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
  instances: Instance[];
  updatedAt: string;
};

type ViewMode = "list" | "cards";

const RARITY_ORDER: Record<Rarity, number> = {
  LEGENDARY: 0,
  EPIC: 1,
  RARE: 2,
  UNCOMMON: 3,
  COMMON: 4,
};

const RARITY_COLOR: Record<Rarity, string> = {
  COMMON: "text-gray-300",
  UNCOMMON: "text-green-400",
  RARE: "text-blue-400",
  EPIC: "text-purple-400",
  LEGENDARY: "text-orange-400",
};

const RARITY_LABEL: Record<Rarity, string> = {
  COMMON: "⚪ Blanc",
  UNCOMMON: "🟢 Vert",
  RARE: "🔵 Bleu",
  EPIC: "🟣 Violet",
  LEGENDARY: "🟠 Orange",
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
  const [view, setView] = useState<ViewMode>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAbout, setEditAbout] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingInstanceId, setSavingInstanceId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/cards")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setItems(data);
        setLoading(false);
      });
  }, []);

  function startEdit(it: Item) {
    setEditingId(it.id);
    setEditAbout(it.about ?? "");
    setEditAvatar(it.avatarUrl ?? "");
  }

  async function saveEdit(id: string) {
    setSaving(true);
    const res = await fetch(`/api/admin/studios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ about: editAbout, avatarUrl: editAvatar }),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, about: updated.about, avatarUrl: updated.avatarUrl } : it)));
      setEditingId(null);
    }
    setSaving(false);
  }

  async function setInstanceRarity(itemId: string, instanceId: string, rarity: Rarity) {
    setSavingInstanceId(instanceId);
    // Changer la rareté re-roule automatiquement l'ATK dans la nouvelle bande
    // (voir /api/admin/instances/[id]) — on récupère les deux dans la réponse.
    const res = await fetch(`/api/admin/instances/${instanceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rarity }),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? { ...it, instances: it.instances.map((i) => (i.id === instanceId ? { ...i, rarity: updated.rarity, atk: updated.atk } : i)) }
            : it
        )
      );
    }
    setSavingInstanceId(null);
  }

  async function setInstanceAtk(itemId: string, instanceId: string, atk: number) {
    setSavingInstanceId(instanceId);
    const res = await fetch(`/api/admin/instances/${instanceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ atk }),
    });
    if (res.ok) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? { ...it, instances: it.instances.map((i) => (i.id === instanceId ? { ...i, atk } : i)) }
            : it
        )
      );
    }
    setSavingInstanceId(null);
  }

  const filtered = useMemo(() => {
    const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr");
    const q = normalize(search.trim());
    let out = items.filter((it) => {
      if (q && ![it.name, it.id, ...it.developers, ...(it.games ?? []).map((game) => game.name)].some((value) => normalize(value).includes(q))) return false;
      if (typeFilter !== "ALL" && it.type !== typeFilter) return false;
      if (rarityFilter !== "ALL" && it.rarity !== rarityFilter) return false;
      if (claimFilter === "CLAIMED" && it.copies === 0) return false;
      if (claimFilter === "FREE" && it.copies > 0) return false;
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
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-white">Toutes les cartes</h1>
        <div className="flex bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setView("list")}
            className={`px-3 py-1.5 text-sm ${view === "list" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            ☰ Liste
          </button>
          <button
            onClick={() => setView("cards")}
            className={`px-3 py-1.5 text-sm ${view === "cards" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            ▦ Cartes
          </button>
        </div>
      </div>
      <p className="text-gray-500 text-sm mb-1">
        {loading ? "Chargement…" : `${filtered.length} / ${items.length} carte(s)`}
      </p>
      <p className="text-gray-600 text-xs mb-6">
        La DEF (50–250) est calculée depuis les possesseurs estimés SteamSpy ; l’estimation brute reste en base.
        Chaque exemplaire tiré a sa propre rareté et sa propre ATK, visibles et modifiables via « Exemplaires ».
      </p>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          placeholder="Rechercher un jeu, studio, AppID ou développeur…"
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
          <option value="ALL">Toutes raretés (jeu/studio)</option>
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
          <option value="ALL">Tirée ou non</option>
          <option value="CLAIMED">Au moins 1 exemplaire tiré</option>
          <option value="FREE">Jamais tirée</option>
        </select>
      </div>

      {view === "list" ? (
        <div className="overflow-x-auto border border-gray-800 rounded-xl">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-900 text-gray-400 select-none">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("name")}>
                  Nom{sortIndicator("name")}
                </th>
                <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("rarity")}>
                  Rareté (jeu/studio){sortIndicator("rarity")}
                </th>
                <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("atk")}>
                  ATK{sortIndicator("atk")}
                </th>
                <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("def")}>
                  DEF (50–250){sortIndicator("def")}
                </th>
                <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("updatedAt")}>
                  Maj{sortIndicator("updatedAt")}
                </th>
                <th className="px-4 py-3">Exemplaires</th>
                <th className="px-4 py-3">Éditer</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <Fragment key={`${it.type}-${it.id}`}>
                  <tr className="border-t border-gray-800 hover:bg-gray-900/50">
                    <td className="px-4 py-2 text-gray-400">{it.type === "GAME" ? "🎮 Jeu" : "🏢 Studio"}</td>
                    <td className="px-4 py-2 text-white font-medium">{it.name}</td>
                    <td className={`px-4 py-2 font-semibold ${RARITY_COLOR[it.rarity]}`}>{it.rarity}</td>
                    <td className="px-4 py-2 text-red-400">{it.atk}</td>
                    <td className="px-4 py-2 text-blue-400">{it.def.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-2 text-gray-500">{new Date(it.updatedAt).toLocaleDateString("fr-FR")}</td>
                    <td className="px-4 py-2">
                      {it.copies > 0 ? (
                        <button
                          onClick={() => setExpandedId(expandedId === it.id ? null : it.id)}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          {it.copies} exemplaire{it.copies > 1 ? "s" : ""} {expandedId === it.id ? "▲" : "▼"}
                        </button>
                      ) : (
                        <span className="text-gray-600">aucun</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {it.type === "STUDIO" && (
                        <button
                          onClick={() => (editingId === it.id ? setEditingId(null) : startEdit(it))}
                          className="text-purple-400 hover:text-purple-300 text-xs"
                        >
                          {editingId === it.id ? "Fermer" : "✎ Éditer"}
                        </button>
                      )}
                    </td>
                  </tr>

                  {expandedId === it.id && (
                    <tr className="border-t border-gray-800 bg-gray-900/30">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="flex flex-col gap-1 max-w-xl">
                          {it.instances.map((inst) => (
                            <div key={inst.id} className="flex items-center gap-3 text-sm">
                              <span className="text-gray-400 w-32 truncate">{inst.username}</span>
                              <select
                                value={inst.rarity}
                                disabled={savingInstanceId === inst.id}
                                onChange={(e) => setInstanceRarity(it.id, inst.id, e.target.value as Rarity)}
                                className={`bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs outline-none ${RARITY_COLOR[inst.rarity]}`}
                              >
                                {(Object.keys(RARITY_LABEL) as Rarity[]).map((r) => (
                                  <option key={r} value={r}>{RARITY_LABEL[r]}</option>
                                ))}
                              </select>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                defaultValue={inst.atk}
                                disabled={savingInstanceId === inst.id}
                                onBlur={(e) => {
                                  const v = Number(e.target.value);
                                  if (v !== inst.atk && v >= 0 && v <= 100) setInstanceAtk(it.id, inst.id, v);
                                }}
                                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-red-400 w-16 outline-none"
                                title="ATK de cet exemplaire (0-100)"
                              />
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}

                  {editingId === it.id && (
                    <tr className="border-t border-gray-800 bg-gray-900/30">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="flex flex-col gap-2 max-w-xl">
                          <label className="text-[10px] uppercase text-gray-500">Avatar (URL image)</label>
                          <input
                            value={editAvatar}
                            onChange={(e) => setEditAvatar(e.target.value)}
                            placeholder="https://..."
                            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm outline-none"
                          />
                          <label className="text-[10px] uppercase text-gray-500">À propos</label>
                          <textarea
                            value={editAbout}
                            onChange={(e) => setEditAbout(e.target.value)}
                            rows={3}
                            placeholder="Texte saisi manuellement (aucune API Steam ne fournit ça)"
                            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEdit(it.id)}
                              disabled={saving}
                              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50"
                            >
                              {saving ? "…" : "Enregistrer"}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                    Aucune carte ne correspond aux filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-wrap gap-6">
          {filtered.map((it) =>
            it.type === "GAME" ? (
              <GameCard
                key={`GAME-${it.id}`}
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
                contentType={it.contentType}
              />
            ) : (
              <StudioCard
                key={`STUDIO-${it.id}`}
                name={it.name}
                gameCount={it.gameCount ?? 0}
                atk={it.atk}
                def={it.def}
                rarity={it.rarity}
                games={it.games ?? []}
                about={it.about}
                avatarUrl={it.avatarUrl}
              />
            )
          )}
          {!loading && filtered.length === 0 && (
            <p className="text-gray-500 text-sm">Aucune carte ne correspond aux filtres.</p>
          )}
        </div>
      )}
    </div>
  );
}
