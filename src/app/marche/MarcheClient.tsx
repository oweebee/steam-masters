"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
type CollectionCard = {
  id: string; rarity: Rarity; atk: number; sellable: boolean;
  game: { id: string; name: string; headerImage: string; def: number } | null;
  studio: { id: string; name: string; avatarUrl: string | null; def: number } | null;
};
type Auction = {
  id: string; sellerId: string; startPrice: number; currentBid: number; endsAt: string;
  seller: { id: string; username: string };
  card: { id: string; rarity: Rarity; atk: number } | null;
  game: { id: string; name: string; headerImage: string; def: number } | null;
  studio: { id: string; name: string; avatarUrl: string | null; def: number } | null;
  bidCount: number; highestBidderId: string | null; hasBid: boolean; averagePrice: number | null;
};

const RARITIES: Array<{ value: Rarity | "ALL"; label: string }> = [
  { value: "ALL", label: "Toutes raretés" }, { value: "COMMON", label: "Commune" },
  { value: "UNCOMMON", label: "Peu commune" }, { value: "RARE", label: "Rare" },
  { value: "EPIC", label: "Épique" }, { value: "LEGENDARY", label: "Légendaire" },
];
const RARITY_ORDER: Record<Rarity, number> = { LEGENDARY: 0, EPIC: 1, RARE: 2, UNCOMMON: 3, COMMON: 4 };
const RARITY_BORDER: Record<Rarity, string> = {
  LEGENDARY: "border-l-orange-500", EPIC: "border-l-purple-500", RARE: "border-l-blue-500",
  UNCOMMON: "border-l-green-500", COMMON: "border-l-gray-300",
};

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

function timeLeft(endsAt: string, now: number) {
  const seconds = Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days) return `${days}j ${hours}h`;
  if (hours) return `${hours}h ${minutes}min`;
  return `${minutes}min ${String(secs).padStart(2, "0")}s`;
}

function cardName(card: CollectionCard | Auction) {
  return card.game?.name ?? card.studio?.name ?? "Carte indisponible";
}

function cardImage(card: CollectionCard | Auction) {
  return card.game?.headerImage ?? card.studio?.avatarUrl ?? null;
}

