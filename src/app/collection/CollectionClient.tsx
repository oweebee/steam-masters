"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GameCard } from "@/components/GameCard";
import { StudioCard } from "@/components/StudioCard";
import type { PrivateCardCategory } from "@/components/CardCategoryPills";

type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
type Player = { id: string; username: string; isSelf: boolean };
type Delivery = {
  id: string; fromUserId: string; toUserId: string; wantCoins: number;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
  expiresAt: string | null;
  fromUser: { username: string }; toUser: { username: string };
  cards: { card: { game: { name: string } | null; studio: { name: string } | null } }[];
};

type Card = {
  id: string;
  sellable: boolean;
  onAuction: boolean;
  // Rareté propre à CET exemplaire (loot table booster), indépendante de la
  // rareté intrinsèque du jeu/studio (ownerEstimate) — c'est elle qu'on affiche.
  rarity: Rarity;
  // ATK propre à CET exemplaire, roulé dans la bande de sa rareté — remplace
  // l'ATK catalogue (game.atk/studio.atk) sur l'affichage de cette carte.
  atk: number;
  game: {
    id: string;
    name: string;
    headerImage: string;
    description: string;
    atk: number;
    def: number;
    tags: string[];
    developers: string[];
    reviewScore: number;
    peakCcu: number;
    ownerEstimate: number;
    priceCents: number | null;
    isFree: boolean;
    contentType: "GAME" | "DLC";
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
  categories: PrivateCardCategory[];
};

const STEAM_PALETTE = [
  "#c8874a","#e3b578","#ffd28d","#d4521a","#a32c25",
  "#4a7fa5","#69c5d6","#3d6e9e","#1a4060","#2e8b57",
  "#6b4fa0","#9b59b6","#c0392b","#8e7b5c","#5a4a3b",
  "#607d8b","#455a64","#2c3e50","#1a1a2e","#b8860b",
];


function OwnedCardActions({ card, players, onChanged }: {
  card: Card; players: Player[]; onChanged: () => void;
}) {
  const router = useRouter();
  const [recipientId, setRecipientId] = useState("");
  const [price, setPrice] = useState("0");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function send() {
    setError(""); setMessage("");
    if (!recipientId) { setError("Choisis un joueur."); return; }
    const priceCoins = Number(price);
    if (!Number.isInteger(priceCoins) || priceCoins < 0 || priceCoins > 1_000_000) {
      setError("Prix invalide."); return;
    }
    setWorking(true);
    try {
      const response = await fetch("/api/envois", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, toUserId: recipientId, priceCoins }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Envoi impossible");
      setMessage("Proposition envoyée : le joueur a 3 jours pour accepter et payer si nécessaire.");
      onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Envoi impossible"); }
    finally { setWorking(false); }
  }

  async function discard() {
    if (!window.confirm("Défausser cette carte contre 1 pièce ?")) return;
    setWorking(true); setError("");
    try {
      const response = await fetch("/api/collection/sell", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds: [card.id] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Vente impossible");
      onChanged();
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Vente impossible"); }
    finally { setWorking(false); }
  }

  return <aside className="steam-owned-actions" aria-label="Actions sur cette carte">
    <div className="steam-owned-actions-heading"><span>⚙</span><div><small>Atelier de la carte</small><strong>{card.game?.name ?? card.studio?.name}</strong></div></div>
    {!card.sellable && <p className="steam-owned-locked">Cette carte est déjà engagée dans une offre, une enchère ou un combat.</p>}
    <label>Envoyer à un joueur
      <select value={recipientId} onChange={(event) => setRecipientId(event.target.value)} disabled={!card.sellable || working}>
        <option value="">Choisir un joueur…</option>
        {players.filter((player) => !player.isSelf).map((player) => <option key={player.id} value={player.id}>{player.username}</option>)}
      </select>
    </label>
    <label>Pièces demandées à la réception (0 = cadeau)
      <input type="number" min="0" max="1000000" value={price} onChange={(event) => setPrice(event.target.value)} disabled={!card.sellable || working} />
    </label>
    <button type="button" className="steam-owned-primary" onClick={send} disabled={!card.sellable || working || !recipientId}>Proposer l’envoi</button>
    <div className="steam-owned-action-divider" />
    <button type="button" onClick={() => router.push(`/marche?cardId=${encodeURIComponent(card.id)}`)} disabled={!card.sellable || working}>◈ Créer une enchère</button>
    <button type="button" onClick={() => router.push(`/echanges?cardId=${encodeURIComponent(card.id)}`)} disabled={!card.sellable || working}>⚒ Proposer un échange</button>
    <button type="button" onClick={discard} disabled={!card.sellable || working}>◉ Défausser · +1 pièce</button>
    {message && <p className="steam-owned-success">{message}</p>}
    {error && <p className="steam-owned-error" role="alert">{error}</p>}
  </aside>;
}

export function CollectionClient() {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selling, setSelling] = useState(false);
  const [saleMessage, setSaleMessage] = useState("");
  const [saleError, setSaleError] = useState("");
  const [flippedIds, setFlippedIds] = useState<string[]>([]);
  const [returningId, setReturningId] = useState<string | null>(null);
  const frameRefs = useRef(new Map<string, HTMLDivElement>());
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [workingOfferId, setWorkingOfferId] = useState<string | null>(null);
  const [offerError, setOfferError] = useState("");
  const [selfId, setSelfId] = useState("");
  const [categories, setCategories] = useState<(PrivateCardCategory & { cardCount?: number })[]>([]);
  const [categoryModal, setCategoryModal] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState("#c8874a");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [categoryMessage, setCategoryMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [rarityFilter, setRarityFilter] = useState<Rarity | "ALL">("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "GAME" | "DLC" | "STUDIO">("ALL");

  async function refreshAll() {
    const [collectionResponse, playersResponse, offersResponse, categoriesResponse] = await Promise.all([
      fetch("/api/collection", { cache: "no-store" }),
      fetch("/api/joueurs", { cache: "no-store" }),
      fetch("/api/envois", { cache: "no-store" }),
      fetch("/api/collection/categories", { cache: "no-store" }),
    ]);
    if (collectionResponse.ok) setCards(await collectionResponse.json());
    if (playersResponse.ok) {
      const users: Player[] = await playersResponse.json();
      setPlayers(users);
      setSelfId(users.find((user) => user.isSelf)?.id ?? "");
    }
    if (offersResponse.ok) setDeliveries(await offersResponse.json());
    if (categoriesResponse.ok) setCategories(await categoriesResponse.json());
    setLoaded(true);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshAll(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useLayoutEffect(() => {
    const activeId = flippedIds[0];
    if (!activeId) {
      if (returningId) frameRefs.current.get(returningId)?.style.setProperty("transform", "translate(0px, 0px)");
      return;
    }
    const frame = frameRefs.current.get(activeId);
    if (!frame) return;
    frame.style.transform = "translate(0px, 0px)";
    const rect = frame.getBoundingClientRect();
    const width = frame.scrollWidth;
    const height = frame.scrollHeight;
    const dx = (window.innerWidth - width) / 2 - rect.left;
    const dy = Math.max(12, (window.innerHeight - height) / 2) - rect.top;
    const animation = requestAnimationFrame(() => {
      frame.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
    });
    return () => cancelAnimationFrame(animation);
  }, [flippedIds, returningId]);

  useEffect(() => () => { if (returnTimer.current) clearTimeout(returnTimer.current); }, []);

  useEffect(() => {
    if (!flippedIds.length && !returningId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [flippedIds, returningId]);

  function handleCardFlip(id: string, flipped: boolean) {
    if (returnTimer.current) clearTimeout(returnTimer.current);
    if (flipped) {
      setReturningId(null);
      setFlippedIds([id]);
    } else {
      setFlippedIds([]);
      setReturningId(id);
      returnTimer.current = setTimeout(() => setReturningId(null), 550);
    }
  }

  async function respondToOffer(id: string, action: "accept" | "decline") {
    setWorkingOfferId(id); setOfferError("");
    try {
      const response = await fetch(`/api/echanges/${id}/${action}`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Réponse impossible");
      await refreshAll();
      router.refresh();
    } catch (reason) { setOfferError(reason instanceof Error ? reason.message : "Réponse impossible"); }
    finally { setWorkingOfferId(null); }
  }

  function toggleCard(card: Card) {
    setSelectedIds((current) => current.includes(card.id)
      ? current.filter((id) => id !== card.id)
      : [...current, card.id]);
  }

  function closeSaleMode() {
    setSelectionMode(false);
    setSelectedIds([]);
    setSaleError("");
  }

  async function sellSelected() {
    if (selectedIds.length === 0 || selling) return;
    if (cards.some((card) => selectedIds.includes(card.id) && !card.sellable)) {
      setSaleError("Retire de la sélection les cartes déjà engagées avant de les vendre.");
      return;
    }
    const confirmed = window.confirm(
      `Vendre ${selectedIds.length} carte${selectedIds.length > 1 ? "s" : ""} pour ${selectedIds.length} pièce${selectedIds.length > 1 ? "s" : ""} ?`
    );
    if (!confirmed) return;

    setSelling(true);
    setSaleError("");
    const response = await fetch("/api/collection/sell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardIds: selectedIds }),
    });
    const data = await response.json();
    setSelling(false);
    if (!response.ok) {
      setSaleError(data.error ?? "Vente impossible");
      return;
    }

    setCards((current) => current.filter((card) => !selectedIds.includes(card.id)));
    setSaleMessage(`${data.sold} carte${data.sold > 1 ? "s" : ""} vendue${data.sold > 1 ? "s" : ""} · +${data.earned} pièce${data.earned > 1 ? "s" : ""}`);
    closeSaleMode();
    router.refresh();
  }

  const normalizedQuery = searchQuery.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim();
  const filteredCards = cards.filter((card) => {
    if (rarityFilter !== "ALL" && card.rarity !== rarityFilter) return false;
    if (categoryFilter !== "ALL" && !card.categories.some((category) => category.id === categoryFilter)) return false;
    if (typeFilter !== "ALL") {
      if (typeFilter === "STUDIO" && !card.studio) return false;
      if (typeFilter === "GAME" && card.game?.contentType !== "GAME") return false;
      if (typeFilter === "DLC" && card.game?.contentType !== "DLC") return false;
    }
    if (!normalizedQuery) return true;
    const haystack = [
      card.game?.name, card.studio?.name, ...(card.game?.developers ?? []),
      ...(card.game?.tags ?? []), ...card.categories.map((category) => category.name),
    ].filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
    return haystack.includes(normalizedQuery);
  });
  const sellableIds = filteredCards.filter((card) => card.sellable).map((card) => card.id);
  const allVisibleSellableSelected = sellableIds.length > 0 && sellableIds.every((id) => selectedIds.includes(id));
  const selectedCardsAreSellable = selectedIds.every((id) => cards.find((card) => card.id === id)?.sellable);

  async function assignCategory(categoryId: string, action: "assign" | "unassign") {
    setCategoryBusy(true); setCategoryError(""); setCategoryMessage("");
    try {
      const response = await fetch("/api/collection/categories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, categoryId, cardIds: selectedIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Mise à jour impossible.");
      setCategoryMessage(action === "assign" ? "Catégorie ajoutée aux cartes sélectionnées." : "Catégorie retirée des cartes sélectionnées.");
      await refreshAll();
    } catch (reason) { setCategoryError(reason instanceof Error ? reason.message : "Mise à jour impossible."); }
    finally { setCategoryBusy(false); }
  }

  async function createCategory() {
    setCategoryBusy(true); setCategoryError(""); setCategoryMessage("");
    try {
      const response = await fetch("/api/collection/categories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name: categoryName, color: categoryColor }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Création impossible.");
      setCategories((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name, "fr")));
      setCategoryName(""); setSelectedCategoryId(data.id);
      if (selectedIds.length) await assignCategory(data.id, "assign");
      else setCategoryMessage("Catégorie créée.");
    } catch (reason) { setCategoryError(reason instanceof Error ? reason.message : "Création impossible."); }
    finally { setCategoryBusy(false); }
  }

  async function updateCategory(category: PrivateCardCategory, action: "save" | "delete") {
    if (action === "delete" && !window.confirm(`Supprimer la catégorie « ${category.name} » ? Les cartes resteront dans ta collection.`)) return;
    setCategoryBusy(true); setCategoryError(""); setCategoryMessage("");
    try {
      const response = await fetch("/api/collection/categories", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "delete" ? { action, id: category.id } : { id: category.id, name: categoryName, color: categoryColor }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Mise à jour impossible.");
      setEditingCategoryId(null); setCategoryMessage(action === "delete" ? "Catégorie supprimée." : "Catégorie modifiée.");
      await refreshAll();
    } catch (reason) { setCategoryError(reason instanceof Error ? reason.message : "Mise à jour impossible."); }
    finally { setCategoryBusy(false); }
  }

  return (
    <div>
      {(flippedIds.length > 0 || returningId || categoryModal) && <div className="steam-owned-backdrop" aria-hidden="true" onClick={() => setCategoryModal(false)} />}
      <div className="steam-collection-toolbar">
        <div>
          <h1 className="text-2xl font-bold text-white">Mes collections ({cards.length})</h1>
          <p className="text-gray-500 text-xs mt-1">Chaque carte revendue rapporte 1 pièce et retourne dans la pioche.</p>
        </div>
        {!selectionMode ? (
          <button
            type="button"
            onClick={() => {
              setSelectionMode(true);
              setSaleMessage("");
            }}
            className="steam-sale-start"
          >
            <span aria-hidden="true">⚙</span>
            Sélectionner des cartes
          </button>
        ) : (
          <div className="steam-sale-actions">
            <button
              type="button"
              onClick={() => setSelectedIds((current) => allVisibleSellableSelected
                ? current.filter((id) => !sellableIds.includes(id))
                : [...new Set([...current, ...sellableIds])])}
              className="steam-sale-secondary"
            >
              {allVisibleSellableSelected ? "Désélectionner les visibles" : "Sélectionner les cartes visibles"}
            </button>
            <button type="button" onClick={() => setCategoryModal(true)} disabled={!selectedIds.length} className="steam-sale-secondary">⚑ Catégories</button>
            <button type="button" onClick={() => router.push(`/echanges?cardIds=${encodeURIComponent(selectedIds.join(","))}`)} disabled={!selectedIds.length || !selectedCardsAreSellable} className="steam-sale-secondary">⚒ Échanger</button>
            <button
              type="button"
              onClick={sellSelected}
              disabled={selectedIds.length === 0 || selling || !selectedCardsAreSellable}
              className="steam-sale-confirm"
            >
              {selling ? "Vente…" : `Vendre ${selectedIds.length} · +${selectedIds.length} pièce${selectedIds.length > 1 ? "s" : ""}`}
            </button>
            <button type="button" onClick={closeSaleMode} className="steam-sale-secondary">Terminer</button>
          </div>
        )}
      </div>
      {saleMessage && <p className="steam-sale-message">{saleMessage}</p>}
      {saleError && <p className="text-red-400 text-sm mb-4">{saleError}</p>}
      <section className="steam-collection-filters" aria-label="Rechercher et filtrer les cartes">
        <label className="steam-collection-search"><span aria-hidden="true">⌕</span><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Rechercher une carte, un studio ou un tag…" aria-label="Rechercher dans mes collections" /></label>
        <label><span>Rareté</span><select value={rarityFilter} onChange={(event) => setRarityFilter(event.target.value as Rarity | "ALL")}>
          <option value="ALL">Toutes</option><option value="COMMON">Blanche</option><option value="UNCOMMON">Verte</option><option value="RARE">Bleue</option><option value="EPIC">Violette</option><option value="LEGENDARY">Légendaire</option>
        </select></label>
        <label><span>Type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "ALL" | "GAME" | "DLC" | "STUDIO")}>
          <option value="ALL">Tous</option><option value="GAME">Jeux</option><option value="DLC">DLC</option><option value="STUDIO">Studios</option>
        </select></label>
        <label><span>Catégorie</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="ALL">Toutes</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select></label>
        {(searchQuery || rarityFilter !== "ALL" || categoryFilter !== "ALL" || typeFilter !== "ALL") && <button type="button" className="steam-sale-secondary" onClick={() => { setSearchQuery(""); setRarityFilter("ALL"); setCategoryFilter("ALL"); setTypeFilter("ALL"); }}>Effacer</button>}
        <small>{filteredCards.length} / {cards.length} carte{cards.length > 1 ? "s" : ""}</small>
      </section>
      {deliveries.some((offer) => offer.status === "PENDING") && <section className="steam-delivery-inbox">
        <h2>Envois de cartes</h2>
        <p>Les propositions expirent après 3 jours. Les cartes restent réservées chez l’expéditeur jusque-là.</p>
        {deliveries.filter((offer) => offer.status === "PENDING").map((offer) => {
          const incoming = offer.toUserId === selfId;
          const name = offer.cards[0]?.card.game?.name ?? offer.cards[0]?.card.studio?.name ?? "Carte";
          return <div className="steam-delivery-row" key={offer.id}>
            <span><strong>{name}</strong> · {incoming ? `de ${offer.fromUser.username}` : `pour ${offer.toUser.username}`}
              {offer.wantCoins > 0 ? ` · ${offer.wantCoins} pièce${offer.wantCoins > 1 ? "s" : ""}` : " · cadeau"}
              <small>Expire le {offer.expiresAt ? new Date(offer.expiresAt).toLocaleString("fr-FR") : "—"}</small>
            </span>
            <div>
              {incoming && <button type="button" disabled={workingOfferId === offer.id} onClick={() => respondToOffer(offer.id, "accept")}>{offer.wantCoins > 0 ? "Payer et accepter" : "Accepter"}</button>}
              <button type="button" disabled={workingOfferId === offer.id} onClick={() => respondToOffer(offer.id, "decline")}>{incoming ? "Refuser" : "Annuler"}</button>
            </div>
          </div>;
        })}
        {offerError && <p role="alert" className="steam-owned-error">{offerError}</p>}
      </section>}
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-6">
        {filteredCards.map((c) => {
          const selected = selectedIds.includes(c.id);
          return (
            <div key={c.id} className="steam-owned-slot">
              <div ref={(element) => { if (element) frameRefs.current.set(c.id, element); else frameRefs.current.delete(c.id); }} className={`steam-sale-card steam-owned-frame ${selected ? "steam-sale-card-selected" : ""} ${flippedIds.includes(c.id) && !selectionMode ? "is-flipped" : ""} ${returningId === c.id ? "is-returning" : ""}`}>
              {c.game ? (
            <GameCard
              id={c.game.id}
              name={c.game.name}
              headerImage={c.game.headerImage}
              description={c.game.description}
              atk={c.atk}
              def={c.game.def}
              rarity={c.rarity}
              tags={c.game.tags}
              developers={c.game.developers}
              reviewScore={c.game.reviewScore}
              peakCcu={c.game.peakCcu}
              ownerEstimate={c.game.ownerEstimate}
              priceCents={c.game.priceCents}
              isFree={c.game.isFree}
              contentType={c.game.contentType}
              privateCategories={c.categories}
              onAuction={c.onAuction}
              onFlipChange={(flipped) => handleCardFlip(c.id, flipped)}
            />
          ) : c.studio ? (
            <StudioCard
              name={c.studio.name}
              gameCount={c.studio.gameCount}
              atk={c.atk}
              def={c.studio.def}
              rarity={c.rarity}
              games={c.studio.games}
              about={c.studio.about}
              avatarUrl={c.studio.avatarUrl}
              privateCategories={c.categories}
              onAuction={c.onAuction}
              onFlipChange={(flipped) => handleCardFlip(c.id, flipped)}
            />
          ) : null}
              {flippedIds.includes(c.id) && !selectionMode && <OwnedCardActions card={c} players={players} onChanged={() => { void refreshAll(); }} />}
              {selectionMode && (
                <button
                  type="button"
                  onClick={() => toggleCard(c)}
                  className={`steam-sale-card-target ${selected ? "is-selected" : ""} ${!c.sellable ? "is-locked" : ""}`}
                  aria-label={`${selected ? "Désélectionner" : "Sélectionner"} la carte${c.sellable ? "" : " (vente et échange indisponibles)"}`}
                  aria-pressed={selected}
                >
                  <span>{selected ? "✓" : c.sellable ? "+" : "⚑"}</span>
                </button>
              )}
              </div>
            </div>
          );
        })}
        {loaded && cards.length === 0 && (
          <p className="text-gray-500 text-sm">Aucune carte pour l&apos;instant — ouvre un paquet !</p>
        )}
        {loaded && cards.length > 0 && filteredCards.length === 0 && <p className="text-gray-500 text-sm">Aucune carte ne correspond à ces filtres.</p>}
      </div>
      {categoryModal && <section className="steam-category-modal" role="dialog" aria-modal="true" aria-labelledby="steam-category-title">
        <header>
          <div><small>ATELIER PERSONNEL</small><h2 id="steam-category-title">Catégories de cartes</h2></div>
          <button type="button" onClick={() => setCategoryModal(false)} aria-label="Fermer">×</button>
        </header>
        <p>Ces étiquettes sont privées : seul ton compte les voit. Elles ne modifient pas les cartes des autres joueurs.</p>
        {selectedIds.length > 0 && <div className="steam-category-selected-count">{selectedIds.length} carte{selectedIds.length > 1 ? "s" : ""} sélectionnée{selectedIds.length > 1 ? "s" : ""}</div>}
        <div className="steam-category-create">
          <label>Nom <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} maxLength={24} placeholder="Ex. À échanger" /></label>
          <div className="steam-category-palette-wrap">
            <span className="steam-category-palette-label">Couleur</span>
            <div className="steam-category-palette">
              {STEAM_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  className={`steam-palette-swatch${categoryColor === color ? " active" : ""}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setCategoryColor(color)}
                />
              ))}
              <input aria-label="Couleur personnalisée" type="color" value={categoryColor} onChange={(event) => setCategoryColor(event.target.value)} className="steam-palette-custom" title="Couleur personnalisée" />
            </div>
          </div>
          <button type="button" disabled={categoryBusy || !categoryName.trim()} onClick={editingCategoryId
            ? () => { const category = categories.find((item) => item.id === editingCategoryId); if (category) void updateCategory(category, "save"); }
            : () => void createCategory()}>{editingCategoryId ? "Enregistrer" : "Créer"}</button>
          {editingCategoryId && <button type="button" className="steam-sale-secondary" onClick={() => { setEditingCategoryId(null); setCategoryName(""); }}>Annuler</button>}
        </div>
        <div className="steam-category-list">
          {categories.map((category) => <article key={category.id}>
            <span className="steam-category-swatch" style={{ backgroundColor: category.color }} />
            <span className="steam-category-name">{category.name}<small>{category.cardCount ?? 0} carte{category.cardCount === 1 ? "" : "s"}</small></span>
            <button type="button" disabled={categoryBusy || !selectedIds.length} onClick={() => void assignCategory(category.id, "assign")}>Ajouter</button>
            <button type="button" disabled={categoryBusy || !selectedIds.length} onClick={() => void assignCategory(category.id, "unassign")}>Retirer</button>
            <button type="button" aria-label={`Modifier ${category.name}`} onClick={() => { setEditingCategoryId(category.id); setCategoryName(category.name); setCategoryColor(category.color); }}>✎</button>
            <button type="button" aria-label={`Supprimer ${category.name}`} disabled={categoryBusy} onClick={() => void updateCategory(category, "delete")}>×</button>
          </article>)}
          {categories.length === 0 && <span className="steam-category-empty">Crée ta première catégorie pour ranger tes cartes.</span>}
        </div>
        {categoryMessage && <p className="steam-category-feedback">{categoryMessage}</p>}
        {categoryError && <p className="steam-category-error" role="alert">{categoryError}</p>}
        <footer><button type="button" onClick={() => setCategoryModal(false)}>Terminé</button></footer>
      </section>}
    </div>
  );
}
