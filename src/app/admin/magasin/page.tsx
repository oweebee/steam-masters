"use client";

import { useEffect, useState } from "react";
import type { Rarity } from "@/lib/rarityRoll";

const ROWS: Array<{ rarity: Rarity; label: string; color: string }> = [
  { rarity: "COMMON", label: "Commune", color: "text-gray-200" },
  { rarity: "UNCOMMON", label: "Verte", color: "text-green-400" },
  { rarity: "RARE", label: "Bleue", color: "text-blue-400" },
  { rarity: "EPIC", label: "Violette", color: "text-purple-400" },
  { rarity: "LEGENDARY", label: "Légendaire", color: "text-orange-400" },
];
type Draft = Record<Rarity, { min: string; max: string }>;
const emptyDraft = () => Object.fromEntries(ROWS.map(({ rarity }) => [rarity, { min: "", max: "" }])) as Draft;

function remainingLabel(endsAt: string | undefined, now: number) {
  if (!endsAt) return "--:--";
  const remaining = Math.max(0, new Date(endsAt).getTime() - now);
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function AdminShopPage() {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [steamBurst, setSteamBurst] = useState(0);
  const [rotation, setRotation] = useState<{ startsAt: string; endsAt: string; _count: { offers: number } } | null>(null);

  useEffect(() => {
    fetch("/api/admin/shop-config", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Chargement impossible");
      if (data.ranges) setDraft(Object.fromEntries(ROWS.map(({ rarity }) => [rarity, { min: String(data.ranges[rarity].min), max: String(data.ranges[rarity].max) }])) as Draft);
      setRotation(data.rotation ?? null);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Chargement impossible")).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    const ranges = Object.fromEntries(ROWS.map(({ rarity }) => [rarity, { min: Number(draft[rarity].min), max: Number(draft[rarity].max) }]));
    try {
      const response = await fetch("/api/admin/shop-config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ranges }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Enregistrement impossible");
      setMessage("Fourchettes enregistrées. Elles s’appliqueront aux cartes de la prochaine rotation.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Enregistrement impossible"); }
    finally { setSaving(false); }
  }

  async function rotateNow() {
    if (!window.confirm("Expirer immédiatement les offres invendues et générer une nouvelle rotation de 50 cartes pour une heure ?")) return;
    setRotating(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/shop-config", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Relance impossible");
      setRotation(data.rotation);
      setSteamBurst((value) => value + 1);
      setMessage("Nouvelle rotation créée : 50 cartes disponibles pendant une heure.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Relance impossible"); }
    finally { setRotating(false); }
  }

  const active = !!rotation && new Date(rotation.endsAt).getTime() > now;
  return <main className="shop-admin-workshop">
    <div className="shop-admin-ambient" aria-hidden="true"><i /><i /><i /></div>
    <header className="shop-admin-hero">
      <div className="shop-admin-title-mark" aria-hidden="true"><span>⚙</span><b>SM</b><span>⚙</span></div>
      <div><p className="shop-admin-kicker">Console d&apos;approvisionnement</p><h1>Magasin des maîtres</h1><p>Calibre les prix de chaque rareté et commande le renouvellement du stock mondial.</p></div>
      <div className={`shop-admin-lamp ${active ? "is-active" : ""}`}><i /><span>{active ? "EN SERVICE" : "EN ATTENTE"}</span></div>
    </header>

    <section className={`shop-admin-console ${rotating ? "is-rotating" : ""}`}>
      <div className="shop-admin-gearbox" aria-hidden="true"><i className="gear-one">⚙</i><i className="gear-two">⚙</i><span /></div>
      <div className="shop-admin-status-copy"><small>Rotation mondiale</small><strong>{rotation ? `${rotation._count.offers} offres chargées` : "Aucun stock actif"}</strong><span>{rotation ? `Lancée le ${new Date(rotation.startsAt).toLocaleString("fr-FR")}` : "Configure les prix avant le premier lancement."}</span></div>
      <div className="shop-admin-gauge" aria-label={active ? `Renouvellement dans ${remainingLabel(rotation?.endsAt, now)}` : "Rotation inactive"}><div className="shop-admin-gauge-face"><i /><b>{remainingLabel(rotation?.endsAt, now)}</b><small>AVANT RELÈVE</small></div></div>
      <button type="button" onClick={() => void rotateNow()} disabled={rotating || loading} className="shop-admin-rotate-button"><span className="shop-admin-button-bolts" aria-hidden="true" /><i aria-hidden="true">↻</i><b>{rotating ? "Mise sous pression…" : "Relancer maintenant"}</b><small>Expire le stock invendu</small></button>
      {steamBurst > 0 && <div key={steamBurst} className="shop-admin-steam-burst" aria-hidden="true"><i /><i /><i /><i /></div>}
    </section>

    {loading ? <div className="shop-admin-loading"><i /> Lecture des manomètres…</div> : <form onSubmit={save} className="shop-admin-price-panel">
      <div className="shop-admin-panel-heading"><div><small>Table de calibration</small><h2>Fourchettes de prix</h2></div><p>Le prix est tiré aléatoirement entre les deux bornes, incluses. Une rotation déjà créée conserve ses valeurs.</p></div>
      <div className="shop-admin-price-grid" role="group" aria-label="Fourchettes de prix par rareté">
        {ROWS.map(({ rarity, label }) => <section key={rarity} data-rarity={rarity} className="shop-admin-price-row">
          <div className="shop-admin-rarity"><i aria-hidden="true" /><span><strong>{label}</strong><small>{rarity}</small></span></div>
          <label><span>Minimum</span><div className="shop-admin-number"><input required type="number" min="1" max="1000000" step="1" value={draft[rarity].min} onChange={(event) => setDraft((current) => ({ ...current, [rarity]: { ...current[rarity], min: event.target.value } }))} /><b>◉</b></div></label>
          <div className="shop-admin-range-flow" aria-hidden="true"><i /><span>aléatoire</span></div>
          <label><span>Maximum</span><div className="shop-admin-number"><input required type="number" min="1" max="1000000" step="1" value={draft[rarity].max} onChange={(event) => setDraft((current) => ({ ...current, [rarity]: { ...current[rarity], max: event.target.value } }))} /><b>◉</b></div></label>
        </section>)}
      </div>
      <footer className="shop-admin-panel-footer"><button disabled={saving} className="shop-admin-save-button"><i aria-hidden="true">◆</i><span>{saving ? "Gravure des réglages…" : "Enregistrer les fourchettes"}</span></button><div aria-live="polite">{message && <p className="shop-admin-success">✓ {message}</p>}{error && <p role="alert" className="shop-admin-error">⚠ {error}</p>}</div></footer>
    </form>}
  </main>;
}
