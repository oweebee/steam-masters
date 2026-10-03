"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { ABILITY_INFO, DRAFT_BUDGET, EVENT_INFO, MAX_ATTACK_POWER, TACTICS, abilityCost, attackPower, draftHand, handCost, tacticCost, tacticsWithLayout, type AbilityLayout, type EscaladeHistoryEntry, type EscaladeView, type EscaladeAction, type Tactic } from "@/lib/escalade";
import { EscaladeRules, EscaladeTutorial } from "./EscaladeHelp";
import { BatailleClient } from "./BatailleClient";
import { CardOrnaments } from "@/components/CardOrnaments";
import { PowerAura } from "@/components/PowerAura";
import { BattlePowerEffect } from "@/components/BattlePowerEffect";
import { battleAnimationTiming, CARD_ATTACK_GAP_MS, CARD_REVEAL_GAP_MS } from "@/lib/battleAnimationTiming";
import { BattlePlaque, BattleResultDialog, CoinToss, TurnAnnouncement, battlePresentation as presentation } from "./BattlePresentation";
type Match = {
  id: string; challengerId: string; opponentId: string; rulesVersion: number; status: string;
  challenger: { username: string }; opponent: { username: string }; winnerId: string | null;
  challengerStakeCoins: number; opponentStakeCoins: number; challengerStakeCardName: string | null; opponentStakeCardName: string | null;
  escalation: EscaladeView | null; draft: Tactic[] | null;
  abilityLayout?: AbilityLayout | null; draftBudget?: number | null;
};
type DraftOffer = { dealId: number; seed: number; budget: number; layout: AbilityLayout };
type SkinData = { image: string; rarity: string; name: string; atk: number; def: number };
type Owned = { id: string; sellable?: boolean; staked?: boolean; isPinned?: boolean; game?: { name: string; headerImage: string; rarity: string; atk: number; def: number } | null; studio?: { name: string; avatarUrl?: string | null; rarity: string; atk: number; def: number } | null };
async function json(url: string, body?: unknown) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000), ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Chargement impossible.");
  return data;
}
function validHand(ids: string[], layout?: AbilityLayout, budget?: number) { try { draftHand(ids, layout, budget); return true; } catch { return false; } }
type ReplayStory = { eyebrow: string; title: string; detail: string };
function replayStory(entry: EscaladeHistoryEntry, view: EscaladeView, match: Match): ReplayStory[] {
  const action = entry.action;
  const name = (side: 0 | 1) => side === view.side ? "Tu" : side === 0 ? match.challenger.username : match.opponent.username;
  const verb = (side: 0 | 1, you: string, other: string) => side === view.side ? you : other;
  const hits = entry.damage ?? [];
  const hpHits = hits.filter(hit => hit.kind === "hp");
  const hearts = hpHits.length
    ? hpHits.map(hit => `${name(hit.side)} ${hit.side === view.side ? "perds" : "perd"} ${hit.amount} PV.`).join(" ")
    : "Aucun joueur ne perd de PV.";
  if (action.type === "attack") {
    const calculation = attackPower(action.cards);
    const combo = calculation.bonus === 5 ? "Suite +5" : calculation.bonus === 3 ? "Paire +3" : "Pas de combo";
    return [
    { eyebrow: "1 · CARTES JOUÉES", title: `${name(action.side)} ${verb(action.side, "lances", "lance")} ${action.cards.length} carte${action.cards.length > 1 ? "s" : ""} d’attaque`, detail: `Elles frappent une par une : ${action.cards.map(card => card.value).join(" puis ")} ATK.` },
    { eyebrow: "2 · COMBO ET IMPACT", title: combo, detail: `${calculation.raw} ATK${calculation.bonus ? ` + ${calculation.bonus} de combo` : ""}${action.ability === "SURCHARGE" ? " + 2 de Surcharge" : ""} = ${action.power} ATK au total.` },
    { eyebrow: "3 · RÉSULTAT", title: action.broken ? "Le bouclier est cassé !" : "Le bouclier tient encore", detail: `${hearts} ${action.broken ? `${name(action.side)} ${verb(action.side, "peux", "peut")} maintenant poser un nouveau bouclier.` : `${name(action.side)} ${verb(action.side, "peux", "peut")} attaquer encore ou abandonner ce bouclier.`}` },
    ];
  }
  if (action.type === "defend") return [
    { eyebrow: "1 · CARTE JOUÉE", title: `${name(action.side)} ${verb(action.side, "poses", "pose")} un bouclier`, detail: action.ability ? `Pouvoir utilisé : ${ABILITY_INFO[action.ability].name}.` : "Aucun pouvoir utilisé." },
    { eyebrow: "2 · INSTALLATION", title: `Le bouclier protège avec ${action.card.value} DEF`, detail: "Ces points doivent être retirés par les attaques." },
    { eyebrow: "3 · À SUIVRE", title: `${name((1 - action.side) as 0 | 1)} doit attaquer`, detail: "Le tour change seulement après la fin de cette explication." },
  ];
  if (action.type === "cede") return [
    { eyebrow: "1 · ABANDON", title: `${name(action.side)} ${verb(action.side, "arrêtes", "arrête")} d’attaquer`, detail: "Les cartes d’attaque restantes amortissent le choc." },
    { eyebrow: "2 · DÉGÂTS", title: hpHits.length ? hearts : "Le choc est entièrement bloqué", detail: hpHits.length ? "Les PV sont retirés maintenant." : "Aucun PV n’est perdu." },
    { eyebrow: "3 · RÉSULTAT", title: "Cet assaut est terminé", detail: `${hpHits.length ? hearts : "Aucun PV n’est perdu."} Un nouveau bouclier sera posé s’il en reste un.` },
  ];
  return [
    { eyebrow: "1 · DÉCISION", title: `${name(action.side)} ${verb(action.side, "passes", "passe")}`, detail: "Aucune carte n’est jouée." },
    { eyebrow: "2 · CHANGEMENT", title: "Le tour change", detail: "L’autre joueur peut ouvrir le prochain assaut." },
    { eyebrow: "3 · À SUIVRE", title: "La partie continue", detail: "Regarde le message « À toi » pour savoir quand jouer." },
  ];
}
function TacticCollectionCard({ card, skin, selected, disabled, click }: { card: Tactic; skin: SkinData; selected: boolean; disabled: boolean; click: () => void }) {
  const atkVal = card.kind === "ATTACK" ? card.value : skin.atk;
  const defVal = card.kind === "DEFENSE" ? card.value : skin.def;
  return (
    <button type="button" onClick={click} disabled={disabled} aria-pressed={selected} data-tooltip={`${card.kind === "ATTACK" ? "ATK" : "DEF"} ${card.value} · ${ABILITY_INFO[card.ability].name} · ${ABILITY_INFO[card.ability].cost} vapeur · ${ABILITY_INFO[card.ability].short} · coût de draft ${tacticCost(card)}`} className={`escalade-coll-wrap escalade-tooltip ${selected ? "chosen" : ""}`}>
      <PowerAura ability={card.ability} />
      <div className="escalade-coll-scale-outer">
        <div className="escalade-coll-scale-inner">
          <div className="steam-card-shell escalade-coll-square-shell rounded-2xl border-2 bg-gray-900 overflow-hidden flex flex-col" data-rarity={skin.rarity} style={{width:"100%",height:"100%"}}>
            <CardOrnaments />
            <div className="steam-card-visual"><img src={skin.image} alt={skin.name} className="w-full h-full object-cover" /></div>
            <div className="steam-card-content p-2 flex flex-col gap-1 flex-1 overflow-hidden">
              <div className="steam-card-nameplate"><h3 className="steam-card-title text-white font-bold text-sm leading-tight line-clamp-2">{skin.name}</h3></div>
              <div className="steam-statbar flex justify-between items-center pt-1 mt-auto">
                <div className={`steam-stat steam-stat-atk flex items-center gap-1 font-bold${card.kind !== "ATTACK" ? " stat-dimmed" : ""}`}><span className="text-xs">ATK</span><span>{atkVal}</span></div>
                <div className={`steam-stat steam-stat-def flex items-center gap-1 font-bold${card.kind !== "DEFENSE" ? " stat-dimmed" : ""}`}><span className="text-xs">DEF</span><span>{defVal}</span></div>
              </div>
              {card.kind === "ATTACK" && card.value <= 3 && <p className="text-center text-yellow-400 text-[9px]">⚡ Percée (-4 DEF)</p>}
              <span className="escalade-ability-rune">♨ {ABILITY_INFO[card.ability].name}</span>
              <span className="escalade-card-cost">◆ {tacticCost(card)}</span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
function SteampunkCardBack({ compact = false }: { compact?: boolean }) {
  return <div className={`escalade-card-back ${presentation.cardBack}${compact ? ` escalade-card-back-compact ${presentation.compactBack}` : ""}`} aria-hidden="true" />;
}
function TacticButton({ card, selected, disabled, click, skin, dragStart, dragEnd, effectiveValue }: { card: Tactic; selected: boolean; disabled: boolean; click: () => void; skin?: SkinData; dragStart?: (event: DragEvent<HTMLButtonElement>) => void; dragEnd?: () => void; effectiveValue?: number }) {
  const diminished = card.kind === "ATTACK" && effectiveValue !== undefined && effectiveValue !== card.value;
  const atkDisplay = diminished ? <><s>{card.value}</s> {effectiveValue}</> : card.value;
  if (skin) return <div className="escalade-draggable-card"><button type="button" draggable={!disabled} onDragStart={dragStart} onDragEnd={dragEnd} onClick={click} disabled={disabled} aria-pressed={selected} data-tooltip={`${ABILITY_INFO[card.ability].name} · ${ABILITY_INFO[card.ability].cost} vapeur · ${ABILITY_INFO[card.ability].short} · coût de draft ${tacticCost(card)}`} className={`escalade-coll-wrap escalade-tooltip ${selected ? "chosen" : ""}`}><PowerAura ability={card.ability} /><div className="escalade-coll-scale-outer"><div className="escalade-coll-scale-inner"><div className="steam-card-shell escalade-coll-square-shell rounded-2xl border-2 bg-gray-900 overflow-hidden flex flex-col" data-rarity={skin.rarity} style={{width:"100%",height:"100%"}}><CardOrnaments /><div className="steam-card-visual"><img src={skin.image} alt={skin.name} className="w-full h-full object-cover" /></div><div className="steam-card-content p-2 flex flex-col gap-1 flex-1 overflow-hidden"><div className="steam-card-nameplate"><h3 className="steam-card-title text-white font-bold text-sm leading-tight line-clamp-2">{skin.name}</h3></div><div className="steam-statbar flex justify-between items-center pt-1 mt-auto"><div className={`steam-stat steam-stat-atk flex items-center gap-1 font-bold${card.kind !== "ATTACK" ? " stat-dimmed" : ""}${diminished ? " escalade-stat-halved" : ""}`}><span className="text-xs">ATK</span><span>{card.kind === "ATTACK" ? atkDisplay : skin.atk}</span></div><div className={`steam-stat steam-stat-def flex items-center gap-1 font-bold${card.kind !== "DEFENSE" ? " stat-dimmed" : ""}`}><span className="text-xs">DEF</span><span>{card.kind === "DEFENSE" ? card.value : skin.def}</span></div></div>{card.kind === "ATTACK" && card.value <= 3 && <p className="text-center text-yellow-400 text-[9px]">⚡ Percée (-4 DEF)</p>}<span className="escalade-ability-rune">♨ {ABILITY_INFO[card.ability].name}</span><span className="escalade-card-cost">◆ {tacticCost(card)}</span></div></div></div></div></button></div>;
  return <button type="button" draggable={!disabled} onDragStart={dragStart} onDragEnd={dragEnd} data-tooltip={`${card.kind === "ATTACK" ? "ATK" : "DEF"} ${card.value} · ${ABILITY_INFO[card.ability].name} · ${ABILITY_INFO[card.ability].cost} vapeur · ${ABILITY_INFO[card.ability].short} · coût de draft ${tacticCost(card)}`} className={`escalade-tactic escalade-tooltip ${card.kind === "ATTACK" ? "attack" : "defense"} ${selected ? "chosen" : ""}`} aria-pressed={selected} disabled={disabled} onClick={click}>
    <PowerAura ability={card.ability} />
    <small>{card.kind === "ATTACK" ? "⚔ Attaque" : "🛡 Défense"}</small><b className={diminished ? "escalade-stat-halved" : ""}>{atkDisplay}</b><span>{card.kind === "ATTACK" && card.value <= 3 ? "Percée −4" : diminished ? "½ usure" : selected ? "Sélectionnée" : ""}</span>
    <em className="escalade-ability-rune">♨ {ABILITY_INFO[card.ability].name}</em><span className="escalade-card-cost">◆ {tacticCost(card)}</span>
  </button>;
}
export function HandPicker({ ids, change, disabled, skinMap, layout, budget = DRAFT_BUDGET }: { ids: string[]; change: (ids: string[]) => void; disabled: boolean; skinMap: Record<string, SkinData>; layout?: AbilityLayout; budget?: number }) {
  const deck = tacticsWithLayout(layout); const chosenCards = deck.filter(card => ids.includes(card.id)); const used = handCost(chosenCards);
return <div className="escalade-draft-machine"><div className="escalade-deal-banner"><span>⚙ Pouvoirs redistribués pour cette manche</span><b>Budget {used}/{budget}</b></div><p className="battle-muted">{ids.length}/5 cartes · au moins 1 attaque et 1 défense · sélection secrète</p><div className="escalade-draft-budget"><i style={{width:`${Math.min(100, used / budget * 100)}%`}} /></div><div className="escalade-hand">{deck.map((card, index) => <div key={`${card.id}-${card.ability}`} className={`escalade-dealt-card draft-power-${card.ability.toLowerCase().replace("_", "-")}`} style={{"--deal-index":index} as CSSProperties}><TacticButton card={card} selected={ids.includes(card.id)} disabled={disabled || (ids.length === 5 && !ids.includes(card.id)) || (!ids.includes(card.id) && used + tacticCost(card) > budget)} click={() => change(ids.includes(card.id) ? ids.filter(id => id !== card.id) : [...ids, card.id])} skin={skinMap[card.id]} /></div>)}</div></div>;
}
export const ARENA_REVEAL_MS = battleAnimationTiming(5).completeAt;
export function Arena({ match, busy, act, skinMap, persistReplay = true, onFinishedAcknowledged }: { match: Match; busy: boolean; act: (move: EscaladeAction, revision: number) => void; skinMap: Record<string, SkinData>; persistReplay?: boolean; onFinishedAcknowledged?: () => void }) {
  const state = match.escalation!;
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<string[]>([]);
  const [confirmCede, setConfirmCede] = useState(false);
  const [draggedIds, setDraggedIds] = useState<string[]>([]);
  const [abilityCardId, setAbilityCardId] = useState<string | null>(null);
  useEffect(() => { setSelected([]); setAbilityCardId(null); setConfirmCede(false); }, [state.revision]);
  useEffect(() => { setDraft([]); }, [state.round]);
  const [animStage, setAnimStage] = useState<0|1|2|3>(0);
  const [animAct, setAnimAct] = useState<typeof state.lastAction>(null);
  const [replayBreathing, setReplayBreathing] = useState(false);
  const animTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [replayQueue, setReplayQueue] = useState<EscaladeHistoryEntry[]>([]);
  const replayMatch = useRef<string | null>(null);
  const replaySeen = useRef(0);
  const replayQueued = useRef(new Set<number>());
  useEffect(() => () => animTimers.current.forEach(clearTimeout), []);
  const prevLineRef = useRef(state.line);
  const prevWinsRef = useRef<[number, number]>(state.wins);
  const [shatter, setShatter] = useState<{ owner: 0 | 1; card: Tactic } | null>(null);
  const splashKeyRef = useRef<string | null>(null);
  const [splash, setSplash] = useState<{ title: string; detail: string; explanation: string; log: string[] } | null>(null);
  useEffect(() => {
    // Une seule capture "avant" cohérente pour tous les effets dérivés d'une revision :
    // points de dégâts, brisure de bouclier, splash de fin de manche/match.
    const prevLine = prevLineRef.current;
    const prevWins = prevWinsRef.current;

    // Les chiffres de dégâts sont désormais synchronisés avec le rejeu public.

    // Brisure visuelle du bouclier cassé par une attaque.
    if (prevLine && state.lastAction?.type === "attack" && (!state.line || state.line.card.id !== prevLine.card.id)) {
      setShatter({ owner: prevLine.owner, card: prevLine.card });
      setTimeout(() => setShatter(null), 1500);
    }

    // Splash de fin de manche / de match : une seule fois par transition (clé = phase+round+score).
    if ((state.phase === "DRAFT" && state.round > 1) || state.phase === "FINISHED") {
      const key = `${state.phase}-${state.round}-${state.wins[0]}-${state.wins[1]}`;
      if (splashKeyRef.current !== key) {
        splashKeyRef.current = key;
        const iWon = state.wins[state.side] > prevWins[state.side];
        const oppWon = state.wins[1 - state.side] > prevWins[1 - state.side];
        const title = state.phase === "FINISHED"
          ? (state.winner === state.side ? "🏆 Tu as gagné le match !" : "💛 Le match est terminé")
          : iWon ? "✅ Manche gagnée" : oppWon ? "❌ Manche perdue" : "🤝 Manche nulle";
        const myWins = state.wins[state.side];
        const opponentWins = state.wins[1 - state.side];
        const explanation = state.phase === "FINISHED"
          ? state.winner === state.side
            ? `Bravo ! Tu as gagné ${myWins} manches. Ton adversaire en a gagné ${opponentWins}.`
            : `Ton adversaire a gagné ${opponentWins} manches. Tu en as gagné ${myWins}. Tu pourras prendre ta revanche !`
          : iWon
            ? "Tu remportes cette manche. Choisis maintenant 5 cartes pour la suivante."
            : oppWon
              ? "Ton adversaire remporte cette manche. Choisis maintenant 5 nouvelles cartes pour essayer de revenir."
              : "Vous étiez à égalité. Aucun point de manche n’est ajouté.";
        setSplash({ title, detail: `Manches : toi ${myWins} – ${opponentWins} adversaire · PV ${state.hp[state.side]}–${state.hp[1-state.side]}`, explanation, log: [...state.log].slice(-5) });
      }
    }

    prevLineRef.current = state.line;
    prevWinsRef.current = state.wins;
  }, [state.revision]);
  const lastCoinRoundRef = useRef((state.actionHistory?.length ?? 0) > 0 ? state.round : 0);
  const [coinFlip, setCoinFlip] = useState<{ round: number; mine: boolean } | null>(null);
  useEffect(() => {
    if (state.phase !== "DRAFT" && state.phase !== "FINISHED" && state.round !== lastCoinRoundRef.current) {
      lastCoinRoundRef.current = state.round;
      setCoinFlip({ round: state.round, mine: state.starter === state.side });
    }
  }, [state.round, state.phase, state.starter, state.side]);
  // The timer belongs to the displayed intro, not to polled game state.
  useEffect(() => {
    if (!coinFlip) return;
    const timer = setTimeout(() => setCoinFlip(null), 4600);
    return () => clearTimeout(timer);
  }, [coinFlip]);
  useEffect(() => {
    const key = `escalade-seen-${match.id}-${state.side}`;
    const firstLoad = replayMatch.current !== match.id;
    if (firstLoad) {
      replayMatch.current = match.id; replayQueued.current.clear(); setReplayQueue([]);
      let saved = 0;
      try { if (persistReplay) saved = Number(window.localStorage.getItem(key) || 0); } catch { /* Private browsing: replay still works in memory. */ }
      replaySeen.current = Number.isSafeInteger(saved) && saved >= 0 && saved <= state.revision ? saved : 0;
    }
    const pending = (state.actionHistory ?? [])
      .filter(entry => entry.revision > replaySeen.current && !replayQueued.current.has(entry.revision))
      .sort((a, b) => a.revision - b.revision);
    if (pending.length) {
      pending.forEach(entry => replayQueued.current.add(entry.revision));
      setReplayQueue(current => [...current, ...pending].sort((a, b) => a.revision - b.revision));
    }
  }, [match.id, state.actionHistory, state.side, state.revision, persistReplay]);
  useEffect(() => {
    if (animStage !== 0 || !replayQueue.length || coinFlip || replayBreathing) return;
    const entry = replayQueue[0];
    const timing = battleAnimationTiming(entry.action.type === "attack" ? entry.action.cards.length : 1);
    animTimers.current.forEach(clearTimeout);
    setAnimAct(entry.action); setAnimStage(1);
    animTimers.current = [
      setTimeout(() => setAnimStage(2), timing.revealAt),
      setTimeout(() => setAnimStage(3), timing.fadeAt),
      setTimeout(() => {
        replaySeen.current = Math.max(replaySeen.current, entry.revision);
        try { if (persistReplay) window.localStorage.setItem(`escalade-seen-${match.id}-${state.side}`, String(replaySeen.current)); } catch { /* Never block the next animation on storage errors. */ }
        replayQueued.current.delete(entry.revision);
        setReplayQueue(current => current.filter(item => item.revision !== entry.revision));
        setAnimStage(0); setAnimAct(null);
        setReplayBreathing(true);
        // Give the resolved impact a beat before another move or the result.
        animTimers.current.push(setTimeout(() => setReplayBreathing(false), 900));
      }, timing.completeAt),
    ];
  }, [animStage, match.id, replayQueue, state.side, persistReplay, coinFlip, replayBreathing]);
  // On bloque toute action tant que la revelation du coup adverse joue encore : on veut que
  // le joueur (potentiellement un enfant) voie la carte se retourner avant de pouvoir agir.
  const myTurn = !busy && !coinFlip && !splash && !replayBreathing && state.turn === state.side && state.phase !== "DRAFT" && state.phase !== "FINISHED" && animStage === 0 && replayQueue.length === 0;
  const chosen = state.hand.filter(c => selected.includes(c.id));
  const attacks = chosen.filter(c => c.kind === "ATTACK");
  const power = attacks.length ? attackPower(attacks) : null;
  const activeAbilityCard = chosen.find(card => card.id === abilityCardId) ?? null;
  const activeAbilityCost = activeAbilityCard ? abilityCost(activeAbilityCard.ability, state.event) : 0;
  const canPayAbility = !!activeAbilityCard && state.pressure[state.side] >= activeAbilityCost;
  const attackEffective = new Map<string, number>();
  if (attacks.length > 1) {
    [...attacks].sort((a, b) => b.value - a.value).forEach((c, i) => attackEffective.set(c.id, i === 0 ? c.value : Math.floor(c.value / 2)));
  }
  const damage = Math.max(0, (state.line?.remaining ?? 0) - state.hand.filter(c => c.kind === "ATTACK").reduce((sum, c) => sum + c.value, 0));
  const currentReplay = replayQueue[0] ?? null;
  const story = currentReplay ? replayStory(currentReplay, state, match) : null;
  const replayAttack = animAct?.type === "attack" ? attackPower(animAct.cards) : null;
  const replayContributions = new Map<string, number>();
  if (animAct?.type === "attack") {
    [...animAct.cards]
      .sort((a, b) => b.value - a.value)
      .forEach((card, index) => replayContributions.set(card.id, index === 0 ? card.value : Math.floor(card.value / 2)));
  }
  function startDrag(event: DragEvent<HTMLButtonElement>, card: Tactic) {
    if (!myTurn) { event.preventDefault(); return; }
    const ids = card.kind === "ATTACK" && selected.includes(card.id) ? attacks.map((item) => item.id) : [card.id];
    setDraggedIds(ids);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-escalade-cards", ids.join(","));
  }
  function allowDrop(event: DragEvent<HTMLDivElement>, kind: "ATTACK" | "DEFENSE") {
    const cards = state.hand.filter((card) => draggedIds.includes(card.id));
    if (myTurn && cards.length > 0 && cards.every((card) => card.kind === kind)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }
  }
  function dropCards(event: DragEvent<HTMLDivElement>, kind: "ATTACK" | "DEFENSE") {
    event.preventDefault();
    const ids = (event.dataTransfer.getData("application/x-escalade-cards") || draggedIds.join(",")).split(",").filter(Boolean);
    const cards = state.hand.filter((card) => ids.includes(card.id));
    setDraggedIds([]);
    if (!myTurn || !cards.length || cards.some((card) => card.kind !== kind)) return;
    const useAbility = !!abilityCardId && cards.some(card => card.id === abilityCardId) && canPayAbility;
    if (kind === "ATTACK" && state.phase === "REPLY" && state.line?.owner !== state.side) act({ type: "attack", cardIds: cards.map((card) => card.id), ...(useAbility ? { abilityCardId } : {}) }, state.revision);
    if (kind === "DEFENSE" && state.phase !== "REPLY" && cards.length === 1) act({ type: "defend", cardId: cards[0].id, useAbility }, state.revision);
  }
  return <div className={`escalade-arena-root ${presentation.arena}`}>
    {splash && !replayBreathing && animStage === 0 && replayQueue.length === 0 && <BattleResultDialog className="escalade-splash-overlay" onAcknowledge={() => { setSplash(null); if (state.phase === "FINISHED") onFinishedAcknowledged?.(); }}>
      <div className={`escalade-splash-box ${presentation.result}`}>
        <div className={presentation.resultBody}>
        <BattlePlaque><strong>{splash.title}</strong></BattlePlaque>
        <p className="battle-muted">{splash.detail}</p>
        <p className="escalade-result-explanation">{splash.explanation}</p>
        <details className="escalade-journal"><summary>Voir les 5 dernières actions</summary><ol>{splash.log.map((line, i) => <li key={i}>{line.replace(/\bA\b/g, match.challenger.username).replace(/\bB\b/g, match.opponent.username)}</li>)}</ol></details>
        </div>
        <div className={presentation.resultFooter}><button className="battle-primary" autoFocus onClick={() => { setSplash(null); if (state.phase === "FINISHED") onFinishedAcknowledged?.(); }}>{state.phase === "FINISHED" ? "J’ai compris · quitter le plateau" : "Continuer vers la manche suivante"}</button></div>
      </div>
    </BattleResultDialog>}
    {coinFlip && !splash && <div className={presentation.opening} role="status">
      <div className={presentation.versus}><span>{match.challenger.username}</span><b>VS</b><span>{match.opponent.username}</span></div>
      <CoinToss />
      <BattlePlaque><strong>Manche {coinFlip.round}</strong><small className={presentation.starter}>{coinFlip.mine ? "Tu ouvres le duel" : `${(state.side === 0 ? match.opponent : match.challenger).username} ouvre le duel`}</small></BattlePlaque>
      <p>{EVENT_INFO[state.event].name} · {EVENT_INFO[state.event].short}</p>
      <button className="battle-primary" onClick={() => setCoinFlip(null)}>Entrer dans l’arène</button>
    </div>}
    {!coinFlip && !splash && !replayBreathing && animStage === 0 && replayQueue.length === 0 && state.phase !== "DRAFT" && state.phase !== "FINISHED" && <TurnAnnouncement key={`${state.round}-${state.revision}-${state.turn}`} mine={state.turn === state.side} phase={state.phase} />}
    <div className={presentation.phase} aria-live="polite">{replayBreathing ? "Action résolue…" : animStage > 0 ? "Résolution de l’action" : state.phase === "DRAFT" ? "Préparation · Choisis ta main" : state.phase === "FINISHED" ? "Duel terminé" : state.phase === "REPLY" ? "Riposte · Attaquer ou céder" : "Ouverture · Poser un bouclier"}</div>
    <div className="escalade-score">
      <div className="escalade-score-side"><span className="escalade-score-name">{match.challenger.username}</span><span className="escalade-score-hp escalade-tooltip" tabIndex={0} data-tooltip="Points de vie. À 0 PV, la manche est perdue immédiatement."><small className="escalade-mini-heart">♥</small>{state.hp[0]}<em>PV</em></span><span className="escalade-hp-gauge"><i style={{ width: `${Math.max(0, Math.min(100, state.hp[0] / 20 * 100))}%` }} /></span><span className="escalade-pressure-gauge escalade-tooltip" tabIndex={0} data-tooltip="Vapeur disponible pour activer un pouvoir sur une carte jouée."><i style={{width:`${state.pressure[0] / 6 * 100}%`}} /><b>♨ {state.pressure[0]}/6</b></span>{state.burn[0] > 0 && <span className="escalade-burn-indicator escalade-tooltip" tabIndex={0} data-tooltip="Incendie : perd 1 PV au début de chacune des prochaines actions.">🔥 {state.burn[0]} pulsation{state.burn[0] > 1 ? "s" : ""}</span>}</div>
      <div className="escalade-score-mid"><span className="escalade-round-dial">Manche {state.round}</span><strong>{state.wins[0]} – {state.wins[1]}</strong><small>Deux manches gagnantes</small></div>
      <div className="escalade-score-side"><span className="escalade-score-name">{match.opponent.username}</span><span className="escalade-score-hp escalade-tooltip" tabIndex={0} data-tooltip="Points de vie. À 0 PV, la manche est perdue immédiatement."><small className="escalade-mini-heart">♥</small>{state.hp[1]}<em>PV</em></span><span className="escalade-hp-gauge"><i style={{ width: `${Math.max(0, Math.min(100, state.hp[1] / 20 * 100))}%` }} /></span><span className="escalade-pressure-gauge escalade-tooltip" tabIndex={0} data-tooltip="Vapeur disponible pour activer un pouvoir sur une carte jouée."><i style={{width:`${state.pressure[1] / 6 * 100}%`}} /><b>♨ {state.pressure[1]}/6</b></span>{state.burn[1] > 0 && <span className="escalade-burn-indicator escalade-tooltip" tabIndex={0} data-tooltip="Incendie : perd 1 PV au début de chacune des prochaines actions.">🔥 {state.burn[1]} pulsation{state.burn[1] > 1 ? "s" : ""}</span>}</div>
    </div>
    <div className={`escalade-event-plaque event-${state.event.toLowerCase()}`}><span>Événement de la manche</span><strong>{EVENT_INFO[state.event].name}</strong><small>{EVENT_INFO[state.event].short}</small></div>
    {animStage > 0 && animAct && <div className={`escalade-anim-overlay escalade-anim-s${animStage} ${animAct.type === "attack" ? "is-attack" : ""} ${animAct.type === "attack" && animAct.ability ? `power-impact-${animAct.ability.toLowerCase().replace("_", "-")}` : ""} ${animAct.side === state.side ? "from-self" : "from-opponent"}`}>
      <div className={presentation.actionPlaque}><BattlePlaque><strong>{animAct.side === state.side ? "Ton action" : `${(animAct.side === 0 ? match.challenger : match.opponent).username} joue`}</strong><small>{animStage === 1 ? "Découverte du coup" : animStage === 2 ? "Action en cours" : "Résultat du coup"}</small></BattlePlaque></div>
      <div className="escalade-anim-scene">{((animAct.type === "defend" ? [animAct.card] : animAct.type === "attack" ? animAct.cards : [])).map((card, index) => {
        const sk = skinMap[card.id];
        const power = "ability" in animAct && animAct.ability && (animAct.type === "defend" || !animAct.abilityCardId || animAct.abilityCardId === card.id) ? animAct.ability.toLowerCase().replace("_", "-") : null;
        const contribution = replayContributions.get(card.id);
        return <div key={card.id} style={{ "--card-reveal-delay": `${index * CARD_REVEAL_GAP_MS}ms`, "--attack-delay": `${index * CARD_ATTACK_GAP_MS}ms`, "--attack-x": `${index % 2 ? 12 : -12}px` } as CSSProperties} className={`escalade-anim-card${power ? ` power-${power}` : ""}`}>
          <div className="escalade-anim-back"><SteampunkCardBack compact /></div>
          <div className="escalade-anim-front">{power && <PowerAura ability={card.ability} />}{sk?.image ? <img src={sk.image} alt={sk.name} /> : <span>{card.kind === "DEFENSE" ? "🛡" : "⚔"}</span>}<b>{card.value}</b>{contribution !== undefined && <span className="escalade-card-strike-value">+{contribution} ATK</span>}</div>
        </div>;
      })}{"ability" in animAct && animAct.ability && <span className={`escalade-steam-burst ability-${animAct.ability.toLowerCase().replace("_", "-")}`} aria-hidden="true"><i/><i/><i/><i/><b>{animAct.ability === "INCENDIE" ? "🔥" : animAct.ability === "COURT_CIRCUIT" ? "⚡" : animAct.ability === "MIROIR" ? "◈" : "♨"}</b></span>}</div>
      {animAct.type === "attack" && replayAttack && <div className={`escalade-combo-banner${replayAttack.bonus ? " has-combo" : ""}`} style={{ "--combo-delay": `${Math.max(0, animAct.cards.length - 1) * CARD_ATTACK_GAP_MS + 680}ms` } as CSSProperties}>
        <small>{replayAttack.bonus === 5 ? "COMBO SUITE" : replayAttack.bonus === 3 ? "COMBO PAIRE" : "ATTAQUE SIMPLE"}</small>
        <strong>{replayAttack.raw}{replayAttack.bonus ? ` + ${replayAttack.bonus}` : ""}{animAct.ability === "SURCHARGE" ? " + 2" : ""} = {animAct.power} ATK</strong>
      </div>}
      {animStage >= 2 && (animAct.type === "attack" || animAct.type === "defend" || animAct.type === "cede") && <BattlePowerEffect cardCount={animAct.type === "attack" ? animAct.cards.length : 1} side={state.side} damage={replayQueue[0]?.damage} ability={"ability" in animAct && animAct.ability ? animAct.ability : animAct.type === "attack" ? "PERCUSSION" : animAct.type === "defend" ? "BLINDAGE" : "SOUPAPE"} attack={animAct.type === "attack"} fromSelf={animAct.side === state.side} power={animAct.type === "attack" ? animAct.power : undefined} broken={animAct.type === "attack" ? animAct.broken : undefined} />}
      {story && <div className="escalade-story-card" role="status" aria-live="assertive">
        <small>{story[animStage - 1].eyebrow}</small>
        <strong>{story[animStage - 1].title}</strong>
        <p>{story[animStage - 1].detail}</p>
        <span><i className={animStage >= 1 ? "is-done" : ""} /><i className={animStage >= 2 ? "is-done" : ""} /><i className={animStage >= 3 ? "is-done" : ""} /></span>
      </div>}
    </div>}
    {state.phase === "DRAFT" ? <div className="escalade-round-end-fade"><h3>Préparer la prochaine manche</h3>{state.ready[state.side] ? <p>Ta main est validée. En attente de l’adversaire.</p> : <><HandPicker ids={draft} change={setDraft} disabled={busy} skinMap={skinMap} layout={state.abilityLayout} budget={state.draftBudget} /><button className="battle-primary" disabled={busy || !validHand(draft, state.abilityLayout, state.draftBudget)} onClick={() => act({ type: "draft", cardIds: draft }, state.revision)}>Valider ma main secrète</button></>}</div> : state.phase !== "FINISHED" && <>
      <div className="escalade-field-v2">
        <div className="escalade-zone-title"><span>Adversaire</span><small>{state.handCounts[1-state.side]} carte(s) en main</small></div>
        <div className="escalade-hand escalade-opponent-hand">{Array.from({length:state.handCounts[1-state.side]}).map((_,i)=><SteampunkCardBack key={i} />)}</div>
        <div className={`escalade-row escalade-row-def escalade-drop-zone escalade-opponent-line ${draggedIds.length ? "drop-ready" : ""}`} onDragOver={(event) => allowDrop(event, "ATTACK")} onDrop={(event) => dropCards(event, "ATTACK")}>{state.line && state.line.owner !== state.side ? <TacticCollectionCard card={{...state.line.card, value: state.line.remaining}} skin={skinMap[state.line.card.id]} selected={false} disabled={false} click={() => {}} /> : shatter && shatter.owner !== state.side ? <div className="escalade-shatter-wrap"><TacticCollectionCard card={shatter.card} skin={skinMap[shatter.card.id]} selected={false} disabled={false} click={() => {}} /><span className="escalade-shatter-crack" aria-hidden="true" /></div> : <span className="escalade-row-empty">Glisse ton attaque ici quand une défense est active</span>}</div>
        <div className="escalade-row-sep"><span>⚙</span><b>Ligne de pression</b><span>⚙</span></div>
        <div className={`escalade-row escalade-row-def escalade-drop-zone escalade-player-line ${draggedIds.length ? "drop-ready" : ""}`} onDragOver={(event) => allowDrop(event, "DEFENSE")} onDrop={(event) => dropCards(event, "DEFENSE")}>{state.line && state.line.owner === state.side ? <TacticCollectionCard card={{...state.line.card, value: state.line.remaining}} skin={skinMap[state.line.card.id]} selected={false} disabled={false} click={() => {}} /> : shatter && shatter.owner === state.side ? <div className="escalade-shatter-wrap"><TacticCollectionCard card={shatter.card} skin={skinMap[shatter.card.id]} selected={false} disabled={false} click={() => {}} /><span className="escalade-shatter-crack" aria-hidden="true" /></div> : <span className="escalade-row-empty">Glisse ta défense ici</span>}</div>
        <div className="escalade-zone-title is-player"><span>Ta main</span><small>{state.hand.length} carte(s) disponible(s)</small></div>
        <div className="escalade-hand">{state.hand.map(card => <TacticButton key={card.id} card={card} selected={selected.includes(card.id)} disabled={busy || !myTurn || (state.phase === "REPLY" ? card.kind !== "ATTACK" : card.kind !== "DEFENSE")} click={() => { const next = selected.includes(card.id) ? selected.filter(id => id !== card.id) : card.kind === "DEFENSE" ? [card.id] : [...selected, card.id]; setSelected(next); if (!next.includes(abilityCardId ?? "")) setAbilityCardId(null); }} skin={skinMap[card.id]} dragStart={(event) => startDrag(event, card)} dragEnd={() => setDraggedIds([])} effectiveValue={selected.includes(card.id) ? attackEffective.get(card.id) : undefined} />)}</div>
      </div>
      <p role="status" className={`escalade-turn-status ${myTurn ? "is-active" : "is-waiting"}`}><span aria-hidden="true">{myTurn ? "⚙" : "⌛"}</span>{myTurn ? state.phase === "REPLY" ? "À toi ! Choisis une ou plusieurs cartes ATK pour frapper le bouclier." : "À toi ! Choisis une carte DEF et pose ton bouclier." : "L’adversaire réfléchit. Tu pourras jouer dès que son coup arrive."}</p>
      {myTurn && <div className="battle-actions escalade-actions-centered">{state.phase === "REPLY" ? <>
        {power && <p className="escalade-preview">{power.raw} + {power.bonus} combo{activeAbilityCard?.ability === "SURCHARGE" ? " + 2 surcharge" : ""} = {Math.min(MAX_ATTACK_POWER, power.raw + power.bonus + (activeAbilityCard?.ability === "SURCHARGE" ? 2 : 0))} ATK · {power.pierce + (activeAbilityCard?.ability === "PERCUSSION" ? 2 : 0)} DEF ignorés{power.raw + power.bonus > MAX_ATTACK_POWER ? " · régulateur 16" : ""}</p>}
        {chosen.length > 0 && <div className="escalade-ability-console"><span>Capacité (1 maximum)</span>{chosen.map(card => { const cost = abilityCost(card.ability, state.event); return <button type="button" key={card.id} className={abilityCardId === card.id ? "is-active" : ""} disabled={state.pressure[state.side] < cost} onClick={() => setAbilityCardId(abilityCardId === card.id ? null : card.id)}>♨ {ABILITY_INFO[card.ability].name} · {cost}<small>{ABILITY_INFO[card.ability].short}</small></button>; })}</div>}
        <button className="battle-primary" disabled={busy || !attacks.length || (!!abilityCardId && !canPayAbility)} onClick={() => act({ type: "attack", cardIds: attacks.map(c => c.id), ...(abilityCardId ? {abilityCardId} : {}) }, state.revision)}>Jouer l’attaque</button>
        <button className="battle-secondary" disabled={busy} onClick={() => setConfirmCede(!confirmCede)}>Céder la ligne · {damage} dégât(s)</button>
        {confirmCede && <div className="battle-alert"><p>Céder utilise tes attaques restantes pour amortir cette ligne. Tu perdras {damage} PV, puis un nouvel assaut commence si une défense reste disponible.</p><button className="battle-primary" disabled={busy} onClick={() => act({ type: "cede" }, state.revision)}>Confirmer</button><button className="battle-secondary" onClick={() => setConfirmCede(false)}>Continuer à jouer</button></div>}
      </> : <>{chosen.length === 1 && <div className="escalade-ability-console"><span>Capacité optionnelle</span>{chosen.map(card => { const cost = abilityCost(card.ability, state.event); return <button type="button" key={card.id} className={abilityCardId === card.id ? "is-active" : ""} disabled={state.pressure[state.side] < cost} onClick={() => setAbilityCardId(abilityCardId === card.id ? null : card.id)}>♨ {ABILITY_INFO[card.ability].name} · {cost}<small>{ABILITY_INFO[card.ability].short}</small></button>; })}</div>}<button className="battle-primary" disabled={busy || chosen.length !== 1 || chosen[0].kind !== "DEFENSE" || (!!abilityCardId && !canPayAbility)} onClick={() => act({ type: "defend", cardId: chosen[0].id, useAbility: !!abilityCardId }, state.revision)}>Poser la défense</button>{state.phase === "RELAY" && <button className="battle-secondary" disabled={busy} onClick={() => act({ type: "pass" }, state.revision)}>Laisser l’adversaire ouvrir</button>}</>}</div>}
    </>}
    <details className="escalade-journal"><summary>Journal du match</summary><ol>{state.log.map((line, i) => <li key={i}>{line.replace(/\bA\b/g, match.challenger.username).replace(/\bB\b/g, match.opponent.username)}</li>)}</ol></details>
  </div>;
}
export function EscaladeClient() {
  const [matches, setMatches] = useState<Match[]>([]); const [self, setSelf] = useState(""); const [balance, setBalance] = useState(0);
  const [players, setPlayers] = useState<{ id: string; username: string; isSelf: boolean }[]>([]); const [owned, setOwned] = useState<Owned[]>([]);
  const [opponent, setOpponent] = useState(""); const [draft, setDraft] = useState<string[]>([]); const [coins, setCoins] = useState(0); const [stake, setStake] = useState(""); const [search, setSearch] = useState("");
  const [form, setForm] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [tuto, setTuto] = useState(false); const [loaded, setLoaded] = useState(false);
  const [presentedFinishedId, setPresentedFinishedId] = useState<string | null>(null);
  const [draftOffer, setDraftOffer] = useState<DraftOffer | null>(null);
  const requestLock = useRef(false); const refreshCounter = useRef(0);
  const previousMatches = useRef<Match[]>([]);
  const [skinMap, setSkinMap] = useState<Record<string, SkinData>>({});
  const skinBuilt = useRef(false);
  const refresh = useCallback(async () => {
    const counter = ++refreshCounter.current;
    const data = await json("/api/bataille");
    if (counter === refreshCounter.current) {
      const battles = data.battles as Match[];
      const justFinished = previousMatches.current.length ? battles.find((battle) => battle.status === "FINISHED" && previousMatches.current.some((old) => old.id === battle.id && old.status === "ACTIVE")) : null;
      if (justFinished) setPresentedFinishedId(justFinished.id);
      previousMatches.current = battles;
      setMatches(battles); setSelf(data.selfId); setBalance(data.coins); setDraftOffer(data.draftOffer); setLoaded(true);
    }
  }, []);
  useEffect(() => {
    const report = (e: unknown) => setError(e instanceof Error ? e.message : "Erreur réseau.");
    void refresh().catch(report);
    void json("/api/joueurs").then(data => setPlayers(data.filter((p: { isSelf: boolean }) => !p.isSelf).sort((a: { username: string }, b: { username: string }) => a.username.localeCompare(b.username, "fr")))).catch(report);
    void json("/api/collection").then((data: Owned[]) => { setOwned(data); if (!skinBuilt.current && data.length) { const skins: SkinData[] = data.flatMap(c => c.game ? [{ image: c.game.headerImage, rarity: c.game.rarity, name: c.game.name, atk: c.game.atk, def: c.game.def }] : c.studio?.avatarUrl ? [{ image: c.studio.avatarUrl, rarity: c.studio.rarity, name: c.studio.name, atk: c.studio.atk, def: c.studio.def }] : []); const shuffled = [...skins].sort(() => Math.random() - 0.5); const map: Record<string, SkinData> = {}; TACTICS.forEach((t, i) => { if (shuffled.length) map[t.id] = shuffled[i % shuffled.length]; }); setSkinMap(map); skinBuilt.current = true; } }).catch(report);
    const poll = () => { if (document.visibilityState === "visible" && !requestLock.current) void refresh().catch(report); };
    const timer = window.setInterval(poll, 10000); document.addEventListener("visibilitychange", poll);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [refresh]);
  function openForm(id: string) { setForm(form === id ? null : id); setDraft([]); setCoins(0); setStake(""); setSearch(""); }
  async function submit(id: string | null, action: string, extra: Record<string, unknown> = {}) {
    if (requestLock.current) return;
    requestLock.current = true; setBusy(true); setError(""); setNotice(""); ++refreshCounter.current;
    try {
      if (id && action === "play") setPresentedFinishedId(id);
      const favoriteIds = stake && owned.find((card) => card.id === stake)?.isPinned ? [stake] : [];
      if ((action === "create" || action === "accept") && favoriteIds.length && !window.confirm("Cette carte est dans tes favoris. Confirmer sa mise ?")) return;
      await json(id ? `/api/bataille/${id}` : "/api/bataille", id ? { action, ...extra, confirmedFavoriteCardIds: favoriteIds } : { opponentId: opponent, cardIds: draft, stakeCoins: coins, stakeCardId: stake || null, dealId: draftOffer?.dealId, confirmedFavoriteCardIds: favoriteIds });
      if (action !== "play") { setForm(null); setDraft([]); setStake(""); setCoins(0); }
      await refresh();
      setNotice(action === "create" ? "Défi envoyé, main gardée secrète." : "Action enregistrée.");
      void json("/api/collection").then(setOwned).catch(() => {});
    } catch (e) { setError(e instanceof Error ? e.message : "Action impossible."); await refresh().catch(() => {}); }
    finally { requestLock.current = false; setBusy(false); }
  }
  const modern = matches.filter(m => m.rulesVersion === 3);
  const active = modern.filter(m => m.status === "ACTIVE"); const pending = modern.filter(m => m.status === "PENDING");
  const presentedFinished = presentedFinishedId ? modern.find(m => m.id === presentedFinishedId && m.status === "FINISHED") ?? null : null;
  const visibleArenas = presentedFinished ? [...active, presentedFinished] : active;
  const validStake = Number.isInteger(coins) && coins >= 0 && coins <= balance && coins <= 1000000;
  const name = (card: Owned) => card.game?.name ?? card.studio?.name ?? "Carte";
  function draftForm(id: string | null) { const pendingMatch = id ? pending.find(match => match.id === id) : null; const layout = pendingMatch?.abilityLayout ?? draftOffer?.layout; const budget = pendingMatch?.draftBudget ?? draftOffer?.budget ?? DRAFT_BUDGET; return <div className="escalade-form"><HandPicker ids={draft} change={setDraft} disabled={busy} skinMap={skinMap} layout={layout ?? undefined} budget={budget} />
    <details className="battle-stake"><summary>Mise facultative · {coins} GP{stake ? " + une carte" : ""}</summary><p>Les mises restent bloquées jusqu’à deux manches gagnées. La carte de collection misée ne combat pas.</p>
      <label className="battle-label">Gigapuissances · solde {balance} gigapuissances<input type="number" min={0} max={Math.min(balance, 1000000)} value={coins} onChange={e => setCoins(Number(e.target.value))} /></label>
      <label className="battle-label">Rechercher une carte à miser<input value={search} onChange={e => setSearch(e.target.value)} /></label>
      {stake && <button className="battle-secondary" onClick={() => setStake("")}>Retirer la carte misée</button>}
      <div className="escalade-stakes">{owned.filter(c => c.sellable !== false && !c.staked && name(c).toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(c => <button key={c.id} className={`battle-secondary ${stake === c.id ? "escalade-selected" : ""}`} aria-pressed={stake === c.id} onClick={() => setStake(stake === c.id ? "" : c.id)}>{name(c)}{stake === c.id ? " ✓" : ""}</button>)}</div>
    </details><button className="battle-primary" disabled={busy || !layout || !validHand(draft, layout, budget) || !validStake || (!id && !opponent)} onClick={() => void submit(id, id ? "accept" : "create", { cardIds: draft, stakeCoins: coins, stakeCardId: stake || null })}>{id ? "Accepter avec cette main" : "Envoyer le défi"}</button></div>; }
  return <div className="battle-page"><header className="battle-hero"><div><span className="battle-eyebrow">⚙ Arène tactique</span><h1>L’Escalade</h1><p>Deux manches gagnantes. Fais monter la vapeur, déclenche tes capacités et adapte-toi à l’événement.</p></div><div className="battle-actions"><button className="escalade-tuto-button" onClick={() => setTuto(true)}><span aria-hidden="true">⚙</span> Tuto</button><a href="/bataille/entrainement" className="escalade-tuto-button">🤖 Entraîner</a><button className="battle-primary" disabled={busy} onClick={() => openForm("new")}>{form === "new" ? "Fermer" : "+ Lancer un défi"}</button></div></header>
    <EscaladeRules />{tuto && <EscaladeTutorial close={() => setTuto(false)} skinMap={skinMap} />}
    {error && <p className="battle-alert" role="alert">{error}</p>}{notice && <p className="battle-notice" role="status">{notice}</p>}
    {form === "new" && <section className="battle-panel"><h2>Nouveau défi</h2><label className="battle-label">Adversaire<select value={opponent} onChange={e => setOpponent(e.target.value)}><option value="">Choisir un joueur</option>{players.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}</select></label>{draftForm(null)}</section>}
    <section className="battle-section"><div className="battle-section-heading"><h2>{presentedFinished ? "Résultat à regarder" : `Matchs en cours · ${active.length}`}</h2><button className="battle-refresh" disabled={busy} onClick={() => void refresh().catch(e => setError(e.message))}>Actualiser</button></div>{!loaded && <p>Chargement des combats…</p>}{loaded && !visibleArenas.length && <p>Aucun match actif.</p>}{visibleArenas.map(m => <article className={`battle-panel${m.status === "FINISHED" ? " is-presented-result" : ""}`} key={m.id}><h3>{m.challenger.username} contre {m.opponent.username}</h3>{m.status === "FINISHED" && <p className="escalade-result-kept">Le plateau reste ouvert jusqu’à ce que tu aies lu le résultat.</p>}<p className="battle-muted">Mises : {m.challengerStakeCoins + m.opponentStakeCoins} gigapuissances{m.challengerStakeCardName ? ` · ${m.challengerStakeCardName}` : ""}{m.opponentStakeCardName ? ` · ${m.opponentStakeCardName}` : ""}</p>{m.escalation && <Arena match={m} busy={busy || m.status === "FINISHED"} act={(move, revision) => void submit(m.id, "play", { move, revision })} skinMap={skinMap} onFinishedAcknowledged={m.status === "FINISHED" ? () => setPresentedFinishedId(null) : undefined} />}</article>)}</section>
    <section className="battle-section"><h2>Défis en attente · {pending.length}</h2>{pending.map(m => <article className="battle-panel" key={m.id}><h3>{m.challenger.username} contre {m.opponent.username}</h3><p>Mise proposée : {m.challengerStakeCoins} gigapuissances{m.challengerStakeCardName ? ` + ${m.challengerStakeCardName}` : ""}.</p>{m.challengerId === self ? <><p>Ta main secrète : {m.draft?.map(c => `${c.kind === "ATTACK" ? "ATK" : "DEF"} ${c.value}`).join(" · ")}</p><button className="battle-secondary" disabled={busy} onClick={() => void submit(m.id, "cancel")}>Annuler et récupérer ma mise</button></> : <><div className="battle-actions"><button className="battle-primary" disabled={busy} onClick={() => openForm(m.id)}>Choisir ma main</button><button className="battle-secondary" disabled={busy} onClick={() => void submit(m.id, "decline")}>Refuser</button></div>{form === m.id && draftForm(m.id)}</>}</article>)}</section>
    <section className="battle-section"><h2>Résultats récents</h2>{modern.filter(m => m.status === "FINISHED" && m.id !== presentedFinishedId).slice(0, 12).map(m => <details className="battle-panel" key={m.id}><summary>{m.winnerId === self ? "Victoire" : "Défaite"} · {m.challenger.username} / {m.opponent.username} · {m.escalation?.wins.join("–")}</summary>{m.escalation && <Arena match={m} busy={true} act={() => {}} skinMap={skinMap} />}</details>)}</section>
    {matches.some(m => m.rulesVersion < 3) && <details className="battle-panel"><summary>Anciens duels · anciennes règles</summary><BatailleClient legacyOnly /></details>}
  </div>;
}
