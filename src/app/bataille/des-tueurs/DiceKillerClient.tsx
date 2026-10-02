"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { DiceKillerEvent, DiceKillerView } from "@/lib/diceKiller";

type Player = { id: string; username: string; isSelf?: boolean };
type Owned = { id: string; sellable?: boolean; staked?: boolean; game?: { name: string } | null; studio?: { name: string } | null };
export type DiceKillerMatch = {
  id: string; rulesVersion: number; status: "PENDING" | "ACTIVE" | "DECLINED" | "FINISHED";
  challengerId: string; opponentId: string; challenger: { username: string }; opponent: { username: string };
  challengerStakeCoins: number; opponentStakeCoins: number; challengerStakeCardName?: string | null; opponentStakeCardName?: string | null;
  challengerStakeCardId?: string | null; opponentStakeCardId?: string | null;
  winnerId: string | null; diceKiller: DiceKillerView | null;
};

async function json(url: string, body?: unknown) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000), ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Chargement impossible.");
  return data;
}

const PIPS: Record<number, number[]> = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const DICE_REVEAL_MS = 2800;
const DICE_RESULTS = [
  { points: "5–10 points", effect: "Attaque aux 6 à 1", tone: "attack" },
  { points: "11 points", effect: "+1 dé de PV", tone: "heal" },
  { points: "12–17 points", effect: "+1 à 6 PV", tone: "heal" },
  { points: "18–23 points", effect: "Bouclier +6 à 1", tone: "shield" },
  { points: "24 points", effect: "+1 dé de PV", tone: "heal" },
  { points: "25–29 points", effect: "Attaque aux 1 à 5", tone: "attack" },
  { points: "30 points", effect: "ULTI · attaque 6 ×2", tone: "ulti" },
] as const;
type DiceColor = "orange" | "blue";

function Die({ value, index, color, revealing, held, selected, onClick }: { value: number; index: number; color: DiceColor; revealing: boolean; held?: boolean; selected?: boolean; onClick?: () => void }) {
  return <button type="button" className={`killer-die is-${color}${revealing ? " is-revealing" : ""}${held ? " is-held" : ""}${selected ? " is-selected" : ""}`} style={{ animationDelay: `${index * 150}ms` }} onClick={onClick} disabled={!onClick} aria-pressed={onClick ? Boolean(selected) : undefined} aria-label={`Dé ${value}${held ? ", gardé" : ""}${selected ? ", choisi" : ""}`}>
    <span className="killer-pixel-die">{Array.from({ length: 9 }, (_, pip) => <i key={pip} className={PIPS[value].includes(pip + 1) ? "is-pip" : ""} />)}</span>
    {selected && <span className="killer-die-choice" aria-hidden="true">✓</span>}
  </button>;
}

function DiceGroup({ label, dice, color, offset = 0, revealing, held, selectable, selected, select }: { label: string; dice: number[]; color: DiceColor; offset?: number; revealing: boolean; held?: boolean; selectable?: boolean; selected?: number[]; select?: (index: number) => void }) {
  if (!dice.length) return null;
  return <div className={`killer-dice-group${held ? " is-kept" : ""}`}><strong>{label}</strong><div>{dice.map((die, index) => <Die key={`${held ? "h" : "d"}-${index}`} value={die} index={offset + index} color={color} revealing={revealing && !held} held={held} selected={selected?.includes(index)} onClick={selectable && select ? () => select(index) : undefined} />)}</div></div>;
}

function DiceResultMap({ compact = false }: { compact?: boolean }) {
  return <section className={`killer-combo-map${compact ? " is-compact" : ""}`} aria-label="Combinaisons et points des dés">
    {!compact && <h3>Combinaisons des dés <small>additionne tes 5 dés</small></h3>}
    <div>{DICE_RESULTS.map((result) => <article className={`is-${result.tone}`} key={result.points}><b>{result.points}</b><span>{result.effect}</span></article>)}</div>
  </section>;
}