export function MarcheClient({ userId }: { userId: string }) {
  const router = useRouter();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [collection, setCollection] = useState<CollectionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"ALL" | "GAME" | "STUDIO">("ALL");
  const [rarity, setRarity] = useState<Rarity | "ALL">("ALL");
  const [sort, setSort] = useState<"ENDING" | "PRICE_ASC" | "PRICE_DESC" | "NEWEST">("ENDING");
  const [scope, setScope] = useState<"ALL" | "SELLING" | "BIDDING">("ALL");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [cardSearch, setCardSearch] = useState("");
  const [cardSort, setCardSort] = useState<"name" | "rarity" | "type">("name");
  const [startPrice, setStartPrice] = useState("1");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [bidAmounts, setBidAmounts] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const marketResponse = await fetch("/api/marche", { cache: "no-store" });
      const marketData = await marketResponse.json();
      if (!marketResponse.ok) throw new Error(marketData.error ?? "Marché indisponible");
      const collectionResponse = await fetch("/api/collection", { cache: "no-store" });
      const collectionData = await collectionResponse.json();
      if (!collectionResponse.ok) throw new Error(collectionData.error ?? "Collection indisponible");
      setAuctions(Array.isArray(marketData) ? marketData : []);
      setCollection(Array.isArray(collectionData) ? collectionData : []);
      setSelectedCardId((current) => {
        const sellable = collectionData.filter((card: CollectionCard) => card.sellable);
        return sellable.some((card: CollectionCard) => card.id === current) ? current : (sellable[0]?.id ?? "");
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chargement impossible");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(load, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (auctions.length === 0) return;
    const nextEnd = Math.min(...auctions.map((auction) => new Date(auction.endsAt).getTime()));
    const timeout = window.setTimeout(load, Math.max(500, nextEnd - Date.now() + 800));
    return () => window.clearTimeout(timeout);
  }, [auctions, load]);

  const sellableCards = useMemo(() => collection.filter((card) => card.sellable), [collection]);
  const visibleSellableCards = useMemo(() => {
    const needle = normalizeSearch(cardSearch.trim());
    return [...sellableCards]
      .filter((card) => !needle || normalizeSearch(cardName(card)).includes(needle))
      .sort((a, b) => {
        if (cardSort === "rarity") return RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || cardName(a).localeCompare(cardName(b), "fr");
        if (cardSort === "type") return Number(!!a.studio) - Number(!!b.studio) || cardName(a).localeCompare(cardName(b), "fr");
        return cardName(a).localeCompare(cardName(b), "fr");
      });
  }, [cardSearch, cardSort, sellableCards]);
  const shownAuctions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    const result = auctions.filter((auction) => {
      if (needle && !`${cardName(auction)} ${auction.seller.username}`.toLocaleLowerCase("fr").includes(needle)) return false;
      if (type === "GAME" && !auction.game) return false;
      if (type === "STUDIO" && !auction.studio) return false;
      if (rarity !== "ALL" && auction.card?.rarity !== rarity) return false;
      if (scope === "SELLING" && auction.sellerId !== userId) return false;
      if (scope === "BIDDING" && !auction.hasBid) return false;
      return true;
    });
    result.sort((a, b) => {
      if (sort === "PRICE_ASC") return a.currentBid - b.currentBid;
      if (sort === "PRICE_DESC") return b.currentBid - a.currentBid;
      if (sort === "NEWEST") return new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime();
      return new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime();
    });
    return result;
  }, [auctions, query, rarity, scope, sort, type, userId]);

  async function action(url: string, body?: unknown) {
    setWorking(true); setError(""); setMessage("");
    try {
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Opération impossible");
      await load(); router.refresh(); return data;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Opération impossible"); return null;
    } finally { setWorking(false); }
  }

  async function createAuction(event: React.FormEvent) {
    event.preventDefault();
    const result = await action("/api/marche", { cardId: selectedCardId, startPrice: Number(startPrice), durationMinutes: Number(durationMinutes) });
    if (result) setMessage("Carte mise aux enchères.");
  }

  async function bid(auction: Auction) {
    const minimum = auction.bidCount > 0 ? auction.currentBid + 1 : auction.startPrice;
    const amount = Number(bidAmounts[auction.id] || minimum);
    const result = await action(`/api/marche/${auction.id}/bid`, { amount });
    if (result) setMessage(`Enchère de ${amount.toLocaleString("fr-FR")} pièces enregistrée.`);
  }

  async function cancel(auction: Auction) {
    const result = await action(`/api/marche/${auction.id}/cancel`);
    if (result) setMessage("Annonce retirée du marché.");
  }

  return (
    <div className="steam-market">
      <header className="steam-market-header">
        <div><span className="steam-market-eyebrow">Hôtel des ventes</span><h1>Marché des cartes</h1><p>Dépose une carte, surenchéris et remporte l’exemplaire à la fin du compte à rebours.</p></div>
        <div className="steam-market-gauge" aria-hidden="true"><span>⚙</span></div>
      </header>

      <section className="steam-market-sellbox">
        <div className="steam-market-section-title"><span className="steam-market-icon">⚒</span><div><h2>Mettre une carte aux enchères</h2><p>Annulation possible uniquement avant la première enchère.</p></div></div>
        <form onSubmit={createAuction} className="steam-market-sellform">
          <div className="steam-market-card-picker steam-trade-selector">
            <div className="steam-market-picker-controls">
              <input type="search" value={cardSearch} onChange={(event) => setCardSearch(event.target.value)} placeholder="Rechercher une carte…" />
              <select value={cardSort} onChange={(event) => setCardSort(event.target.value as typeof cardSort)}>
                <option value="name">Nom A → Z</option><option value="rarity">Rareté</option><option value="type">Jeux / Studios</option>
              </select>
            </div>
            <div className="steam-market-picker-count"><span>{visibleSellableCards.length} résultat{visibleSellableCards.length > 1 ? "s" : ""}</span><span>{selectedCardId ? "1 sélectionnée" : "0 sélectionnée"}</span></div>
            <div className="steam-market-picker-grid">
              {visibleSellableCards.map((card) => {
                const selected = selectedCardId === card.id;
                const image = cardImage(card);
                return <button type="button" key={card.id} aria-pressed={selected} onClick={() => setSelectedCardId(selected ? "" : card.id)} className={`steam-trade-card-choice border-l-4 ${RARITY_BORDER[card.rarity]} ${selected ? "steam-trade-card-selected" : ""}`}>
                  {image ? <img src={image} alt="" className="w-16 h-9 rounded object-cover shrink-0" /> : <span className="steam-trade-studio-icon">🏭</span>}
                  <span className="min-w-0 flex-1 text-left"><span className="block text-sm text-white truncate">{cardName(card)}</span><span className="block text-[10px] uppercase tracking-wide text-gray-500">{card.game ? "Jeu" : "Studio"}</span></span>
                  <span className="steam-trade-select-mark" aria-hidden="true">{selected ? "✓" : "+"}</span>
                </button>;
              })}
              {sellableCards.length === 0 && <p className="steam-market-picker-empty">Aucune carte disponible : les cartes déjà en vente ou engagées dans un échange sont exclues.</p>}
              {sellableCards.length > 0 && visibleSellableCards.length === 0 && <p className="steam-market-picker-empty">Aucune carte ne correspond à la recherche.</p>}
            </div>
          </div>
          <div className="steam-market-auction-settings">
            <label><span>Prix de départ</span><input type="number" min="1" max="1000000" required value={startPrice} onChange={(event) => setStartPrice(event.target.value)} /></label>
            <label><span>Durée</span><select value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)}><option value="10">10 minutes</option><option value="30">30 minutes</option><option value="60">1 heure</option><option value="360">6 heures</option><option value="1440">24 heures</option></select></label>
            <button disabled={working || !selectedCardId}>{sellableCards.length ? "Ouvrir l’enchère" : "Aucune carte disponible"}</button>
          </div>
        </form>
      </section>

      {(message || error) && <div className={`steam-market-notice ${error ? "is-error" : ""}`}>{error || message}</div>}

      <section className="steam-market-controls">
        <div className="steam-market-scopes"><button className={scope === "ALL" ? "is-active" : ""} onClick={() => setScope("ALL")}>Toutes</button><button className={scope === "SELLING" ? "is-active" : ""} onClick={() => setScope("SELLING")}>Mes ventes</button><button className={scope === "BIDDING" ? "is-active" : ""} onClick={() => setScope("BIDDING")}>Mes enchères</button></div>
        <input aria-label="Rechercher" placeholder="Rechercher une carte ou un vendeur…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="ALL">Jeux + studios</option><option value="GAME">Jeux</option><option value="STUDIO">Studios</option></select>
        <select value={rarity} onChange={(event) => setRarity(event.target.value as typeof rarity)}>{RARITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="ENDING">Fin proche</option><option value="PRICE_ASC">Prix croissant</option><option value="PRICE_DESC">Prix décroissant</option><option value="NEWEST">Fin lointaine</option></select>
      </section>

      <div className="steam-market-count">{shownAuctions.length} annonce{shownAuctions.length > 1 ? "s" : ""} active{shownAuctions.length > 1 ? "s" : ""}</div>
      {loading ? <div className="steam-market-empty">Chargement des rouages du marché…</div> : <div className="steam-market-grid">
        {shownAuctions.map((auction) => {
          const minimum = auction.bidCount > 0 ? auction.currentBid + 1 : auction.startPrice;
          const image = cardImage(auction);
          return <article key={auction.id} data-rarity={auction.card?.rarity ?? "COMMON"} className="steam-market-card">
            <div className="steam-market-card-topline"><span>{auction.game ? "Jeu" : "Studio"}</span><span>{timeLeft(auction.endsAt, now)}</span></div>
            <div className="steam-market-card-image">{image ? <img src={image} alt="" /> : <span>🏭</span>}<i aria-hidden="true">⚙</i></div>
            <div className="steam-market-card-body"><h3>{cardName(auction)}</h3><p>Vendu par <strong>{auction.seller.username}</strong></p>
              <div className="steam-market-stats"><span><small>ATK</small>{auction.card?.atk ?? "—"}</span><span><small>DEF</small>{(auction.game?.def ?? auction.studio?.def ?? 0).toLocaleString("fr-FR")}</span></div>
              <div className="steam-market-price"><span><small>{auction.bidCount ? "Enchère actuelle" : "Prix de départ"}</small><strong>{auction.currentBid.toLocaleString("fr-FR")} ◉</strong></span><span><small>Ventes passées</small><strong>{auction.averagePrice == null ? "—" : `${auction.averagePrice.toLocaleString("fr-FR")} ◉`}</strong></span></div>
              <p className="steam-market-bids">{auction.bidCount} enchère{auction.bidCount > 1 ? "s" : ""}{auction.highestBidderId === userId ? " · Tu es en tête" : ""}</p>
              {auction.sellerId === userId ? <button className="steam-market-cancel" disabled={working || auction.bidCount > 0} onClick={() => cancel(auction)}>{auction.bidCount > 0 ? "Enchère engagée" : "Retirer l’annonce"}</button> : <div className="steam-market-bidbox"><input type="number" min={minimum} max="1000000" value={bidAmounts[auction.id] ?? ""} placeholder={String(minimum)} onChange={(event) => setBidAmounts((current) => ({ ...current, [auction.id]: event.target.value }))} /><button disabled={working} onClick={() => bid(auction)}>Enchérir</button></div>}
            </div>
          </article>;
        })}
        {shownAuctions.length === 0 && <div className="steam-market-empty">Aucune enchère ne correspond à ces filtres.</div>}
      </div>}
    </div>
  );
}
