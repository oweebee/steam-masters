"use client";
/* eslint-disable @next/next/no-img-element -- URLs d'images déjà stockées/localisées par le catalogue. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GameCard } from "@/components/GameCard";
import { StudioCard } from "@/components/StudioCard";
import type { Rarity } from "@/lib/rarityStyles";
import type { PublicBattleCard, BattleQuestion } from "@/lib/battle";

type OwnedCard = {
  id: string; rarity: Rarity; atk: number; sellable?: boolean; staked?: boolean;
  game?: { id: string; name: string; headerImage: string; description: string; def: number; tags: string[]; developers: string[]; reviewScore: number; peakCcu: number; ownerEstimate: number; priceCents: number | null; isFree: boolean; contentType: "GAME" | "DLC" } | null;
  studio?: { name: string; avatarUrl: string | null; gameCount: number; def: number; games: { name: string; appid: string | null; hasCard: boolean; headerImage?: string | null }[]; about: string | null } | null;
};
type Player = { id: string; username: string; cardCount: number; isSelf: boolean };
type Battle = {
  id: string; challengerId: string; opponentId: string; status: "PENDING" | "ACTIVE" | "DECLINED" | "FINISHED";
  rulesVersion: number; challengerScore: number; opponentScore: number;
  challengerStakeCoins: number; opponentStakeCoins: number;
  challengerStakeCardId: string | null; opponentStakeCardId: string | null;
  challengerStakeCardName: string | null; opponentStakeCardName: string | null;
  challenger: { username: string }; opponent: { username: string };
  challengerDeck: PublicBattleCard[]; opponentDeck: PublicBattleCard[] | null;
  challengerIndex: number; opponentIndex: number; challengerHp: number; opponentHp: number;
  currentTurnId: string | null; question: BattleQuestion | null; winnerId: string | null;
  turnCount: number; createdAt: string; rewards: string[];
};

async function readJson(res: Response) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur réseau");
  return data;
}

function MiniCard({ card, hp, active }: { card?: PublicBattleCard; hp?: number; active?: boolean }) {
  if (!card) return <div className="battle-card-empty">Deck épuisé</div>;
  return <div className={`battle-card-mini ${active ? "battle-card-live" : ""}`}>
    {card.image ? <img src={card.image} alt="" /> : <div className="battle-image-fallback">⚙️</div>}
    <div className="battle-card-copy">
      <span className="battle-kind">{card.kind === "STUDIO" ? "Studio" : "Jeu"} · {card.rarity}</span>
      <strong>{card.name}</strong>
      <span className="battle-numbers">⚔ {card.attack} · 🛡 {hp ?? card.defense}/{card.defense}</span>
      <div className="battle-hp"><span style={{ width: `${Math.max(0, Math.min(100, ((hp ?? card.defense) / card.defense) * 100))}%` }} /></div>
    </div>
  </div>;
}

function StakePicker({ cards, playableIds, cardId, onCardChange, coins, onCoinsChange, balance }: {
  cards: OwnedCard[]; playableIds: string[]; cardId: string; onCardChange: (id: string) => void;
  coins: number; onCoinsChange: (value: number) => void; balance: number;
}) {
  const [search, setSearch] = useState("");
  const available = cards.filter((card) => !playableIds.includes(card.id) && card.sellable !== false &&
    (card.game?.name ?? card.studio?.name ?? "").toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <div className="battle-stake">
    <h3>Mise facultative</h3>
    <p className="battle-muted">La carte mise reste hors des 5 cartes jouables. Les pièces sont réservées dès l’envoi ou l’acceptation du défi ; le gagnant reçoit les mises des deux joueurs.</p>
    <label className="battle-label">Pièces misées · solde {balance}
      <input type="number" min="0" max={Math.min(1_000_000, balance)} step="1" value={coins} onChange={(event) => onCoinsChange(Number(event.target.value))} />
    </label>
    <label className="battle-label">Chercher une carte à miser
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom du jeu ou du studio…" />
    </label>
    <div className="battle-stake-list">
      {cardId && <button type="button" className="battle-stake-clear" onClick={() => onCardChange("")}>Retirer la carte misée</button>}
      {available.map((card) => {
        const name = card.game?.name ?? card.studio?.name ?? "Carte";
        return <button type="button" key={card.id} aria-pressed={cardId === card.id} className={`battle-pick ${cardId === card.id ? "battle-picked" : ""}`} onClick={() => onCardChange(cardId === card.id ? "" : card.id)}>
          {card.game?.headerImage || card.studio?.avatarUrl ? <img src={card.game?.headerImage ?? card.studio?.avatarUrl ?? ""} alt="" /> : <span>⚙️</span>}
          <span><strong>{name}</strong><small>{card.studio ? "Studio" : "Jeu"} · {card.rarity} · DEF {card.game?.def ?? card.studio?.def ?? "—"}</small></span>
          <b>{cardId === card.id ? "✓" : "+"}</b>
        </button>;
      })}
    </div>
  </div>;
}

function DeckPicker({ cards, selected, onChange, allowPreview }: { cards: OwnedCard[]; selected: string[]; onChange: (ids: string[]) => void; allowPreview: boolean }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  const [preview, setPreview] = useState<OwnedCard | null>(null);
  useEffect(() => {
    if (!allowPreview) return;
    if (!preview) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPreview(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [preview, allowPreview]);
  const filtered = useMemo(() => cards.filter((card) => (card.game?.name ?? card.studio?.name ?? "").toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a, b) => {
    if (sort === "atk") return b.atk - a.atk;
    return (a.game?.name ?? a.studio?.name ?? "").localeCompare(b.game?.name ?? b.studio?.name ?? "", "fr");
  }), [cards, search, sort]);
  return <div className="battle-picker">
    <div className="battle-picker-controls">
      <input aria-label="Rechercher une carte" placeholder="Rechercher une carte…" value={search} onChange={(event) => setSearch(event.target.value)} />
      <select aria-label="Trier les cartes" value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Nom</option><option value="atk">Attaque</option></select>
    </div>
    <p className="battle-muted">{selected.length}/5 cartes · ordre de passage : {selected.map((id) => cards.find((card) => card.id === id)?.game?.name ?? cards.find((card) => card.id === id)?.studio?.name).join(" → ") || "aucune"}</p>
    <div className="battle-picker-list">
      {filtered.map((card) => {
        const index = selected.indexOf(card.id);
        const name = card.game?.name ?? card.studio?.name ?? "Carte";
        return <div key={card.id} className={`battle-pick ${index >= 0 ? "battle-picked" : ""}`}>
          <button type="button" className="battle-pick-image" aria-label={allowPreview ? `Ouvrir la carte ${name}` : `Image de ${name}, aperçu indisponible pendant un combat`} onClick={() => { if (allowPreview) setPreview(card); }} disabled={!allowPreview}>
            {card.game?.headerImage || card.studio?.avatarUrl ? <img src={card.game?.headerImage ?? card.studio?.avatarUrl ?? ""} alt="" /> : <span>⚙️</span>}
          </button>
          <button type="button" className="battle-pick-select" aria-pressed={index >= 0} aria-label={`${index >= 0 ? "Retirer" : "Ajouter"} ${name} ${index >= 0 ? "du" : "au"} deck`} onClick={() => onChange(index >= 0 ? selected.filter((id) => id !== card.id) : selected.length < 5 ? [...selected, card.id] : selected)}>
            <span><strong>{name}</strong><small>{card.studio ? "Studio" : "Jeu"} · {card.rarity} · ATK {card.atk}</small></span><b>{index >= 0 ? index + 1 : "+"}</b>
          </button>
        </div>;
      })}
    </div>
    {allowPreview && preview && <div className="battle-preview-overlay" role="presentation" onClick={() => setPreview(null)}>
      <div className="battle-preview-dialog" role="dialog" aria-modal="true" aria-label={`Carte ${preview.game?.name ?? preview.studio?.name ?? ""}`} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="battle-preview-close" onClick={() => setPreview(null)} aria-label="Fermer la carte">×</button>
        {preview.game ? <GameCard id={preview.game.id} name={preview.game.name} headerImage={preview.game.headerImage} description={preview.game.description} atk={preview.atk} def={preview.game.def} rarity={preview.rarity} tags={preview.game.tags} developers={preview.game.developers} reviewScore={preview.game.reviewScore} peakCcu={preview.game.peakCcu} ownerEstimate={preview.game.ownerEstimate} priceCents={preview.game.priceCents} isFree={preview.game.isFree} contentType={preview.game.contentType} /> : preview.studio ? <StudioCard name={preview.studio.name} gameCount={preview.studio.gameCount} atk={preview.atk} def={preview.studio.def} rarity={preview.rarity} games={preview.studio.games} about={preview.studio.about} avatarUrl={preview.studio.avatarUrl} /> : null}
      </div>
    </div>}
  </div>;
}

export function BatailleClient() {
  const router = useRouter();
  const [selfId, setSelfId] = useState("");
  const [balance, setBalance] = useState(0);
  const [battles, setBattles] = useState<Battle[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playersLoaded, setPlayersLoaded] = useState(false);
  const [playersFailed, setPlayersFailed] = useState(false);
  const [cards, setCards] = useState<OwnedCard[]>([]);
  const [opponentId, setOpponentId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [stakeCardId, setStakeCardId] = useState("");
  const [stakeCoins, setStakeCoins] = useState(0);
  const [acceptId, setAcceptId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showNew, setShowNew] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await readJson(await fetch("/api/bataille", { cache: "no-store" }));
      setSelfId(data.selfId); setBalance(data.coins); setBattles(data.battles);
    } catch (err) { setError(err instanceof Error ? err.message : "Chargement impossible"); }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    void fetch("/api/joueurs", { cache: "no-store" })
      .then(readJson)
      .then((data: Player[]) => setPlayers(data.filter((player) => !player.isSelf)))
      .catch((err) => { setPlayersFailed(true); setError(`Joueurs : ${err instanceof Error ? err.message : "chargement impossible"}`); })
      .finally(() => setPlayersLoaded(true));
    void fetch("/api/collection", { cache: "no-store" })
      .then(readJson)
      .then((data: OwnedCard[]) => setCards(data))
      .catch((err) => setError(`Collection : ${err instanceof Error ? err.message : "chargement impossible"}`));
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 10000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setError(""); setNotice("");
    try {
      await readJson(await fetch(`/api/bataille/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) }));
      setNotice(action === "answer" ? "Réponse enregistrée. Tour suivant !" : "Combat actualisé.");
      setAcceptId(null); setSelected([]); setStakeCardId(""); setStakeCoins(0); await refresh();
      if (["answer", "accept", "cancel", "decline"].includes(action)) {
        const collection = await readJson(await fetch("/api/collection", { cache: "no-store" }));
        setCards(collection);
      }
      if (action === "answer") router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Action impossible"); await refresh(); }
    finally { setBusy(false); }
  }

  async function challenge() {
    setBusy(true); setError(""); setNotice("");
    try {
      await readJson(await fetch("/api/bataille", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opponentId, cardIds: selected, stakeCoins, stakeCardId: stakeCardId || null }) }));
      setNotice("Défi envoyé."); setSelected([]); setStakeCardId(""); setStakeCoins(0); setShowNew(false); await refresh();
      setCards(await readJson(await fetch("/api/collection", { cache: "no-store" })));
    } catch (err) { setError(err instanceof Error ? err.message : "Défi impossible"); }
    finally { setBusy(false); }
  }

  const active = battles.filter((battle) => battle.status === "ACTIVE");
  const pending = battles.filter((battle) => battle.status === "PENDING");
  const history = battles.filter((battle) => battle.status === "FINISHED").slice(0, 12);
  const selectedOpponent = players.find((player) => player.id === opponentId);
  const stakeValid = Number.isInteger(stakeCoins) && stakeCoins >= 0 && stakeCoins <= balance && !selected.includes(stakeCardId);
  return <div className="battle-page">
    <header className="battle-hero"><div><span className="battle-eyebrow">⚙ Arène Steam Masters</span><h1>Bataille</h1><p>Six manches, une question par joueur et par manche. Bonne réponse : 1 point et des dégâts ; carte adverse éliminée : 1 point supplémentaire. Premier à 6 points, sinon meilleur score après six manches. Égalité : mort subite.</p></div><button className="battle-primary" onClick={() => { setShowNew(!showNew); setAcceptId(null); setSelected([]); setStakeCardId(""); setStakeCoins(0); }}>{showNew ? "Fermer" : "+ Lancer un défi"}</button></header>
    <p className="battle-rules">La DEF des cartes est calculée entre 50 et 250 depuis l’estimation SteamSpy réelle. Chaque joueur reçoit moitié questions sur le deck adverse, moitié sur le catalogue. Une mise facultative en pièces et/ou une sixième carte hors combat peut être engagée ; le vainqueur remporte les mises. Les aperçus sont fermés pendant un combat actif. Récompense fixe : 3 pièces + 25 XP au gagnant, 5 XP au perdant, limitée aux 5 premiers combats du jour contre 5 adversaires différents (UTC).</p>
    {error && <p className="battle-alert" role="alert">{error}</p>}{notice && <p className="battle-notice" role="status">{notice}</p>}
    {showNew && <section className="battle-panel"><h2>Nouveau défi</h2><label className="battle-label">Adversaire<select value={opponentId} onChange={(event) => setOpponentId(event.target.value)}><option value="">{playersLoaded ? "Choisir un joueur" : "Chargement des joueurs…"}</option>{players.map((p) => <option value={p.id} key={p.id}>{p.username} · {p.cardCount} carte{p.cardCount > 1 ? "s" : ""}{p.cardCount < 5 ? " (5 requises)" : ""}</option>)}</select></label>{playersLoaded && !playersFailed && players.length === 0 && <p className="battle-muted">Aucun autre joueur actif pour le moment.</p>}{selectedOpponent && selectedOpponent.cardCount < 5 && <p className="battle-muted">Ce joueur doit posséder au moins 5 cartes pour accepter un duel.</p>}<h3>Ton deck, dans l’ordre</h3><DeckPicker key={active.length > 0 ? "locked" : "open"} cards={cards.filter((card) => !card.staked)} selected={selected} onChange={setSelected} allowPreview={active.length === 0} />
      <StakePicker cards={cards} playableIds={selected} cardId={stakeCardId} onCardChange={setStakeCardId} coins={stakeCoins} onCoinsChange={setStakeCoins} balance={balance} />
      <button disabled={busy || !selectedOpponent || selectedOpponent.cardCount < 5 || selected.length !== 5 || !stakeValid} className="battle-primary" onClick={() => void challenge()}>Envoyer le défi</button>
    </section>}
    <section className="battle-section"><div className="battle-section-heading"><h2>Combats en cours <span>{active.length}</span></h2><button className="battle-refresh" onClick={() => void refresh()}>Actualiser</button></div>{active.length === 0 && <p className="battle-muted">Aucun combat actif.</p>}{active.map((battle) => {
      const meChallenger = battle.challengerId === selfId;
      const myDeck = meChallenger ? battle.challengerDeck : battle.opponentDeck ?? [];
      const theirDeck = meChallenger ? battle.opponentDeck ?? [] : battle.challengerDeck;
      const myIndex = meChallenger ? battle.challengerIndex : battle.opponentIndex;
      const theirIndex = meChallenger ? battle.opponentIndex : battle.challengerIndex;
      const myHp = meChallenger ? battle.challengerHp : battle.opponentHp;
      const theirHp = meChallenger ? battle.opponentHp : battle.challengerHp;
      const theirName = meChallenger ? battle.opponent.username : battle.challenger.username;
      const myScore = meChallenger ? battle.challengerScore : battle.opponentScore;
      const theirScore = meChallenger ? battle.opponentScore : battle.challengerScore;
      return <article className="battle-panel" key={battle.id}>
        <div className="battle-duel-head"><h3>Toi <span>contre</span> {theirName}</h3><span>{battle.rulesVersion >= 2 ? `${battle.turnCount >= 12 ? "Mort subite" : `Manche ${Math.floor(battle.turnCount / 2) + 1}/6`} · ${myScore}–${theirScore}` : `Tour ${battle.turnCount + 1}`} · {battle.currentTurnId === selfId ? "À toi de jouer" : `En attente de ${theirName}`}</span></div>
        <div className="battle-arena"><div><p>Ton deck · {5 - myIndex} restantes</p><MiniCard card={myDeck[myIndex]} hp={myHp} active={battle.currentTurnId === selfId} /></div><div className="battle-versus">VS</div><div><p>{theirName} · {5 - theirIndex} restantes</p><MiniCard card={theirDeck[theirIndex]} hp={theirHp} active={battle.currentTurnId !== selfId} /></div></div>
        {battle.rulesVersion >= 2 && <p className="battle-muted">Mises : {battle.challengerStakeCoins + battle.opponentStakeCoins} pièce(s){battle.challengerStakeCardName ? ` · ${battle.challengerStakeCardName}` : ""}{battle.opponentStakeCardName ? ` · ${battle.opponentStakeCardName}` : ""}</p>}
        {battle.currentTurnId === selfId && battle.question && <div className="battle-question"><small>{battle.question.source === "OPPONENT" ? "Question sur le deck adverse" : battle.question.source === "CATALOG" ? "Question sur le catalogue" : "Question de combat"}</small><h4>{battle.question.text}</h4><div className="battle-options">{battle.question.options.map((option, index) => <button disabled={busy} key={`${option}-${index}`} onClick={() => void act(battle.id, "answer", { answer: index })}>{option}</button>)}</div></div>}
      </article>;
    })}</section>
    <section className="battle-section"><h2>Défis en attente <span>{pending.length}</span></h2>{pending.length === 0 && <p className="battle-muted">Aucun défi en attente.</p>}{pending.map((battle) => {
      const incoming = battle.opponentId === selfId;
      return <article className="battle-panel battle-pending" key={battle.id}>
        <div><h3>{incoming ? `${battle.challenger.username} te défie` : `Défi envoyé à ${battle.opponent.username}`}</h3><p className="battle-muted">{new Date(battle.createdAt).toLocaleString("fr-FR")}</p>{battle.rulesVersion >= 2 && <p className="battle-muted">Mise proposée : {battle.challengerStakeCoins} pièce(s){battle.challengerStakeCardName ? ` + ${battle.challengerStakeCardName}` : ""}</p>}</div>
        <div className="battle-actions">{incoming ? <><button className="battle-primary" onClick={() => { setAcceptId(acceptId === battle.id ? null : battle.id); setShowNew(false); setSelected([]); setStakeCardId(""); setStakeCoins(0); }}>Choisir mes 5 cartes</button><button className="battle-secondary" disabled={busy} onClick={() => void act(battle.id, "decline")}>Refuser</button></> : <button className="battle-secondary" disabled={busy} onClick={() => void act(battle.id, "cancel")}>Annuler</button>}</div>
        {acceptId === battle.id && <div className="battle-accept"><DeckPicker key={active.length > 0 ? "locked" : "open"} cards={cards.filter((card) => !card.staked)} selected={selected} onChange={setSelected} allowPreview={active.length === 0} />
          {battle.rulesVersion >= 2 && <StakePicker cards={cards} playableIds={selected} cardId={stakeCardId} onCardChange={setStakeCardId} coins={stakeCoins} onCoinsChange={setStakeCoins} balance={balance} />}
          <button className="battle-primary" disabled={busy || selected.length !== 5 || !stakeValid} onClick={() => void act(battle.id, "accept", { cardIds: selected, stakeCoins, stakeCardId: stakeCardId || null })}>Accepter le combat</button>
        </div>}
      </article>;
    })}</section>
    <section className="battle-section"><h2>Résultats récents</h2>{history.length === 0 && <p className="battle-muted">Aucun combat terminé.</p>}{history.map((battle) => <div className="battle-result" key={battle.id}><strong>{battle.winnerId === selfId ? "Victoire" : "Défaite"}</strong><span>contre {battle.challengerId === selfId ? battle.opponent.username : battle.challenger.username}{battle.rulesVersion >= 2 ? ` · ${battle.challengerId === selfId ? battle.challengerScore : battle.opponentScore}–${battle.challengerId === selfId ? battle.opponentScore : battle.challengerScore}` : ""}</span><small>{battle.rewards.includes(selfId) ? "Récompense obtenue" : "Sans récompense fixe (limite journalière)"}</small></div>)}</section>
  </div>;
}