export function DiceArena({ match, busy, play }: { match: DiceKillerMatch; busy: boolean; play: (move: object, revision: number) => void }) {
  const state = match.diceKiller!;
  const [selected, setSelected] = useState<number[]>([]);
  const [revealing, setRevealing] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastEventRevision = state.lastEvent?.revision;
  useEffect(() => {
    timers.current.forEach(clearTimeout);
    if (lastEventRevision === undefined) return;
    timers.current = [
      setTimeout(() => { setSelected([]); setRevealing(true); }, 0),
      setTimeout(() => setRevealing(false), DICE_REVEAL_MS),
    ];
    return () => timers.current.forEach(clearTimeout);
  }, [lastEventRevision]);
  const myTurn = state.turn === state.side && state.phase !== "FINISHED";
  const names = [match.challenger.username, match.opponent.username];
  const eventText = describeEvent(state.lastEvent, names, state.side);
  const guide = describeNextAction(state, names, myTurn, selected.length);
  const eventOwner = state.lastEvent?.side ?? state.turn;
  const lastDiceLabel = state.lastEvent?.kind === "ATTACK_READY" ? `Total final de ${names[eventOwner]}` : state.lastEvent?.kind === "HIT" || state.lastEvent?.kind === "MISS" ? `Jet d’attaque de ${names[eventOwner]}` : `Dernier lancer de ${names[eventOwner]}`;
  const otherSide = (1 - state.side) as 0 | 1;
  const colorFor = (side: 0 | 1): DiceColor => side === 0 ? "orange" : "blue";
  const renderZone = (side: 0 | 1, isSelf: boolean) => {
    const color = colorFor(side);
    const showsBuild = state.phase === "BUILD" && state.turn === side && state.roll.length > 0;
    const shownDice = state.displayDice[side];
    const ownsLatestEvent = state.lastEvent?.side === side;
    return <section className={`killer-player-zone is-${color}${isSelf ? " is-self" : " is-opponent"}`}>
      <header><span>{isSelf ? "TOI · EN BAS" : "ADVERSAIRE · EN HAUT"}</span><b>{names[side]}</b><strong>♥ {state.hp[side]} PV <em><i aria-hidden="true" /> {state.shield[side]}/6</em></strong></header>
      <div className="killer-zone-dice" key={`${side}-${state.lastEvent?.revision ?? 0}`}>
        {showsBuild ? <>
          <DiceGroup label="Dés gardés" dice={state.held} color={color} revealing={false} held />
          <DiceGroup label={isSelf ? "Tes dés à choisir" : `Dés de ${names[side]}`} dice={state.roll} color={color} offset={state.held.length} revealing={revealing} selectable={isSelf && myTurn} selected={selected} select={(index) => setSelected((old) => old.includes(index) ? old.filter((item) => item !== index) : [...old, index])} />
        </> : shownDice.length ? <DiceGroup label={ownsLatestEvent ? lastDiceLabel : `Dernier jeu de ${names[side]}`} dice={shownDice} color={color} revealing={ownsLatestEvent && revealing} held={ownsLatestEvent && state.lastEvent?.kind === "ATTACK_READY"} /> : <div className={`killer-dice-placeholder is-${color}`} aria-label={`${names[side]} n’a pas encore lancé`}><strong>Premier lancer à venir</strong><div>{Array.from({ length: 5 }, (_, index) => <i key={index}>?</i>)}</div></div>}
      </div>
      {isSelf && myTurn && state.phase === "BUILD" && state.roll.length > 0 && <div className="killer-selection-tools" aria-live="polite"><strong>{selected.length}/{state.roll.length} choisi{selected.length > 1 ? "s" : ""}</strong><button type="button" onClick={() => setSelected(state.roll.map((_, index) => index))}>Tout choisir</button><button type="button" onClick={() => setSelected([])} disabled={!selected.length}>Annuler</button></div>}
    </section>;
  };
  const actionLabel = state.phase === "FINISHED" ? "Terminé" : !myTurn ? "Attente" : state.phase === "ATTACK" ? `Attaquer · ${state.attackValue}${state.attackMultiplier === 2 ? " ×2" : ""}` : !state.roll.length ? "Lancer les dés" : !selected.length ? "Choisir un dé" : selected.length === state.roll.length ? "Calculer" : `Garder ${selected.length}`;
  const actionDisabled = busy || revealing || !myTurn || (state.phase === "BUILD" && state.roll.length > 0 && !selected.length);
  const act = () => {
    if (state.phase === "ATTACK") play({ type: "attack" }, state.revision);
    else if (!state.roll.length) play({ type: "roll" }, state.revision);
    else play({ type: "keep", indices: selected }, state.revision);
  };
  return <div className="killer-arena">
    <div className={`killer-tray${state.side === 1 ? " is-blue-view" : ""}`}>
      <Image src="/images/battle/dice-killer-board-v3.png" alt="" fill sizes="(max-width: 760px) 100vw, 1180px" priority />
      <div className="killer-tray-content">
        {renderZone(otherSide, false)}
        <div className="killer-board-center">{eventText ? <div key={lastEventRevision} className={`killer-event is-${eventText.tone}`}><small>{eventText.eyebrow}</small><strong>{eventText.title}</strong><span>{eventText.detail}</span>{eventText.calculation && <em>{eventText.calculation}</em>}</div> : <span>⚙ DUEL ⚙</span>}</div>
        {renderZone(state.side, true)}
      </div>
      {match.status === "ACTIVE" && <div className="killer-initiative" role="status" aria-live="assertive"><Image src="/images/battle/dice-initiative.png" alt="" width={1983} height={793} priority /><div><small>LE SÉLECTEUR TOURNE…</small><strong>{names[state.starter]} commence</strong></div></div>}
      <button type="button" className={`killer-action-orb${myTurn ? " is-ready" : ""}`} disabled={actionDisabled} onClick={act}><Image src="/images/battle/dice-action-button.png" alt="" fill sizes="130px" /><span>{actionLabel}</span></button>
    </div>
    <DiceResultMap />
    <div className={`killer-turn${myTurn ? " is-active" : " is-waiting"}`}><b>{guide.step}</b><span>{guide.title}</span><small>{guide.detail}</small></div>
    <details className="escalade-journal"><summary>Journal du duel</summary><ol>{state.log.map((line, index) => <li key={index}>{line.replace(/\bA\b/g, names[0]).replace(/\bB\b/g, names[1])}</li>)}</ol></details>
  </div>;
}

