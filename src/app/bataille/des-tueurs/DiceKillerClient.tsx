"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import type { DiceKillerEvent, DiceKillerView } from "@/lib/diceKiller";

type Player = { id: string; username: string; isSelf?: boolean };
type Owned = { id: string; sellable?: boolean; staked?: boolean; game?: { name: string } | null; studio?: { name: string } | null };
export type DiceKillerMatch = {
  id: string; rulesVersion: number; status: "PENDING" | "ACTIVE" | "DECLINED" | "FINISHED";
  challengerId: string; opponentId: string; challenger: { username: string }; opponent: { username: string };
  challengerStakeCoins: number; opponentStakeCoins: number; challengerStakeCardName?: string | null; opponentStakeCardName?: string | null;
  winnerId: string | null; diceKiller: DiceKillerView | null;
};

async function json(url: string, body?: unknown) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000), ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Chargement impossible.");
  return data;
}

const PIPS: Record<number, number[]> = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const FINAL: Record<number, string> = { 1: "rotateX(-12deg) rotateY(18deg)", 2: "rotateX(-12deg) rotateY(-72deg)", 3: "rotateX(-102deg) rotateY(8deg)", 4: "rotateX(78deg) rotateY(-8deg)", 5: "rotateX(-8deg) rotateY(108deg)", 6: "rotateX(-8deg) rotateY(198deg)" };
const DICE_ROLL_MS = 1950;

function Face({ value, side }: { value: number; side: string }) {
  return <span className={`killer-die-face face-${side}`}>{Array.from({ length: 9 }, (_, index) => <i key={index} className={PIPS[value].includes(index + 1) ? "is-pip" : ""} />)}</span>;
}

function Die({ value, index, rolling, held, selected, onClick }: { value: number; index: number; rolling: boolean; held?: boolean; selected?: boolean; onClick?: () => void }) {
  const directions = [-1, 1, -.65, .8, -.85];
  const direction = directions[index % directions.length];
  return <button type="button" className={`killer-die${rolling ? " is-rolling" : ""}${held ? " is-held" : ""}${selected ? " is-selected" : ""}`} style={{ "--die-index": index, "--roll-start-x": `${direction * -105}px`, "--roll-x-1": `${direction * 48}px`, "--roll-x-2": `${direction * -28}px`, "--roll-x-3": `${direction * 20}px`, "--roll-x-4": `${direction * -11}px`, "--roll-x-5": `${direction * 6}px`, "--roll-x-6": `${direction * -2}px`, "--final-transform": FINAL[value] } as CSSProperties} onClick={onClick} disabled={!onClick} aria-pressed={selected} aria-label={`Dé ${value}${held ? ", gardé" : ""}`}>
    <span className="killer-die-cube"><Face value={1} side="front"/><Face value={6} side="back"/><Face value={2} side="right"/><Face value={5} side="left"/><Face value={3} side="top"/><Face value={4} side="bottom"/></span>
  </button>;
}

