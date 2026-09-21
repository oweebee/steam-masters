"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GameCard } from "@/components/GameCard";
import { StudioCard } from "@/components/StudioCard";

type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

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

export function CollectionClient() {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saleMode, setSaleMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selling, setSelling] = useState(false);
  const [saleMessage, setSaleMessage] = useState("");
  const [saleError, setSaleError] = useState("");

  useEffect(() => {
    fetch("/api/collection")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setCards(data);
        setLoaded(true);
      });
  }, []);

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
      <div className="flex flex-wrap gap-6">
        {cards.map((c) => {
          const selected = selectedIds.includes(c.id);
          return (
            <div key={c.id} className={`steam-sale-card ${selected ? "steam-sale-card-selected" : ""}`}>
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
            />
          ) : null}
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