export function DiceKillerRules({ close }: { close: () => void }) {
  return <div className="killer-rules-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="killer-rules-dialog" role="dialog" aria-modal="true" aria-labelledby="killer-rules-title">
      <button className="killer-rules-close" onClick={close} aria-label="Fermer les règles">×</button>
      <span className="battle-eyebrow">RÈGLES FACILES</span><h2 id="killer-rules-title">Le but : faire tomber les 30 PV de l’autre joueur</h2>
      <div className="killer-rule-steps">
        <article><b>1</b><div><h3>Lance les 5 dés</h3><p>Tout le monde voit les dés. Quand l’autre joue, tu regardes simplement son lancer.</p></div></article>
        <article><b>2</b><div><h3>Garde au moins 1 dé</h3><p>Quand c’est ton tour, clique sur les dés que tu veux garder. Le jeu relance les autres.</p></div></article>
        <article className="is-example"><b>3</b><div><h3>Regarde le total</h3><p>Quand les 5 dés sont gardés, le jeu les additionne et explique le résultat avec le calcul.</p></div></article>
        <article><b>4</b><div><h3>Bouclier ou attaque</h3><p>18 à 23 charge jusqu’à 6 points de bouclier. Un total de 30 déclenche une attaque ultime aux dégâts doublés.</p></div></article>
      </div>
      <DiceResultMap compact />
      <p className="killer-rules-tip"><strong>Astuce :</strong> le gros bouton rouge reste dans le coin du plateau. Sans aucune mise, le vainqueur d’un vrai duel reçoit 50 gigapuissances de la banque ; l’entraînement ne rapporte rien.</p>
      <button className="battle-primary" onClick={close}>J’ai compris, jouer</button>
    </section>
  </div>;
}

