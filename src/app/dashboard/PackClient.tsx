"use client";
import { useEffect, useRef, useState } from "react";
import { BoosterMachine } from "./BoosterMachine";
import { GameCard } from "@/components/GameCard";
import { StudioCard } from "@/components/StudioCard";

type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

type Game = {
  id: string;
  name: string;
  headerImage: string;
  description: string;
  atk: number;
  def: number;
  rarity: Rarity;
  tags: string[];
  developers: string[];
  reviewScore: number;
  peakCcu: number;
  ownerEstimate: number;
  priceCents: number | null;
  isFree: boolean;
  contentType: "GAME" | "DLC";
  source: "STEAM" | "IGDB";
  platforms: string[];
};

type Studio = {
  id: string;
  name: string;
  gameCount: number;
  atk: number;
  def: number;
  rarity: Rarity;
  avatarUrl: string | null;
  coverImage: string | null;
  games: { name: string; appid: string | null; hasCard: boolean; headerImage: string | null }[];
};
type OpenedBooster = { game: Game | null; studio: Studio | null };

function formatDuration(ms: number) {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

export function PackClient() {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [readyCount, setReadyCount] = useState(0);
  const [maxCredits, setMaxCredits] = useState(5);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [openedCards, setOpenedCards] = useState<OpenedBooster[]>([]);

  async function loadStatus() {
    const res = await fetch("/api/booster");
    if (res.ok) {
      const data = await res.json();
      setRemainingMs(data.remainingMs);
      setReadyCount(data.readyCount ?? 0);
      setMaxCredits(data.maxCredits ?? 5);
    }
  }

  useEffect(() => {
    void loadStatus().catch(() => setError("Impossible de lire la réserve. Recharge la page pour réessayer."));
  }, []);

  useEffect(() => {
    if (remainingMs === null || remainingMs <= 0) return;
    const t = setInterval(() => {
      setRemainingMs((prev) => {
        if (prev === null) return null;
        if (prev <= 1000) {
          void loadStatus().catch(() => {});
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [remainingMs]);

  const openingLock = useRef(false);
  const [phase, setPhase] = useState<"idle" | "pressure" | "vent" | "revealed">("idle");
  async function openBooster(count: number | "all" = 1) {
    if (openingLock.current || readyCount < 1) return;
    openingLock.current = true;
    setOpening(true); setPhase("pressure"); setError(""); setOpenedCards([]);
    const started = Date.now();
    try {
      const res = await fetch("/api/booster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count }) });
      const data = await res.json();
      if (!res.ok) {
        if (data.remainingMs !== undefined) setRemainingMs(data.remainingMs);
        if (data.readyCount !== undefined) setReadyCount(data.readyCount);
        throw new Error(data.error || "Ouverture indisponible.");
      }
      const cards = Array.isArray(data.cards) ? data.cards : [{ game: data.game ?? null, studio: data.studio ?? null }];
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 1500 - (Date.now() - started))));
      setPhase("vent");
      await new Promise(resolve => setTimeout(resolve, 1600));
      setOpenedCards(cards); setPhase("revealed");
      await loadStatus().catch(() => {});
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? e.message : "Connexion interrompue. Vérifie ta collection avant de réessayer.");
      await loadStatus().catch(() => {});
    } finally { setOpening(false); openingLock.current = false; }
  }

  const canOpen = readyCount > 0;
  const status = opening ? phase === "pressure" ? "Mise sous pression…" : "Décompression · ouverture du coffre…" : remainingMs === null ? "Connexion à l’atelier…" : canOpen ? "La chambre est prête" : "Réserve en recharge";

  return (
    <div className="booster-workshop max-w-7xl mx-auto">
      <header className="booster-heading"><span className="booster-eyebrow">MANUFACTURE · RAVITAILLEMENT</span><h1>L’atelier des paquets</h1><p>La pression monte. Les verrous cèdent. Ta prochaine découverte t’attend.</p></header>
      <section className="booster-console" aria-busy={opening}>
        <div className="booster-console-top"><span><i /> CHAMBRE DE DISTRIBUTION</span><span>N° 01 / SM</span></div>
        <div className="booster-machine-layout">
          <div className="booster-reserve"><span className="booster-eyebrow">RÉSERVE GRATUITE</span><strong>{remainingMs === null ? "—" : readyCount}<small> / {maxCredits}</small></strong><div className="booster-credit-slots">{Array.from({length:maxCredits},(_,i)=><i key={i} className={i<readyCount ? "is-filled" : ""}/>)}</div><p>Les paquets s’accumulent pendant ton absence.</p></div>
          <button type="button" className="booster-machine-trigger" onClick={() => void openBooster(1)} disabled={!canOpen || opening} aria-label="Ouvrir un paquet gratuit"><BoosterMachine phase={phase} ready={canOpen}/></button>
          <div className="booster-next"><span className="booster-eyebrow">PROCHAIN ARRIVAGE</span><strong>{remainingMs === null ? "—" : readyCount >= maxCredits ? "PLEIN" : formatDuration(remainingMs)}</strong><p>{readyCount >= maxCredits ? "Ouvre un paquet pour libérer de la place." : "Recharge automatique de la réserve."}</p><span className="booster-guarantee">GRATUIT · AJOUT À TA COLLECTION</span></div>
        </div>
        <div className="booster-status" role="status" aria-live="polite"><i className={opening ? "is-running" : ""}/>{status}</div>
        <div className="booster-controls"><button type="button" className="booster-lever" disabled={!canOpen || opening} onClick={() => void openBooster(1)}><span aria-hidden="true">⚙</span>{opening ? "Machine en action…" : "Ouvrir un paquet"}</button>{readyCount>1 && <button type="button" className="booster-secondary" disabled={opening} onClick={() => void openBooster("all")}>Ouvrir la réserve · {readyCount}</button>}</div>
        {error && <p role="alert" className="booster-error">{error}</p>}
        <p className="booster-footnote">Jusqu’à {maxCredits} paquets en réserve · Les cartes révélées sont déjà dans ta collection.</p>
      </section>

      {openedCards.length > 0 && (
        <div className="mt-10 w-full">
          <p className="mb-3 text-green-400 text-sm">{openedCards.length === 1 ? "Nouvelle carte obtenue !" : `${openedCards.length} nouvelles cartes obtenues !`}</p>
          {/* flex-wrap centré + largeurs = mêmes colonnes que les grilles (2/3/4/5) ; w-full obligatoire
              sinon les cartes (w-full) s'écrasent à ~0 dans un parent dimensionné au contenu */}
          <div className="flex w-full flex-wrap justify-center gap-4">
          {openedCards.map(({ game, studio }, index) => <div style={{ animationDelay: `${index * 300}ms` }} className="booster-revealed-card w-[calc(50%-0.5rem)] md:w-[calc(33.333%-0.667rem)] lg:w-[calc(25%-0.75rem)] xl:w-[calc(20%-0.8rem)]" key={`${game?.id ?? studio?.id ?? index}-${index}`}>
          {game && (
            <GameCard
              id={game.id} name={game.name} headerImage={game.headerImage} description={game.description}
              atk={game.atk} def={game.def} rarity={game.rarity} tags={game.tags} developers={game.developers}
              reviewScore={game.reviewScore} peakCcu={game.peakCcu} ownerEstimate={game.ownerEstimate}
              priceCents={game.priceCents} isFree={game.isFree} contentType={game.contentType}
              source={game.source} platforms={game.platforms}
            />
          )}
          {studio && (
            <StudioCard
              name={studio.name} gameCount={studio.gameCount} atk={studio.atk} def={studio.def}
              rarity={studio.rarity} avatarUrl={studio.avatarUrl} coverImage={studio.coverImage} games={studio.games}
            />
          )}
          </div>)}
          </div>
        </div>
      )}
    </div>
  );
}
