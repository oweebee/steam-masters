"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GameCard } from "@/components/GameCard";
import { StudioCard } from "@/components/StudioCard";
import type { Rarity } from "@/lib/rarityStyles";

type ShopOffer = {
  id: string;
  rarity: Rarity;
  atk: number;
  price: number;
  purchasedAt: string | null;
  game: null | {
    id: string; name: string; description: string; headerImage: string; reviewScore: number; peakCcu: number;
    ownerEstimate: number; def: number; tags: string[]; developers: string[]; priceCents: number | null;
    isFree: boolean; contentType: "GAME" | "DLC"; source: "STEAM" | "IGDB"; platforms: string[];
  };
  studio: null | {
    id: string; name: string; gameCount: number; avgReviewScore: number; def: number;
    games: string[]; about: string | null; avatarUrl: string | null;
  };
};

type ShopPayload = { startsAt: string; endsAt: string; coins: number; offers: ShopOffer[] };

function countdown(endsAt: string | null, now: number) {
  if (!endsAt) return "--:--";
  const remaining = Math.max(0, new Date(endsAt).getTime() - now);
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function MagasinClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetedOfferId = searchParams.get("offre");
  const [shop, setShop] = useState<ShopPayload | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/magasin", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Magasin indisponible");
      setShop(data);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chargement impossible");
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (shop && current >= new Date(shop.endsAt).getTime()) void load();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [load, shop]);
  useEffect(() => {
    const poll = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(poll);
  }, [load]);
  useEffect(() => {
    if (!shop || !targetedOfferId) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`offre-${targetedOfferId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [shop, targetedOfferId]);

  async function buy(offer: ShopOffer) {
    if (workingId || offer.purchasedAt) return;
    const name = offer.game?.name ?? offer.studio?.name ?? "cette carte";
    if (!window.confirm(`Acheter « ${name} » pour ${offer.price.toLocaleString("fr-FR")} gigapuissances ?`)) return;
    setWorkingId(offer.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/magasin/${offer.id}/buy`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Achat impossible");
      setMessage(`Carte achetée · -${data.price.toLocaleString("fr-FR")} gigapuissances`);
      await load();
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Achat impossible");
      await load();
    } finally {
      setWorkingId(null);
    }
  }

  const available = shop?.offers.filter((offer) => !offer.purchasedAt).length ?? 0;
  return <main className="shop-storefront">
    <header className="shop-storefront-hero">
      <div className="shop-storefront-gears" aria-hidden="true"><i>⚙</i><i>⚙</i></div>
      <div className="shop-storefront-title">
        <p>COMPTOIR AUTOMATIQUE · STOCK COMMUN</p>
        <h1>Magasin des maîtres</h1>
        <span>50 cartes différentes par rotation. Chaque achat retire la carte pour tous les joueurs.</span>
      </div>
      <div className="shop-storefront-dashboard" aria-label="État du magasin">
        <div className="shop-storefront-meter"><small>EN RAYON</small><strong>{available}<em>/ 50</em></strong><i style={{ "--meter-fill": `${available * 2}%` } as CSSProperties} /></div>
        <div className="shop-storefront-clock"><small>PROCHAINE ROTATION</small><strong>{countdown(shop?.endsAt ?? null, now)}</strong><span>HORAIRE CENTRAL</span></div>
        <div className="shop-storefront-wallet"><span aria-hidden="true">●</span><div><small>TES GIGAPUISSANCES</small><strong>{shop?.coins.toLocaleString("fr-FR") ?? "—"} <em>GP</em></strong></div></div>
      </div>
      <div className="shop-storefront-bulbs" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
    </header>
    {message && <p className="shop-storefront-notice is-success">✓ {message}</p>}
    {error && <p role="alert" className="shop-storefront-notice is-error">! {error}</p>}
    {!shop && !error && <div className="shop-storefront-loading"><i aria-hidden="true">⚙</i><span>Préparation du magasin…</span></div>}
    {shop && <section className="shop-storefront-grid" aria-label="Cartes en vente">
      {shop.offers.map((offer, index) => {
        const sold = !!offer.purchasedAt;
        const cannotAfford = shop.coins < offer.price;
        return <article id={`offre-${offer.id}`} key={offer.id} className={`shop-storefront-slot${sold ? " is-sold" : ""}${targetedOfferId === offer.id ? " is-targeted" : ""}`} style={{ "--slot-delay": `${(index % 10) * 45}ms` } as CSSProperties}>
          <div className="shop-storefront-card">{offer.game ? <GameCard id={offer.game.id} name={offer.game.name} headerImage={offer.game.headerImage} description={offer.game.description} atk={offer.atk} def={offer.game.def} rarity={offer.rarity} tags={offer.game.tags} developers={offer.game.developers} reviewScore={offer.game.reviewScore} peakCcu={offer.game.peakCcu} ownerEstimate={offer.game.ownerEstimate} priceCents={offer.game.priceCents} isFree={offer.game.isFree} contentType={offer.game.contentType} source={offer.game.source} platforms={offer.game.platforms} /> : offer.studio ? <StudioCard name={offer.studio.name} gameCount={offer.studio.gameCount} atk={offer.atk} def={offer.studio.def} rarity={offer.rarity} games={[]} about={offer.studio.about} avatarUrl={offer.studio.avatarUrl} /> : null}</div>
          <div className="shop-storefront-checkout">
            <div className="shop-storefront-price"><small>PRIX</small><strong><span aria-hidden="true">●</span>{offer.price.toLocaleString("fr-FR")}</strong></div>
            <button type="button" disabled={sold || !!workingId || cannotAfford} onClick={() => void buy(offer)} className="shop-storefront-buy">
              <span aria-hidden="true">⚙</span><b>{sold ? "VENDUE" : workingId === offer.id ? "ACHAT…" : cannotAfford ? "SOLDE GP INSUFFISANT" : "ACHETER"}</b><i aria-hidden="true" />
            </button>
          </div>
          {sold && <span className="shop-storefront-sold">VENDUE</span>}
        </article>;
      })}
    </section>}
  </main>;
}
