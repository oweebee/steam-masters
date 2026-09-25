"use client";
import { useEffect, useMemo, useState } from "react";

type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

type Joueur = { id: string; username: string };
type CardOption = { id: string; label: string; headerImage: string | null; rarity: Rarity; type: "GAME" | "DLC" | "STUDIO" };
type OwnedCollectionRecord = { id: string; sellable: boolean; rarity: Rarity; game: { name: string; headerImage: string; contentType: "GAME" | "DLC" } | null; studio: { name: string } | null };
type CardSort = "name" | "rarity" | "type";

type TradeCard = {
  side: "OFFER" | "WANT";
  card: {
    game: { name: string; rarity: Rarity; contentType: "GAME" | "DLC" } | null;
    studio: { name: string; rarity: Rarity } | null;
  };
};

type Trade = {
  id: string;
  fromUserId: string;
  toUserId: string;
  offerCoins: number;
  wantCoins: number;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
  createdAt: string;
  fromUser: { id: string; username: string };
  toUser: { id: string; username: string };
  cards: TradeCard[];
};

function cardLabel(tc: TradeCard) {
  const game = tc.card.game;
  return game ? `${game.name}${game.contentType === "DLC" ? " (DLC)" : ""}` : tc.card.studio?.name ?? "?";
}

function cardTypeLabel(type: CardOption["type"]) {
  return type === "DLC" ? "DLC" : type === "GAME" ? "Jeu" : "Studio";
}

const RARITY_ORDER: Record<Rarity, number> = {
  LEGENDARY: 0,
  EPIC: 1,
  RARE: 2,
  UNCOMMON: 3,
  COMMON: 4,
};

const RARITY_BORDER: Record<Rarity, string> = {
  LEGENDARY: "border-l-orange-500",
  EPIC: "border-l-purple-500",
  RARE: "border-l-blue-500",
  UNCOMMON: "border-l-green-500",
  COMMON: "border-l-gray-300",
};

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

