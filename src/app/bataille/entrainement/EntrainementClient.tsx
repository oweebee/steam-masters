"use client";
import { useEffect, useRef, useState } from "react";
import { DRAFT_BUDGET, MAX_ATTACK_POWER, TACTICS, abilityCost, abilityLayoutForSeed, attackPower, createEscalade, draftHand, playEscalade, publicEscalade, type AbilityLayout, type EscaladeAction, type EscaladeState } from "@/lib/escalade";
import { Arena, ARENA_REVEAL_MS, HandPicker } from "../EscaladeClient";
import { EscaladeRules, EscaladeTutorial } from "../EscaladeHelp";

type SkinData = { image: string; rarity: string; name: string; atk: number; def: number };
type Owned = {
  id: string;
  game?: { name: string; headerImage: string; rarity: string; atk: number; def: number } | null;
  studio?: { name: string; avatarUrl?: string | null; rarity: string; atk: number; def: number } | null;
};

// Une main polyvalente au budget exact : DEF15 + ATK 4/5/6/7 = 15 points.
const BOT_DRAFT = ["d2", "a3", "a4", "a5", "a6"];

function botAction(state: EscaladeState): EscaladeAction | null {
  const hand = state.hands[1];
  if (state.phase === "DRAFT" && !state.ready[1]) return { type: "draft", cardIds: BOT_DRAFT };
  if (state.turn !== 1) return null;
  if (state.phase === "OPEN" || state.phase === "RELAY") {
    const def = [...hand.filter(c => c.kind === "DEFENSE")].sort((a, b) => b.value - a.value)[0];
    if (def) return { type: "defend", cardId: def.id, useAbility: state.pressure[1] >= abilityCost(def.ability, state.event) };
    if (state.phase === "RELAY") return { type: "pass" };
    return null;
  }
  if (state.phase === "REPLY") {
    const atks = hand.filter(c => c.kind === "ATTACK");
    if (!atks.length) return { type: "cede" };
    const choices = [] as { cards: typeof atks; score: number }[];
    for (let mask = 1; mask < 1 << atks.length; mask++) {
      const cards = atks.filter((_, index) => mask & (1 << index));
      const power = attackPower(cards);
      const breaks = Math.min(MAX_ATTACK_POWER, power.raw + power.bonus) >= Math.max(0, (state.line?.remaining ?? 0) - power.pierce);
      if (breaks) choices.push({ cards, score: cards.length * 100 + cards.reduce((sum, card) => sum + card.value, 0) });
    }
    choices.sort((a, b) => a.score - b.score);
    const cards = choices[0]?.cards ?? [[...atks].sort((a, b) => b.value - a.value)[0]];
    const abilityCard = cards.find(card => state.pressure[1] >= abilityCost(card.ability, state.event));
    return { type: "attack", cardIds: cards.map(c => c.id), ...(abilityCard ? { abilityCardId: abilityCard.id } : {}) };
  }
  return null;
}

function validDraft(ids: string[], layout: AbilityLayout) {
  try { draftHand(ids, layout, DRAFT_BUDGET); return true; } catch { return false; }
}