export function DiceVictorySplash({ match, selfId, close, training = false }: { match: DiceKillerMatch; selfId: string; close: () => void; training?: boolean }) {
  const winnerName = match.winnerId === match.challengerId ? match.challenger.username : match.opponent.username;
  const isWinner = match.winnerId === selfId;
  const noStake = match.challengerStakeCoins === 0 && match.opponentStakeCoins === 0 && !match.challengerStakeCardId && !match.opponentStakeCardId;
  const coins = training ? 0 : noStake && isWinner ? 50 : isWinner ? match.challengerStakeCoins + match.opponentStakeCoins : 0;
  const rewardLabel = noStake ? "Récompense de la banque" : [coins > 0 ? "Mise en gigapuissances remportée" : "", match.challengerStakeCardName || match.opponentStakeCardName ? "Carte mise remportée" : ""].filter(Boolean).join(" · ");
  return <div className="killer-victory-overlay" role="presentation">
    <section className="killer-victory" role="dialog" aria-modal="true" aria-labelledby="killer-victory-title">
      <Image src="/images/battle/dice-victory.png" alt="" width={1536} height={1024} priority />
      <div className="killer-victory-title"><small>{isWinner ? "VICTOIRE" : "DUEL TERMINÉ"}</small><h2 id="killer-victory-title">{winnerName} remporte la partie</h2></div>
      <div className="killer-victory-reward">{training ? <span>Entraînement · aucun gain</span> : isWinner ? <>{coins > 0 && <b>+{coins} gigapuissances</b>}<span>{rewardLabel}</span></> : <span>Les gains reviennent à {winnerName}</span>}</div>
      <button type="button" onClick={close}>Valider</button>
    </section>
  </div>;
}

function describeEvent(event: DiceKillerEvent | null, names: string[], side: 0 | 1) {
  if (!event) return null;
  const who = event.side === side ? "Tu" : names[event.side];
  if (event.kind === "ROLL") return { tone: "roll", eyebrow: "LES DÉS SONT VISIBLES", title: `${who} ${event.side === side ? "as" : "a"} lancé les dés`, detail: "Le joueur doit maintenant en garder au moins un.", calculation: `Total montré : ${event.dice.reduce((sum, die) => sum + die, 0)}` };
  if (event.kind === "ATTACK_READY") return { tone: event.multiplier === 2 ? "ulti" : "attack", eyebrow: event.multiplier === 2 ? "TOTAL 30 · ULTIME" : `TOTAL ${event.total}`, title: event.multiplier === 2 ? "Attaque ultime aux 6 prête" : `Une attaque aux ${event.attackValue} est prête`, detail: event.multiplier === 2 ? "Chaque touche infligera le double de dégâts." : `Il faut maintenant lancer les dés et chercher le chiffre ${event.attackValue}.`, calculation: event.multiplier === 2 ? "6 dégâts par touche × 2 = 12" : event.total! < 11 ? `11 − ${event.total} = ${event.attackValue}` : `${event.total} − 24 = ${event.attackValue}` };
  if (event.kind === "HEAL") return { tone: "heal", eyebrow: "DES PV EN PLUS", title: `+${event.amount} PV pour ${event.side === side ? "toi" : names[event.side]}`, detail: event.total === 11 || event.total === 24 ? `Le total exact ${event.total} donne un dé bonus. Il a donné ${event.amount}.` : `Un total entre 12 et 17 soigne le joueur.`, calculation: event.total === 11 || event.total === 24 ? `${event.total} exact → dé bonus = ${event.amount}` : `${event.total} − 11 = ${event.amount}` };
  if (event.kind === "SHIELD") return { tone: "shield", eyebrow: "BOUCLIER CHARGÉ", title: `Bouclier à ${event.shieldTotal}/6 pour ${event.side === side ? "toi" : names[event.side]}`, detail: event.amount ? `Il bloquera jusqu’à ${event.shieldTotal} dégâts de la prochaine attaque.` : "Le bouclier était déjà chargé au maximum.", calculation: `24 − ${event.total} = ${24 - event.total!} · plafond 6` };
  if (event.kind === "HIT") return { tone: event.multiplier === 2 ? "ulti" : "attack", eyebrow: event.multiplier === 2 ? "ULTIME EN COURS" : "ATTAQUE RÉUSSIE", title: `${event.hits} dé${event.hits! > 1 ? "s" : ""} ${event.attackValue} trouvé${event.hits! > 1 ? "s" : ""}`, detail: event.multiplier === 2 ? "Ces touches compteront double. Les autres dés sont relancés." : "Ces dés sont gardés. Les autres vont être relancés pour essayer d’en trouver encore.", calculation: `${event.hits} nouvelle${event.hits! > 1 ? "s" : ""} touche${event.hits! > 1 ? "s" : ""}${event.multiplier === 2 ? " ×2" : ""}` };
  const rawDamage = event.hits! * event.attackValue! * (event.multiplier ?? 1);
  return { tone: event.multiplier === 2 ? "ulti" : "danger", eyebrow: event.multiplier === 2 ? "ULTIME TERMINÉ" : "ATTAQUE TERMINÉE", title: `${event.amount} dégât${event.amount! > 1 ? "s" : ""}`, detail: event.blocked ? `Le bouclier a bloqué ${event.blocked} dégât${event.blocked > 1 ? "s" : ""}.` : "Aucun bouclier n’a réduit les dégâts.", calculation: event.blocked ? `${event.hits} × ${event.attackValue}${event.multiplier === 2 ? " × 2" : ""} = ${rawDamage} − ${event.blocked} bouclier = ${event.amount}` : `${event.hits} × ${event.attackValue}${event.multiplier === 2 ? " × 2" : ""} = ${event.amount}` };
}

