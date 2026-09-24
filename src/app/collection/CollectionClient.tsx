"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GameCard } from "@/components/GameCard";
import { StudioCard } from "@/components/StudioCard";

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
  const [saleMode, setSaleMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selling, setSelling] = useState(false);
  const [saleMessage, setSaleMessage] = useState("");
  const [saleError, setSaleError] = useState("");
  const [flippedIds, setFlippedIds] = useState<string[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [workingOfferId, setWorkingOfferId] = useState<string | null>(null);
  const [offerError, setOfferError] = useState("");
  const [selfId, setSelfId] = useState("");

  async function refreshAll() {
    const [collectionResponse, playersResponse, offersResponse] = await Promise.all([
      fetch("/api/collection", { cache: "no-store" }),
      fetch("/api/joueurs", { cache: "no-store" }),
      fetch("/api/envois", { cache: "no-store" }),
    ]);
    if (collectionResponse.ok) setCards(await collectionResponse.json());
    if (playersResponse.ok) {
      const users: Player[] = await playersResponse.json();
      setPlayers(users);
      setSelfId(users.find((user) => user.isSelf)?.id ?? "");
    }
    if (offersResponse.ok) setDeliveries(await offersResponse.json());
    setLoaded(true);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshAll(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
    if (!card.sellable) return;
    setSelectedIds((current) => current.includes(card.id)
      ? current.filter((id) => id !== card.id)
      : [...current, card.id]);
  }

  function closeSaleMode() {
    setSaleMode(false);
    setSelectedIds([]);
    setSaleError("");
  }

  async function sellSelected() {
    if (selectedIds.length === 0 || selling) return;
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

  const sellableIds = cards.filter((card) => card.sellable).map((card) => card.id);

  return (
    <div>
      <div className="steam-collection-toolbar">
        <div>
          <h1 className="text-2xl font-bold text-white">Ma collection ({cards.length})</h1>
          <p className="text-gray-500 text-xs mt-1">Chaque carte revendue rapporte 1 pièce et retourne dans la pioche.</p>
        </div>
        {!saleMode ? (
          <button
            type="button"
            onClick={() => {
              setSaleMode(true);
              setSaleMessage("");
            }}
            disabled={sellableIds.length === 0}
            className="steam-sale-start"
          >
            <span aria-hidden="true">⚙</span>
            Vendre des cartes
          </button>
        ) : (
          <div className="steam-sale-actions">
            <button
              type="button"
              onClick={() => setSelectedIds(selectedIds.length === sellableIds.length ? [] : sellableIds)}
              className="steam-sale-secondary"
            >
              {selectedIds.length === sellableIds.length ? "Tout désélectionner" : "Tout sélectionner"}
            </button>
            <button type="button" onClick={closeSaleMode} className="steam-sale-secondary">Annuler</button>
            <button
              type="button"
              onClick={sellSelected}
              disabled={selectedIds.length === 0 || selling}
              className="steam-sale-confirm"
            >
              {selling ? "Vente…" : `Vendre ${selectedIds.length} · +${selectedIds.length} pièce${selectedIds.length > 1 ? "s" : ""}`}
            </button>
          </div>
        )}
      </div>
      {saleMessage && <p className="steam-sale-message">{saleMessage}</p>}
      {saleError && <p className="text-red-400 text-sm mb-4">{saleError}</p>}
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
      <div className="flex flex-wrap gap-6">
        {cards.map((c) => {
          const selected = selectedIds.includes(c.id);
          return (
            <div key={c.id} className={`steam-sale-card steam-owned-frame ${selected ? "steam-sale-card-selected" : ""} ${flippedIds.includes(c.id) && !saleMode ? "is-flipped" : ""}`}>
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
              onFlipChange={(flipped) => setFlippedIds((current) => flipped ? [...current, c.id] : current.filter((id) => id !== c.id))}
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
              onFlipChange={(flipped) => setFlippedIds((current) => flipped ? [...current, c.id] : current.filter((id) => id !== c.id))}
            />
          ) : null}
              {flippedIds.includes(c.id) && !saleMode && <OwnedCardActions card={c} players={players} onChanged={() => { void refreshAll(); }} />}
              {saleMode && (
                <button
                  type="button"
                  onClick={() => toggleCard(c)}
                  disabled={!c.sellable}
                  className={`steam-sale-card-target ${selected ? "is-selected" : ""} ${!c.sellable ? "is-locked" : ""}`}
                  aria-label={c.sellable ? `${selected ? "Désélectionner" : "Sélectionner"} la carte` : "Carte engagée, vente impossible"}
                  aria-pressed={selected}
                >
                  <span>{c.sellable ? (selected ? "✓" : "+") : "🔒"}</span>
                </button>
              )}
            </div>
          );
        })}
        {loaded && cards.length === 0 && (
          <p className="text-gray-500 text-sm">Aucune carte pour l&apos;instant — ouvre un paquet !</p>
        )}
      </div>
    </div>
  );
}