export function DiceArena({ match, busy, play }: { match: DiceKillerMatch; busy: boolean; play: (move: object, revision: number) => void }) {
  const state = match.diceKiller!;
  const [selected, setSelected] = useState<number[]>([]);
  const [rolling, setRolling] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastEventRevision = state.lastEvent?.revision;
  useEffect(() => {
    timers.current.forEach(clearTimeout);
    if (lastEventRevision === undefined) return;
    timers.current = [
      setTimeout(() => { setSelected([]); setRolling(true); }, 0),
      setTimeout(() => setRolling(false), DICE_ROLL_MS),
    ];
    return () => timers.current.forEach(clearTimeout);
  }, [lastEventRevision]);
  const myTurn = state.turn === state.side && state.phase !== "FINISHED";
  const names = [match.challenger.username, match.opponent.username];
  const eventText = describeEvent(state.lastEvent, names, state.side);
  return <div className="killer-arena">
    <div className="killer-scoreboard"><div className={state.side === 0 ? "is-me" : ""}><small>{state.side === 0 ? "TOI" : "ADVERSAIRE"}</small><b>{names[0]}</b><strong>♥ {state.hp[0]} PV</strong></div><span>VS</span><div className={state.side === 1 ? "is-me" : ""}><small>{state.side === 1 ? "TOI" : "ADVERSAIRE"}</small><b>{names[1]}</b><strong>♥ {state.hp[1]} PV</strong></div></div>
    <div className="killer-tray">
      <Image src="/images/battle/dice-killer-table.png" alt="" fill sizes="(max-width: 760px) 100vw, 1180px" priority />
      <div className="killer-tray-content">
        {eventText && <div className="killer-event"><small>{eventText.eyebrow}</small><strong>{eventText.title}</strong><span>{eventText.detail}</span></div>}
        <div className="killer-dice-row" key={state.lastEvent?.revision ?? 0}>
          {state.phase === "BUILD" && state.held.map((die, index) => <Die key={`h-${index}`} value={die} index={index} rolling={false} held />)}
          {state.phase === "BUILD" && state.roll.map((die, index) => <Die key={`r-${index}`} value={die} index={state.held.length + index} rolling={rolling} selected={selected.includes(index)} onClick={myTurn && !rolling ? () => setSelected((old) => old.includes(index) ? old.filter((item) => item !== index) : [...old, index]) : undefined} />)}
          {state.phase === "BUILD" && !state.held.length && !state.roll.length && state.lastEvent?.dice.map((die, index) => <Die key={`e-${index}`} value={die} index={index} rolling={rolling} />)}
          {state.phase === "ATTACK" && (state.lastEvent?.dice ?? []).map((die, index) => <Die key={`a-${index}`} value={die} index={index} rolling={rolling} held={state.attackValue === die && state.lastEvent?.kind === "HIT"} />)}
        </div>
      </div>
    </div>
    <div className={`killer-turn${myTurn ? " is-active" : ""}`}><span>{myTurn ? "À toi de jouer" : state.phase === "FINISHED" ? "Duel terminé" : "Tour de l’adversaire"}</span><small>{state.phase === "BUILD" ? state.roll.length ? "Choisis au moins un dé à garder." : "Commence ton lancer de cinq dés." : state.phase === "ATTACK" ? `Attaque aux ${state.attackValue} · ${state.attackHits} touche(s) accumulée(s).` : `${names[state.winner ?? 0]} remporte les mises.`}</small></div>
    {myTurn && <div className="battle-actions killer-actions">
      {state.phase === "BUILD" && !state.roll.length && <button className="battle-primary" disabled={busy || rolling} onClick={() => play({ type: "roll" }, state.revision)}>Lancer les dés</button>}
      {state.phase === "BUILD" && state.roll.length > 0 && <button className="battle-primary" disabled={busy || rolling || !selected.length} onClick={() => play({ type: "keep", indices: selected }, state.revision)}>Garder {selected.length || "…"} et relancer</button>}
      {state.phase === "ATTACK" && <button className="battle-primary killer-attack-button" disabled={busy || rolling} onClick={() => play({ type: "attack" }, state.revision)}>Lancer l’attaque aux {state.attackValue}</button>}
    </div>}
    <details className="escalade-journal"><summary>Journal du duel</summary><ol>{state.log.map((line, index) => <li key={index}>{line.replace(/\bA\b/g, names[0]).replace(/\bB\b/g, names[1])}</li>)}</ol></details>
  </div>;
}

export function DiceKillerRules({ close }: { close: () => void }) {
  return <div className="killer-rules-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="killer-rules-dialog" role="dialog" aria-modal="true" aria-labelledby="killer-rules-title">
      <button className="killer-rules-close" onClick={close} aria-label="Fermer les règles">×</button>
      <span className="battle-eyebrow">RÈGLES EN 4 ÉTAPES</span><h2 id="killer-rules-title">Le but : faire tomber l’adversaire à 0 PV</h2>
      <div className="killer-rule-steps">
        <article><b>1</b><div><h3>Lance les 5 dés</h3><p>Après chaque lancer, clique sur <strong>au moins un dé</strong> à garder. Les autres seront relancés.</p></div></article>
        <article><b>2</b><div><h3>Fabrique ton total</h3><p>Tu recommences jusqu’à avoir gardé les 5 dés. Ce total décide immédiatement ce qui arrive.</p></div></article>
        <article className="is-example"><b>3</b><div><h3>Exemple : 1 + 1 + 2 + 2 + 3 = 9</h3><p>9 est sous 11. La différence est <strong>11 − 9 = 2</strong> : tu obtiens donc une <strong>attaque aux 2</strong>.</p></div></article>
        <article><b>4</b><div><h3>Lance ton attaque</h3><p>Chaque dé affichant 2 vaut 2 dégâts. Tant que tu trouves au moins un 2, les autres dés repartent. Le premier lancer sans 2 termine l’attaque.</p></div></article>
      </div>
      <div className="killer-result-map"><div className="is-attack"><b>5–10</b><span>Attaque 6 à 1</span></div><div className="is-heal"><b>11–17</b><span>Tu récupères des PV</span></div><div className="is-danger"><b>18–23</b><span>Tu perds des PV</span></div><div className="is-heal"><b>24</b><span>Régénération</span></div><div className="is-attack"><b>25–30</b><span>Attaque 1 à 6</span></div></div>
      <p className="killer-rules-tip"><strong>À retenir :</strong> vise un total très bas ou très haut pour attaquer. L’interface te dira toujours quoi cliquer ensuite.</p>
      <button className="battle-primary" onClick={close}>J’ai compris, jouer</button>
    </section>
  </div>;
}