function describeNextAction(state: DiceKillerView, names: string[], myTurn: boolean, selected: number) {
  if (state.phase === "FINISHED") return { step: "PARTIE TERMINÉE", title: `${names[state.winner ?? 0]} a gagné`, detail: "Les PV sont arrivés à 0. Il n’y a plus rien à jouer." };
  if (!myTurn) return { step: "TU REGARDES", title: `C’est au tour de ${names[state.turn]}`, detail: "Ses dés sont affichés sur le plateau. Tu n’as rien à cliquer pour le moment." };
  if (state.phase === "ATTACK") return { step: state.attackMultiplier === 2 ? "À TOI · ULTIME ×2" : "À TOI · ATTAQUE", title: `Cherche le chiffre ${state.attackValue}`, detail: `Appuie sur le bouton. Chaque dé ${state.attackValue} trouvé ajoutera ${state.attackValue! * state.attackMultiplier} dégâts.` };
  if (!state.roll.length) return { step: "À TOI · ÉTAPE 1", title: "Lance tes 5 dés", detail: "Appuie sur le bouton rouge. Les cinq résultats apparaîtront doucement." };
  if (!selected) return { step: "À TOI · ÉTAPE 2", title: "Choisis au moins 1 dé", detail: "Clique sur un ou plusieurs dés. Un contour lumineux montre ceux que tu as choisis." };
  if (selected === state.roll.length) return { step: "À TOI · ÉTAPE 3", title: "Tous les dés sont choisis", detail: "Appuie sur le bouton : le jeu va additionner les 5 dés et expliquer le résultat." };
  return { step: "À TOI · ÉTAPE 3", title: `${selected} dé${selected > 1 ? "s" : ""} choisi${selected > 1 ? "s" : ""}`, detail: `Appuie sur le bouton pour les garder et relancer les ${state.roll.length - selected} autres.` };
}