export function EntrainementClient() {
  const [skinMap, setSkinMap] = useState<Record<string, SkinData>>({});
  const skinBuilt = useRef(false);
  const [gameState, setGameState] = useState<EscaladeState | null>(null);
  const [trainingId, setTrainingId] = useState("training");
  const [lobbyDraft, setLobbyDraft] = useState<string[]>([]);
  const [tuto, setTuto] = useState(false);
  const [botBusy, setBotBusy] = useState(false);
  const [abilitySeed, setAbilitySeed] = useState(() => Math.floor(Math.random() * 0xffffffff));
  const lobbyLayout = abilityLayoutForSeed(abilitySeed, 1);

  // Build skinMap from collection
  useEffect(() => {
    fetch("/api/collection", { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: Owned[]) => {
        if (skinBuilt.current || !data.length) return;
        const skins: SkinData[] = data.flatMap(c =>
          c.game ? [{ image: c.game.headerImage, rarity: c.game.rarity, name: c.game.name, atk: c.game.atk, def: c.game.def }] :
          c.studio?.avatarUrl ? [{ image: c.studio.avatarUrl, rarity: c.studio.rarity, name: c.studio.name, atk: c.studio.atk, def: c.studio.def }] : []
        );
        const shuffled = [...skins].sort(() => Math.random() - 0.5);
        const map: Record<string, SkinData> = {};
        TACTICS.forEach((t, i) => { if (shuffled.length) map[t.id] = shuffled[i % shuffled.length]; });
        setSkinMap(map);
        skinBuilt.current = true;
      })
      .catch(() => {});
  }, []);

  // Bot auto-play
  useEffect(() => {
    if (!gameState || gameState.phase === "FINISHED") { setBotBusy(false); return; }
    const needsBot = (gameState.phase === "DRAFT" && !gameState.ready[1]) ||
      (gameState.turn === 1 && gameState.phase !== "DRAFT");
    if (!needsBot) { setBotBusy(false); return; }
    setBotBusy(true);
    // Laisse le temps a la revelation de la carte adverse (retournement + lecture) de se
    // terminer avant le prochain coup du bot — sinon deux actions s'enchainent trop vite
    // et on ne voit jamais la carte se retourner.
    const delay = gameState.phase === "DRAFT" ? 400 : ARENA_REVEAL_MS + 150;
    const timer = setTimeout(() => {
      const action = botAction(gameState);
      if (action) {
        try { setGameState(s => s ? playEscalade(s, 1, action) : s); }
        catch (e) { console.error("Bot error:", e); }
      }
      setBotBusy(false);
    }, delay);
    return () => clearTimeout(timer);
  }, [gameState]);

  function startGame() {
    try {
      const s = createEscalade(lobbyDraft, BOT_DRAFT, 0, abilitySeed, DRAFT_BUDGET);
      setTrainingId(`training-${crypto.randomUUID()}`);
      setGameState(s);
      setLobbyDraft([]);
    } catch (e) { alert(e instanceof Error ? e.message : "Erreur"); }
  }

  function playerAct(move: EscaladeAction) {
    setGameState(s => {
      if (!s) return s;
      try { return playEscalade(s, 0, move); }
      catch (e) { alert(e instanceof Error ? e.message : "Action invalide"); return s; }
    });
  }

  if (tuto) return (
    <div className="battle-page">
      <button className="battle-secondary" style={{ marginBottom: "12px" }} onClick={() => setTuto(false)}>← Retour</button>
      <EscaladeTutorial close={() => setTuto(false)} skinMap={skinMap} />
    </div>
  );

  // Lobby — pick starting hand
  if (!gameState) {
    return (
      <div className="battle-page">
        <header className="battle-hero">
          <div>
            <span className="battle-eyebrow">🤖 Sans enjeu · Entraînement</span>
            <h1>Mode Entraînement</h1>
            <p>Affronte un bot qui utilise aussi vapeur et capacités. Aucun enjeu — parfait pour tester les événements.</p>
          </div>
          <div className="battle-actions">
            <button className="escalade-tuto-button" onClick={() => setTuto(true)}>⚙ Tuto</button>
            <a href="/bataille" className="battle-secondary">← Matchs réels</a>
          </div>
        </header>
        <EscaladeRules />
        <section className="battle-panel">
          <h2>Choisir ta main de départ</h2>
          <p className="battle-muted">5 cartes, au moins 1 attaque et 1 défense, budget 15. Le bot utilise lui aussi une main équilibrée.</p>
          <HandPicker ids={lobbyDraft} change={setLobbyDraft} disabled={false} skinMap={skinMap} layout={lobbyLayout} budget={DRAFT_BUDGET} />
          <div className="battle-actions" style={{ marginTop: "12px" }}>
            <button className="battle-primary" disabled={!validDraft(lobbyDraft, lobbyLayout)} onClick={startGame}>
              Lancer l&apos;entraînement →
            </button>
            <button className="battle-secondary" onClick={() => { setLobbyDraft([]); setAbilitySeed(Math.floor(Math.random() * 0xffffffff)); }}>↻ Redistribuer les pouvoirs</button>
          </div>
        </section>
      </div>
    );
  }

  const view = publicEscalade(gameState, 0);
  const fakeMatch = {
    id: trainingId,
    challengerId: "player",
    opponentId: "bot",
    rulesVersion: 3,
    status: gameState.phase === "FINISHED" ? "FINISHED" : "ACTIVE",
    challenger: { username: "Toi" },
    opponent: { username: "🤖 Bot" },
    winnerId: null as string | null,
    challengerStakeCoins: 0,
    opponentStakeCoins: 0,
    challengerStakeCardName: null as string | null,
    opponentStakeCardName: null as string | null,
    escalation: view,
    draft: null as null,
  };

  return (
    <div className="battle-page">
      <header className="battle-hero">
        <div>
          <span className="battle-eyebrow">🤖 Mode Entraînement · sans enjeu</span>
          <h1>L'Escalade — Entraînement</h1>
        </div>
        <div className="battle-actions">
          <button className="escalade-tuto-button" onClick={() => setTuto(true)}>⚙ Tuto</button>
          <button className="battle-secondary" onClick={() => setGameState(null)}>↺ Recommencer</button>
          <a href="/bataille" className="battle-secondary">← Matchs réels</a>
        </div>
      </header>

      {botBusy && (
        <p className="battle-muted" role="status" style={{ textAlign: "center", padding: "8px" }}>
          🤖 Le bot réfléchit…
        </p>
      )}

      <article className="battle-panel">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Arena key={trainingId} match={fakeMatch as any} busy={botBusy} act={playerAct} skinMap={skinMap} persistReplay={false} onFinishedAcknowledged={() => setGameState(null)} />
      </article>
    </div>
  );
}
