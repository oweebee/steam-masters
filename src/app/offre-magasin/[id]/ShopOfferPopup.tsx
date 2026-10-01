"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CardZoomDialog } from "@/components/CardZoomDialog";
import { GameCard } from "@/components/GameCard";
import { StudioCard } from "@/components/StudioCard";
import type { Rarity } from "@/lib/rarityStyles";
import styles from "./shopOfferPopup.module.css";

type Offer = {
  id: string; rarity: Rarity; atk: number; price: number; purchasedAt: string | null; endsAt: string;
  game: null | { id: string; name: string; description: string; headerImage: string; reviewScore: number; peakCcu: number; ownerEstimate: number; def: number; tags: string[]; developers: string[]; priceCents: number | null; isFree: boolean; contentType: "GAME" | "DLC"; source: "STEAM" | "IGDB"; platforms: string[] };
  studio: null | { name: string; gameCount: number; def: number; about: string | null; avatarUrl: string | null };
};

export function ShopOfferPopup({ offer, initialCoins }: { offer: Offer; initialCoins: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [purchased, setPurchased] = useState(!!offer.purchasedAt);
  const [coins, setCoins] = useState(initialCoins);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const name = offer.game?.name ?? offer.studio?.name ?? "Carte";
  const expired = now >= new Date(offer.endsAt).getTime();
  const cannotAfford = coins < offer.price;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function close() {
    setOpen(false);
    if (window.history.length > 1) router.back();
    else router.replace("/alertes");
  }

  async function buy() {
    if (busy || purchased || expired || cannotAfford) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/magasin/${encodeURIComponent(offer.id)}/buy`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Achat impossible");
      setPurchased(true);
      setCoins(result.coins);
      setSuccess(`« ${name} » ajoutée à ta collection.`);
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Achat impossible"); }
    finally { setBusy(false); }
  }

  return <CardZoomDialog open={open} onClose={close} label={`l’offre ${name}`} size="owned">
    <div className={styles.layout}>
      <div className={styles.card}>{offer.game ? <GameCard {...offer.game} atk={offer.atk} rarity={offer.rarity} /> : offer.studio ? <StudioCard name={offer.studio.name} gameCount={offer.studio.gameCount} def={offer.studio.def} about={offer.studio.about} avatarUrl={offer.studio.avatarUrl} atk={offer.atk} rarity={offer.rarity} games={[]} /> : null}</div>
      <aside className={styles.checkout}>
        <p className={styles.eyebrow}>OFFRE DU MAGASIN</p>
        <h1>{name}</h1>
        <div className={styles.price}><small>PRIX</small><strong>{offer.price.toLocaleString("fr-FR")}</strong><span>gigapuissances</span></div>
        <div className={styles.wallet}><span>Ton solde</span><strong>{coins.toLocaleString("fr-FR")} gigapuissances</strong></div>
        <button type="button" className={styles.buy} disabled={busy || purchased || expired || cannotAfford} onClick={() => void buy()}>
          <span aria-hidden="true">⚙</span><b>{purchased ? "DÉJÀ VENDUE" : expired ? "OFFRE EXPIRÉE" : cannotAfford ? "SOLDE INSUFFISANT" : busy ? "ACHAT…" : "ACHETER MAINTENANT"}</b>
        </button>
        {success && <p className={styles.success} role="status">✓ {success}</p>}
        {error && <p className={styles.error} role="alert">! {error}</p>}
        <p className={styles.note}>Le stock est commun : l’achat réserve immédiatement cette offre pour ton compte.</p>
      </aside>
    </div>
  </CardZoomDialog>;
}