function CardSelector({
  cards,
  selectedIds,
  onToggle,
  unavailableMessage,
}: {
  cards: CardOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  unavailableMessage?: string;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CardSort>("name");

  const visibleCards = useMemo(() => {
    const query = normalizeSearch(search.trim());
    return cards
      .filter((card) => !query || normalizeSearch(card.label).includes(query))
      .sort((a, b) => {
        if (sort === "rarity") {
          return RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.label.localeCompare(b.label, "fr");
        }
        if (sort === "type") {
          return a.type.localeCompare(b.type) || a.label.localeCompare(b.label, "fr");
        }
        return a.label.localeCompare(b.label, "fr");
      });
  }, [cards, search, sort]);

  return (
    <div className="steam-trade-selector">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 mb-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une carte…"
          className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none min-w-0"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as CardSort)}
          className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none"
        >
          <option value="name">Nom A → Z</option>
          <option value="rarity">Rareté</option>
          <option value="type">Jeux / DLC / Studios</option>
        </select>
      </div>

      <div className="flex items-center justify-between text-[11px] text-gray-500 mb-2 px-1">
        <span>{visibleCards.length} résultat{visibleCards.length > 1 ? "s" : ""}</span>
        <span className="text-amber-500">{selectedIds.length} sélectionnée{selectedIds.length > 1 ? "s" : ""}</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
        {visibleCards.map((card) => {
          const selected = selectedIds.includes(card.id);
          return (
            <button
              type="button"
              key={card.id}
              aria-pressed={selected}
              onClick={() => onToggle(card.id)}
              className={`steam-trade-card-choice border-l-4 ${RARITY_BORDER[card.rarity]} ${
                selected ? "steam-trade-card-selected" : ""
              }`}
            >
              {card.headerImage ? (
                <img src={card.headerImage} alt="" className="w-16 h-9 rounded object-cover shrink-0" />
              ) : (
                <span className="steam-trade-studio-icon">🏭</span>
              )}
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-sm text-white truncate">{card.label}</span>
                <span className="block text-[10px] uppercase tracking-wide text-gray-500">
                  {cardTypeLabel(card.type)}
                </span>
              </span>
              <span className="steam-trade-select-mark" aria-hidden="true">{selected ? "✓" : "+"}</span>
            </button>
          );
        })}
        {unavailableMessage && <p className="text-gray-600 text-xs p-3">{unavailableMessage}</p>}
        {!unavailableMessage && cards.length === 0 && <p className="text-gray-600 text-xs p-3">Aucune carte.</p>}
        {!unavailableMessage && cards.length > 0 && visibleCards.length === 0 && (
          <p className="text-gray-600 text-xs p-3">Aucune carte ne correspond à la recherche.</p>
        )}
      </div>
    </div>
  );
}

export function EchangesClient({ myUserId }: { myUserId: string }) {
  const [joueurs, setJoueurs] = useState<Joueur[]>([]);
  const [myCollection, setMyCollection] = useState<CardOption[]>([]);
  const [targetId, setTargetId] = useState("");
  const [targetCollection, setTargetCollection] = useState<CardOption[]>([]);
  const [targetLoading, setTargetLoading] = useState(false);
  const [offerCardIds, setOfferCardIds] = useState<string[]>([]);
  const [wantCardIds, setWantCardIds] = useState<string[]>([]);
  const [offerCoins, setOfferCoins] = useState(0);
  const [wantCoins, setWantCoins] = useState(0);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  function loadTrades() {
    fetch("/api/echanges").then((r) => (r.ok ? r.json() : [])).then(setTrades);
  }

  useEffect(() => {
    fetch("/api/joueurs").then((r) => (r.ok ? r.json() : [])).then((users: (Joueur & { isSelf?: boolean })[]) => setJoueurs(users.filter((user) => !user.isSelf)));
    fetch("/api/collection")
      .then((r) => (r.ok ? r.json() : []))
      .then((cards: OwnedCollectionRecord[]) => {
        const available = cards.filter((c) => c.sellable);
        setMyCollection(
          available.map((c) => ({
            id: c.id,
            label: c.game?.name ?? c.studio?.name ?? "?",
            headerImage: c.game?.headerImage ?? null,
            rarity: c.rarity,
            type: c.game?.contentType ?? "STUDIO",
          }))
        );
        const requested = new URLSearchParams(window.location.search).get("cardId");
        if (requested && available.some((card) => card.id === requested)) setOfferCardIds([requested]);
      });
    loadTrades();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setTargetCollection([]);
      setWantCardIds([]);
      setTargetLoading(!!targetId);
      if (!targetId) return;
      fetch(`/api/joueurs/${targetId}/collection`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((cards: CardOption[]) => { if (!controller.signal.aborted) setTargetCollection(cards); })
        .catch(() => { if (!controller.signal.aborted) setTargetCollection([]); })
        .finally(() => { if (!controller.signal.aborted) setTargetLoading(false); });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [targetId]);

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function proposeTrade() {
    setError("");
    if (!targetId) { setError("Choisis un joueur"); return; }
    setSending(true);
    const res = await fetch("/api/echanges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: targetId, offerCardIds, wantCardIds, offerCoins, wantCoins }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) { setError(data.error ?? "Erreur"); return; }
    setOfferCardIds([]);
    setWantCardIds([]);
    setOfferCoins(0);
    setWantCoins(0);
    loadTrades();
  }

  async function act(id: string, action: "accept" | "decline") {
    setActingId(id);
    const res = await fetch(`/api/echanges/${id}/${action}`, { method: "POST" });
    const data = await res.json();
    setActingId(null);
    if (!res.ok) { setError(data.error ?? "Erreur"); return; }
    loadTrades();
  }

  const incoming = trades.filter((t) => t.status === "PENDING" && t.toUserId === myUserId);
  const outgoing = trades.filter((t) => t.status === "PENDING" && t.fromUserId === myUserId);
  const history = trades.filter((t) => t.status !== "PENDING");

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-white">Échanges</h1>

      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-4">
        <h2 className="text-white font-semibold">Proposer un échange</h2>

        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none max-w-xs"
        >
          <option value="">Choisir un joueur…</option>
          {joueurs.map((j) => (
            <option key={j.id} value={j.id}>{j.username}</option>
          ))}
        </select>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-gray-400 text-xs uppercase mb-2">Tu offres (tes cartes)</p>
            <CardSelector
              cards={myCollection}
              selectedIds={offerCardIds}
              onToggle={(id) => toggle(offerCardIds, setOfferCardIds, id)}
            />
            <label className="text-gray-400 text-xs uppercase mt-2 block">Ajoutez des pièces</label>
            <input
              type="number"
              min={0}
              value={offerCoins}
              onChange={(e) => setOfferCoins(Math.max(0, parseInt(e.target.value) || 0))}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm w-32 mt-1"
            />
          </div>

          <div>
            <p className="text-gray-400 text-xs uppercase mb-2">Tu demandes (ses cartes)</p>
            <CardSelector
              key={targetId || "no-target"}
              cards={targetCollection}
              selectedIds={wantCardIds}
              onToggle={(id) => toggle(wantCardIds, setWantCardIds, id)}
              unavailableMessage={!targetId ? "Choisis d’abord un joueur." : targetLoading ? "Chargement de sa collection…" : undefined}
            />
            <label className="text-gray-400 text-xs uppercase mt-2 block">Demandez des pièces</label>
            <input
              type="number"
              min={0}
              value={wantCoins}
              onChange={(e) => setWantCoins(Math.max(0, parseInt(e.target.value) || 0))}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm w-32 mt-1"
            />
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={proposeTrade}
          disabled={sending}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg px-4 py-2 self-start disabled:opacity-50"
        >
          {sending ? "…" : "Proposer l'échange"}
        </button>
      </section>

      <section>
        <h2 className="text-white font-semibold mb-2">Propositions reçues ({incoming.length})</h2>
        <div className="flex flex-col gap-2">
          {incoming.map((t) => (
            <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center justify-between gap-4">
              <div className="text-sm text-gray-300">
                <span className="text-white font-medium">{t.fromUser.username}</span> t’offre{" "}
                {t.cards.filter((c) => c.side === "OFFER").map(cardLabel).join(", ") || "rien"}
                {t.offerCoins > 0 && ` + ${t.offerCoins} jetons`} contre{" "}
                {t.cards.filter((c) => c.side === "WANT").map(cardLabel).join(", ") || "rien"}
                {t.wantCoins > 0 && ` + ${t.wantCoins} jetons`}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => act(t.id, "accept")}
                  disabled={actingId === t.id}
                  className="bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  Accepter
                </button>
                <button
                  onClick={() => act(t.id, "decline")}
                  disabled={actingId === t.id}
                  className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  Refuser
                </button>
              </div>
            </div>
          ))}
          {incoming.length === 0 && <p className="text-gray-600 text-sm">Aucune proposition reçue.</p>}
        </div>
      </section>

      <section>
        <h2 className="text-white font-semibold mb-2">Propositions envoyées ({outgoing.length})</h2>
        <div className="flex flex-col gap-2">
          {outgoing.map((t) => (
            <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center justify-between gap-4">
              <div className="text-sm text-gray-300">
                Tu offres{" "}
                {t.cards.filter((c) => c.side === "OFFER").map(cardLabel).join(", ") || "rien"}
                {t.offerCoins > 0 && ` + ${t.offerCoins} jetons`} à{" "}
                <span className="text-white font-medium">{t.toUser.username}</span> contre{" "}
                {t.cards.filter((c) => c.side === "WANT").map(cardLabel).join(", ") || "rien"}
                {t.wantCoins > 0 && ` + ${t.wantCoins} jetons`}
              </div>
              <button
                onClick={() => act(t.id, "decline")}
                disabled={actingId === t.id}
                className="bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50 shrink-0"
              >
                Annuler
              </button>
            </div>
          ))}
          {outgoing.length === 0 && <p className="text-gray-600 text-sm">Aucune proposition envoyée.</p>}
        </div>
      </section>

      <section>
        <h2 className="text-white font-semibold mb-2">Historique ({history.length})</h2>
        <div className="flex flex-col gap-1">
          {history.map((t) => (
            <div key={t.id} className="text-xs text-gray-500 border-t border-gray-800 py-2">
              {t.fromUser.username} → {t.toUser.username} :{" "}
              <span className={t.status === "ACCEPTED" ? "text-green-500" : "text-red-500"}>{t.status}</span>
            </div>
          ))}
          {history.length === 0 && <p className="text-gray-600 text-sm">Aucun historique.</p>}
        </div>
      </section>
    </div>
  );
}