function describeEvent(event: DiceKillerEvent | null, names: string[], side: 0 | 1) {
  if (!event) return null;
  const who = event.side === side ? "Tu" : names[event.side];
  if (event.kind === "ROLL") return { eyebrow: "LANCER EN COURS", title: `${who} ${event.side === side ? "fais" : "fait"} rouler les dés`, detail: "Garde au moins un dé avant la prochaine relance." };
  if (event.kind === "ATTACK_READY") return { eyebrow: `TOTAL ${event.total}`, title: `Attaque aux ${event.attackValue}`, detail: "Chaque dé de cette valeur ajoutera des dégâts." };
  if (event.kind === "HEAL") return { eyebrow: "RÉGÉNÉRATION", title: `+${event.amount} PV`, detail: `${who} ${event.side === side ? "récupères" : "récupère"} des forces.` };
  if (event.kind === "BACKLASH") return { eyebrow: `TOTAL ${event.total}`, title: `−${event.amount} PV`, detail: "Le lancer reste dans la zone dangereuse." };
  if (event.kind === "HIT") return { eyebrow: "ATTAQUE EN CHAÎNE", title: `${event.hits} touche${event.hits! > 1 ? "s" : ""} !`, detail: "Les dés restants repartent jusqu’au premier lancer sans touche." };
  return { eyebrow: "FIN DE L’ATTAQUE", title: `${event.amount} dégât${event.amount! > 1 ? "s" : ""}`, detail: `${event.hits} touche(s) × valeur ${event.attackValue}.` };
}