export function DiceKillerClient() {
  const [matches, setMatches] = useState<DiceKillerMatch[]>([]); const [self, setSelf] = useState(""); const [balance, setBalance] = useState(0);
  const [players, setPlayers] = useState<Player[]>([]); const [owned, setOwned] = useState<Owned[]>([]);
  const [opponent, setOpponent] = useState(""); const [coins, setCoins] = useState(0); const [stake, setStake] = useState(""); const [search, setSearch] = useState("");
  const [form, setForm] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [loaded, setLoaded] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [victoryId, setVictoryId] = useState<string | null>(null);
  const lock = useRef(false);
  const knownStatuses = useRef(new Map<string, DiceKillerMatch["status"]>());
  const refresh = useCallback(async () => {
    const data = await json("/api/bataille") as { battles: DiceKillerMatch[]; selfId: string; coins: number };
    for (const match of data.battles) if (match.rulesVersion === 4 && knownStatuses.current.get(match.id) === "ACTIVE" && match.status === "FINISHED") setVictoryId(match.id);
    knownStatuses.current = new Map(data.battles.map((match) => [match.id, match.status]));
    setMatches(data.battles); setSelf(data.selfId); setBalance(data.coins); setLoaded(true);
    return data;
  }, []);
  useEffect(() => {
    const report = (reason: unknown) => setError(reason instanceof Error ? reason.message : "Erreur réseau.");
    const initial = setTimeout(() => {
      void refresh().catch(report);
      void json("/api/joueurs").then((data: Player[]) => setPlayers(data.filter((player) => !player.isSelf).sort((a, b) => a.username.localeCompare(b.username, "fr")))).catch(report);
      void json("/api/collection").then(setOwned).catch(report);
    }, 0);
    const timer = setInterval(() => { if (document.visibilityState === "visible" && !lock.current) void refresh().catch(report); }, 10000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [refresh]);
  async function submit(id: string | null, action: string, extra: Record<string, unknown> = {}) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await json(id ? `/api/bataille/${id}` : "/api/bataille", id ? { action, ...extra } : { mode: "DICE_KILLER", opponentId: opponent, stakeCoins: coins, stakeCardId: stake || null });
      setForm(null); setStake(""); setCoins(0); await refresh(); setNotice(id ? "Action enregistrée." : "Défi de dés envoyé.");
      void json("/api/collection").then(setOwned).catch(() => {});
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Action impossible."); await refresh().catch(() => {}); }
    finally { lock.current = false; setBusy(false); }
  }
  const diceMatches = matches.filter((match) => match.rulesVersion === 4);
  const victoryMatch = victoryId ? diceMatches.find((match) => match.id === victoryId) ?? null : null;
  const active = diceMatches.filter((match) => match.status === "ACTIVE"); const pending = diceMatches.filter((match) => match.status === "PENDING");
  const cardName = (card: Owned) => card.game?.name ?? card.studio?.name ?? "Carte";
  const validStake = Number.isInteger(coins) && coins >= 0 && coins <= balance && coins <= 1_000_000;
  function stakeForm(id: string | null) { return <div className="killer-stake-form"><details className="battle-stake" open><summary>Mise facultative · {coins} GP{stake ? " + une carte" : ""}</summary><p>Comme dans L’Escalade, la mise reste bloquée jusqu’à la fin et le vainqueur remporte tout.</p><label className="battle-label">Gigapuissances · solde {balance}<input type="number" min={0} max={Math.min(balance, 1_000_000)} value={coins} onChange={(event) => setCoins(Number(event.target.value))}/></label><label className="battle-label">Rechercher une carte à miser<input value={search} onChange={(event) => setSearch(event.target.value)}/></label>{stake && <button className="battle-secondary" onClick={() => setStake("")}>Retirer la carte misée</button>}<div className="escalade-stakes">{owned.filter((card) => card.sellable !== false && !card.staked && cardName(card).toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((card) => <button key={card.id} className={`battle-secondary ${stake === card.id ? "escalade-selected" : ""}`} onClick={() => setStake(stake === card.id ? "" : card.id)}>{cardName(card)}{stake === card.id ? " ✓" : ""}</button>)}</div></details><button className="battle-primary" disabled={busy || !validStake || (!id && !opponent)} onClick={() => void submit(id, id ? "accept" : "create", { stakeCoins: coins, stakeCardId: stake || null })}>{id ? "Accepter le duel" : "Envoyer le défi"}</button></div>; }
  return <div className="battle-page killer-page"><header className="battle-hero killer-hero"><div><span className="battle-eyebrow">⚄ Arène pixel</span><h1>Combat de dés</h1><p>Le Killer en duel asynchrone : tous les dés sont visibles et le plateau explique chaque action, même pendant le tour de l’adversaire.</p></div><div className="battle-actions"><button className="escalade-tuto-button" onClick={() => setRulesOpen(true)}>? Règles faciles</button><a href="/bataille/des-tueurs/entrainement" className="escalade-tuto-button">🤖 Entraînement</a><button className="battle-primary" onClick={() => setForm(form === "new" ? null : "new")}>{form === "new" ? "Fermer" : "+ Lancer un défi"}</button></div></header>
    {rulesOpen && <DiceKillerRules close={() => setRulesOpen(false)} />}
    {victoryMatch && <DiceVictorySplash match={victoryMatch} selfId={self} close={() => setVictoryId(null)} />}
    <div className="killer-quick-guide"><span><b>1</b>Lance</span><i>→</i><span><b>2</b>Garde au moins 1 dé</span><i>→</i><span><b>3</b>Relance le reste</span><i>→</i><span><b>4</b>Le total décide</span></div>
    {error && <p className="battle-alert" role="alert">{error}</p>}{notice && <p className="battle-notice" role="status">{notice}</p>}
    {form === "new" && <section className="battle-panel"><h2>Nouveau défi de dés</h2><label className="battle-label">Adversaire<select value={opponent} onChange={(event) => setOpponent(event.target.value)}><option value="">Choisir un joueur</option>{players.map((player) => <option key={player.id} value={player.id}>{player.username}</option>)}</select></label>{stakeForm(null)}</section>}
    <section className="battle-section"><div className="battle-section-heading"><h2>Duels en cours · {active.length}</h2><button className="battle-refresh" disabled={busy} onClick={() => void refresh()}>Actualiser</button></div>{!loaded && <p>Chargement…</p>}{loaded && !active.length && <p>Aucun duel de dés actif.</p>}{active.map((match) => <article className="battle-panel" key={match.id}><p className="battle-muted">Mises : {match.challengerStakeCoins + match.opponentStakeCoins} gigapuissances{match.challengerStakeCardName ? ` · ${match.challengerStakeCardName}` : ""}{match.opponentStakeCardName ? ` · ${match.opponentStakeCardName}` : ""}</p>{match.diceKiller && <DiceArena match={match} busy={busy} play={(move, revision) => void submit(match.id, "play", { move, revision })}/>}</article>)}</section>
    <section className="battle-section"><h2>Défis en attente · {pending.length}</h2>{pending.map((match) => <article className="battle-panel" key={match.id}><h3>{match.challenger.username} contre {match.opponent.username}</h3><p>Mise proposée : {match.challengerStakeCoins} gigapuissances{match.challengerStakeCardName ? ` + ${match.challengerStakeCardName}` : ""}.</p>{match.challengerId === self ? <button className="battle-secondary" disabled={busy} onClick={() => void submit(match.id, "cancel")}>Annuler et récupérer ma mise</button> : <><div className="battle-actions"><button className="battle-primary" disabled={busy} onClick={() => setForm(form === match.id ? null : match.id)}>Répondre au défi</button><button className="battle-secondary" disabled={busy} onClick={() => void submit(match.id, "decline")}>Refuser</button></div>{form === match.id && stakeForm(match.id)}</>}</article>)}</section>
    <section className="battle-section"><h2>Résultats récents</h2>{diceMatches.filter((match) => match.status === "FINISHED").slice(0, 12).map((match) => <details className="battle-panel" key={match.id}><summary>{match.winnerId === self ? "Victoire" : "Défaite"} · {match.challenger.username} / {match.opponent.username}</summary>{match.diceKiller && <DiceArena match={match} busy play={() => {}}/>}</details>)}</section>
  </div>;
}
