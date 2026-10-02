"use client";

import { useEffect, useMemo, useState } from "react";
import { createDiceKiller, keepBuildDice, rollAttack, rollBuild, type DiceKillerState } from "@/lib/diceKiller";
import { DiceArena, DiceKillerRules, type DiceKillerMatch } from "../DiceKillerClient";

function dice(count: number) {
  const values = new Uint32Array(count);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value % 6 + 1);
}

function botChoice(state: DiceKillerState) {
  const low = state.roll.map((value, index) => ({ value, index })).filter(({ value }) => value <= 2);
  const high = state.roll.map((value, index) => ({ value, index })).filter(({ value }) => value >= 5);
  if (state.held.length) {
    const lowPlan = state.held.reduce((sum, value) => sum + value, 0) / state.held.length <= 3;
    const planned = lowPlan ? low : high;
    if (planned.length) return planned.map(({ index }) => index);
  } else if (low.length || high.length) {
    return (low.length >= high.length ? low : high).map(({ index }) => index);
  }
  const extreme = state.roll.reduce((best, value, index) => Math.abs(value - 3.5) > Math.abs(state.roll[best] - 3.5) ? index : best, 0);
  return [extreme];
}

function applyMove(state: DiceKillerState, side: 0 | 1, move: object) {
  const action = move as { type?: unknown; indices?: unknown };
  if (action.type === "roll") return rollBuild(state, side, dice(5 - state.held.length));
  if (action.type === "keep" && Array.isArray(action.indices)) {
    const indices = action.indices.filter((index): index is number => Number.isInteger(index));
    return keepBuildDice(state, side, indices, dice(5 - state.held.length - new Set(indices).size), dice(1)[0]);
  }
  if (action.type === "attack") return rollAttack(state, side, dice(state.attackDice));
  throw new Error("Action d'entraînement invalide.");
}

export function DiceKillerTraining() {
  const [state, setState] = useState(() => createDiceKiller(0));
  const [error, setError] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const match = useMemo<DiceKillerMatch>(() => ({
    id: "training-dice", rulesVersion: 4, status: state.phase === "FINISHED" ? "FINISHED" : "ACTIVE",
    challengerId: "player", opponentId: "bot", challenger: { username: "Toi" }, opponent: { username: "Automate" },
    challengerStakeCoins: 0, opponentStakeCoins: 0, winnerId: state.winner === null ? null : state.winner === 0 ? "player" : "bot",
    diceKiller: { ...state, side: 0 },
  }), [state]);

  useEffect(() => {
    if (state.phase === "FINISHED" || state.turn !== 1) return;
    const timer = setTimeout(() => {
      try {
        setState((current) => {
          if (current.phase === "FINISHED" || current.turn !== 1) return current;
          if (current.phase === "ATTACK") return applyMove(current, 1, { type: "attack" });
          if (!current.roll.length) return applyMove(current, 1, { type: "roll" });
          return applyMove(current, 1, { type: "keep", indices: botChoice(current) });
        });
      } catch (reason) { setError(reason instanceof Error ? reason.message : "L'automate s'est bloqué."); }
    }, 1500);
    return () => clearTimeout(timer);
  }, [state]);

  function play(move: object, revision: number) {
    if (revision !== state.revision || state.turn !== 0) return;
    try { setError(""); setState((current) => applyMove(current, 0, move)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Action impossible."); }
  }

  return <div className="battle-page killer-page"><header className="battle-hero killer-hero"><div><span className="battle-eyebrow">🤖 Banc d’essai</span><h1>Entraînement Dés tueurs</h1><p>Affronte l’Automate avec les vraies règles et les vraies animations. Cette partie reste sur cet écran : aucune mise, aucune récompense.</p></div><div className="battle-actions"><button className="escalade-tuto-button" onClick={() => setRulesOpen(true)}>? Règles simples</button><a href="/bataille/des-tueurs" className="battle-secondary">← Duels réels</a><button className="battle-primary" onClick={() => { setError(""); setState(createDiceKiller(0)); }}>Nouvelle partie</button></div></header>{rulesOpen && <DiceKillerRules close={() => setRulesOpen(false)} />}{error && <p className="battle-alert" role="alert">{error}</p>}<section className="battle-panel killer-training-panel"><DiceArena match={match} busy={false} play={play}/></section></div>;
}