export function DiceKillerClient() {
  const [matches, setMatches] = useState<DiceKillerMatch[]>([]); const [self, setSelf] = useState(""); const [balance, setBalance] = useState(0);
  const [players, setPlayers] = useState<Player[]>([]); const [owned, setOwned] = useState<Owned[]>([]);
  const [opponent, setOpponent] = useState(""); const [coins, setCoins] = useState(0); const [stake, setStake] = useState(""); const [search, setSearch] = useState("");
  const [form, setForm] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [loaded, setLoaded] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const lock = useRef(false);
  const refresh = useCallback(async () => { const data = await json("/api/bataille"); setMatches(data.battles); setSelf(data.selfId); setBalance(data.coins); setLoaded(true); }, []);
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
  const active = diceMatches.filter((match) => match.status === "ACTIVE"); const pending = diceMatches.filter((match) => match.status === "PENDING");
  const cardName = (card: Owned) => card.game?.name ?? card.studio?.name ?? "Carte";
  const validStake = Number.isInteger(coins) && coins >= 0 && coins <= balance && coins <= 1_000_000;
  function stakeForm(id: string | null) { return <div className="killer-stake-form"><details className="battle-stake" open><summary>Mise facultative · {coins} GP{stake ? " + une carte" : ""}</summary><p>Comme dans L’Escalade, la mise reste bloquée jusqu’à la fin et le vainqueur remporte tout.</p><label className="battle-label">Gigapuissances · solde {balance}<input type="number" min={0} max={Math.min(balance, 1_000_000)} value={coins} onChange={(event) => setCoins(Number(event.target.value))}/></label><label className="battle-label">Rechercher une carte à miser<input value={search} onChange={(event) => setSearch(event.target.value)}/></label>{stake && <button className="battle-secondary" onClick={() => setStake("")}>Retirer la carte misée</button>}<div className="escalade-stakes">{owned.filter((card) => card.sellable !== false && !card.staked && cardName(card).toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((card) => <button key={card.id} className={`battle-secondary ${stake === card.id ? "escalade-selected" : ""}`} onClick={() => setStake(stake === card.id ? "" : card.id)}>{cardName(card)}{stake === card.id ? " ✓" : ""}</button>)}</div></details><button className="battle-primary" disabled={busy || !validStake || (!id && !opponent)} onClick={() => void submit(id, id ? "accept" : "create", { stakeCoins: coins, stakeCardId: stake || null })}>{id ? "Accepter le duel" : "Envoyer le défi"}</button></div>; }
  return <div className="battle-page killer-page"><header className="battle-hero killer-hero"><div><span className="battle-eyebrow">⚄ Arène mécanique</span><h1>Combat de dés</h1><p>Le Killer en duel asynchrone : construis ton total, déclenche une attaque et fais tomber l’adversaire à 0 PV.</p></div><div className="battle-actions"><button className="escalade-tuto-button" onClick={() => setRulesOpen(true)}>? Règles simples</button><a href="/bataille/des-tueurs/entrainement" className="escalade-tuto-button">🤖 Entraînement</a><button className="battle-primary" onClick={() => setForm(form === "new" ? null : "new")}>{form === "new" ? "Fermer" : "+ Lancer un défi"}</button></div></header>
    {rulesOpen && <DiceKillerRules close={() => setRulesOpen(false)} />}
    <div className="killer-quick-guide"><span><b>1</b>Lance</span><i>→</i><span><b>2</b>Garde au moins 1 dé</span><i>→</i><span><b>3</b>Relance le reste</span><i>→</i><span><b>4</b>Le total décide</span></div>
    {error && <p className="battle-alert" role="alert">{error}</p>}{notice && <p className="battle-notice" role="status">{notice}</p>}
    {form === "new" && <section className="battle-panel"><h2>Nouveau défi de dés</h2><label className="battle-label">Adversaire<select value={opponent} onChange={(event) => setOpponent(event.target.value)}><option value="">Choisir un joueur</option>{players.map((player) => <option key={player.id} value={player.id}>{player.username}</option>)}</select></label>{stakeForm(null)}</section>}
    <section className="battle-section"><div className="battle-section-heading"><h2>Duels en cours · {active.length}</h2><button className="battle-refresh" disabled={busy} onClick={() => void refresh()}>Actualiser</button></div>{!loaded && <p>Chargement…</p>}{loaded && !active.length && <p>Aucun duel de dés actif.</p>}{active.map((match) => <article className="battle-panel" key={match.id}><p className="battle-muted">Mises : {match.challengerStakeCoins + match.opponentStakeCoins} gigapuissances{match.challengerStakeCardName ? ` · ${match.challengerStakeCardName}` : ""}{match.opponentStakeCardName ? ` · ${match.opponentStakeCardName}` : ""}</p>{match.diceKiller && <DiceArena match={match} busy={busy} play={(move, revision) => void submit(match.id, "play", { move, revision })}/>}</article>)}</section>
    <section className="battle-section"><h2>Défis en attente · {pending.length}</h2>{pending.map((match) => <article className="battle-panel" key={match.id}><h3>{match.challenger.username} contre {match.opponent.username}</h3><p>Mise proposée : {match.challengerStakeCoins} gigapuissances{match.challengerStakeCardName ? ` + ${match.challengerStakeCardName}` : ""}.</p>{match.challengerId === self ? <button className="battle-secondary" disabled={busy} onClick={() => void submit(match.id, "cancel")}>Annuler et récupérer ma mise</button> : <><div className="battle-actions"><button className="battle-primary" disabled={busy} onClick={() => setForm(form === match.id ? null : match.id)}>Répondre au défi</button><button className="battle-secondary" disabled={busy} onClick={() => void submit(match.id, "decline")}>Refuser</button></div>{form === match.id && stakeForm(match.id)}</>}</article>)}</section>
    <section className="battle-section"><h2>Résultats récents</h2>{diceMatches.filter((match) => match.status === "FINISHED").slice(0, 12).map((match) => <details className="battle-panel" key={match.id}><summary>{match.winnerId === self ? "Victoire" : "Défaite"} · {match.challenger.username} / {match.opponent.username}</summary>{match.diceKiller && <DiceArena match={match} busy play={() => {}}/>}</details>)}</section>
  </div>;
}
