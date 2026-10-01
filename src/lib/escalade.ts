// Pure engine shared by the server, preview and tutorial. No database or randomness.
export const ESCALADE_VERSION = 3;
export const DRAFT_BUDGET = 15;
export const MAX_ATTACK_POWER = 16;
export type Side = 0 | 1;
export type AbilityId = "SURCHARGE" | "PERCUSSION" | "TURBINE" | "COURT_CIRCUIT" | "INCENDIE" | "BLINDAGE" | "SOUPAPE" | "MIROIR" | "ACCUMULATEUR";
export type EscaladeEventId = "CALME" | "HAUTE_PRESSION" | "METAL_FRAGILE" | "ATELIER_EFFICACE";
export type Tactic = { id: string; kind: "ATTACK" | "DEFENSE"; value: number; ability: AbilityId };
export const ABILITY_INFO: Record<AbilityId, { name: string; cost: number; short: string }> = {
  SURCHARGE: { name: "Surcharge", cost: 3, short: "+2 ATK" },
  PERCUSSION: { name: "Percussion", cost: 2, short: "+2 percée" },
  TURBINE: { name: "Turbine", cost: 2, short: "+2 vapeur si brèche" },
  COURT_CIRCUIT: { name: "Court-circuit", cost: 4, short: "2 dégâts directs" },
  INCENDIE: { name: "Incendie", cost: 4, short: "1 PV sur 2 actions" },
  BLINDAGE: { name: "Blindage", cost: 2, short: "+3 DEF" },
  SOUPAPE: { name: "Soupape", cost: 3, short: "+2 PV" },
  MIROIR: { name: "Miroir de choc", cost: 3, short: "+2 dégâts de riposte" },
  ACCUMULATEUR: { name: "Accumulateur", cost: 2, short: "+3 vapeur à la rupture" },
};
export const EVENT_INFO: Record<EscaladeEventId, { name: string; short: string }> = {
  CALME: { name: "Machines stables", short: "Aucun modificateur." },
  HAUTE_PRESSION: { name: "Haute pression", short: "+1 vapeur à chaque gain." },
  METAL_FRAGILE: { name: "Métal fragile", short: "Toutes les défenses perdent 2 DEF." },
  ATELIER_EFFICACE: { name: "Atelier efficace", short: "Les capacités coûtent 1 vapeur de moins." },
};
const EVENTS: EscaladeEventId[] = ["CALME", "HAUTE_PRESSION", "METAL_FRAGILE", "ATELIER_EFFICACE"];
export const TACTICS: readonly Tactic[] = [
  ...[2, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value, i) => ({ id: `a${i}`, kind: "ATTACK" as const, value, ability: (["SURCHARGE", "SURCHARGE", "PERCUSSION", "PERCUSSION", "TURBINE", "TURBINE", "SURCHARGE", "SURCHARGE", "TURBINE", "TURBINE"] as AbilityId[])[i] })),
  ...[8, 12, 15, 18, 22].map((value, i) => ({ id: `d${i}`, kind: "DEFENSE" as const, value, ability: (["BLINDAGE", "BLINDAGE", "SOUPAPE", "SOUPAPE", "BLINDAGE"] as AbilityId[])[i] })),
];
export type AbilityLayout = Record<string, AbilityId>;
export type EscaladePerformedAction = { side: Side; type: "defend"; card: Tactic; ability?: AbilityId } | { side: Side; type: "attack"; cards: Tactic[]; ability?: AbilityId; abilityCardId?: string; power: number; broken: boolean } | { side: Side; type: "pass" | "cede" };
export type EscaladeDamage = { side: Side; amount: number; kind: "hp" | "def" };
export type EscaladeHistoryEntry = { revision: number; action: EscaladePerformedAction; damage?: EscaladeDamage[] };
const ATTACK_ABILITY_BAG: AbilityId[] = ["SURCHARGE", "SURCHARGE", "PERCUSSION", "PERCUSSION", "TURBINE", "TURBINE", "COURT_CIRCUIT", "COURT_CIRCUIT", "INCENDIE", "INCENDIE"];
const DEFENSE_ABILITY_BAG: AbilityId[] = ["BLINDAGE", "BLINDAGE", "SOUPAPE", "MIROIR", "ACCUMULATEUR"];
function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items]; let value = seed >>> 0;
  const random = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 2 ** 32; };
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
export function abilityLayoutForSeed(seed: number, round = 1): AbilityLayout {
  const roundSeed = (seed ^ Math.imul(round, 0x9e3779b1)) >>> 0;
  const attacks = seededShuffle(ATTACK_ABILITY_BAG, roundSeed);
  const defenses = seededShuffle(DEFENSE_ABILITY_BAG, roundSeed ^ 0x85ebca6b);
  return Object.fromEntries(TACTICS.map((card, index) => [card.id, card.kind === "ATTACK" ? attacks[index] : defenses[index - 10]]));
}
export function tacticCost(card: Pick<Tactic, "kind" | "value">): number {
  return card.kind === "ATTACK" ? Math.ceil(card.value / 2) : card.value <= 8 ? 1 : card.value <= 12 ? 2 : card.value <= 15 ? 3 : card.value <= 18 ? 4 : 5;
}
export function handCost(cards: Pick<Tactic, "kind" | "value">[]): number { return cards.reduce((sum, card) => sum + tacticCost(card), 0); }
export function tacticsWithLayout(layout?: AbilityLayout): Tactic[] { return TACTICS.map(card => ({ ...card, ability: layout?.[card.id] ?? card.ability })); }
export type EscaladeState = {
  version: 3; hands: [Tactic[], Tactic[]]; hp: [number, number]; turn: Side;
  phase: "DRAFT" | "OPEN" | "REPLY" | "RELAY" | "FINISHED";
  line: { owner: Side; card: Tactic; remaining: number; riposteBonus?: number; breakPressure?: number } | null;
  winner: Side | null; revision: number; log: string[];
  wins: [number, number]; ready: [boolean, boolean]; round: number; starter: Side;
  pressure: [number, number]; burn: [number, number]; event: EscaladeEventId; abilitySeed: number; abilityLayout: AbilityLayout; draftBudget: number;
  lastAction: EscaladePerformedAction | null; actionHistory: EscaladeHistoryEntry[];
};
export type EscaladeAction = { type: "draft"; cardIds: string[] } | { type: "defend"; cardId: string; useAbility?: boolean } | { type: "attack"; cardIds: string[]; abilityCardId?: string } | { type: "cede" } | { type: "pass" };
export type EscaladeView = Omit<EscaladeState, "hands"> & { hand: Tactic[]; handCounts: [number, number]; side: Side };
export function draftHand(ids: unknown, layout?: AbilityLayout, maxCost?: number): Tactic[] {
  if (!Array.isArray(ids) || ids.length !== 5 || new Set(ids).size !== 5 || ids.some(id => typeof id !== "string")) throw new Error("Choisis 5 cartes différentes du paquet tactique.");
  const deck = tacticsWithLayout(layout);
  const cards = ids.map(id => deck.find(card => card.id === id));
  if (cards.some(card => !card)) throw new Error("Carte tactique inconnue.");
  const hand = cards as Tactic[];
  if (!hand.some(card => card.kind === "DEFENSE")) throw new Error("Ta main doit contenir au moins une défense.");
  if (maxCost !== undefined && !hand.some(card => card.kind === "ATTACK")) throw new Error("Ta main doit contenir au moins une attaque.");
  if (maxCost !== undefined && handCost(hand) > maxCost) throw new Error(`Ta main dépasse le budget de ${maxCost} points.`);
  return hand.map(card => ({ ...card }));
}
export function attackPower(cards: Tactic[]) {
  if (!cards.length || cards.some(card => card.kind !== "ATTACK")) throw new Error("Choisis au moins une attaque.");
  const values = cards.map(card => card.value);
  const pair = new Set(values).size < values.length;
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const run = sorted.some((n, i) => sorted[i + 1] === n + 1 && sorted[i + 2] === n + 2);
  // One best combo per action; no overlapping or stacked bonuses. Calculé sur les
  // valeurs brutes pour continuer à récompenser la paire/suite, pas la dégressive.
  const bonus = run ? 5 : pair ? 3 : 0;
  // Rendement dégressif : empiler toutes ses attaques en un coup n'additionne plus
  // leur pleine valeur sans limite — seule la plus forte compte à 100%, chaque carte
  // suivante à 50% (arrondi inférieur). Une carte seule n'est jamais affaiblie ; deux
  // cartes ou plus rapportent nettement moins que leur somme brute, ce qui rend le
  // "tout d'un coup" moins mécaniquement écrasant qu'attaquer en plusieurs temps.
  const desc = [...values].sort((a, b) => b - a);
  const raw = desc.reduce((sum, v, i) => sum + (i === 0 ? v : Math.floor(v / 2)), 0);
  return { raw, bonus, pierce: values.some(n => n === 2 || n === 3) ? 4 : 0 };
}
export function createEscalade(first: unknown, second: unknown, starter: Side, abilitySeed = 0, draftBudget = 23): EscaladeState {
  const event = eventForRound(1);
  const abilityLayout = abilitySeed ? abilityLayoutForSeed(abilitySeed, 1) : Object.fromEntries(TACTICS.map(card => [card.id, card.ability]));
  return { version: 3, hands: [draftHand(first, abilityLayout, draftBudget), draftHand(second, abilityLayout, draftBudget)], hp: [20, 20], pressure: [0, 0], burn: [0, 0], event, abilitySeed, abilityLayout, draftBudget, turn: starter, starter, round: 1, wins: [0, 0], ready: [true, true], phase: "OPEN", line: null, winner: null, revision: 0, lastAction: null, actionHistory: [], log: [`Manche 1 : ${starter === 0 ? "A" : "B"} ouvre. Événement : ${EVENT_INFO[event].name}.`] };
}
function eventForRound(round: number): EscaladeEventId { return EVENTS[(round - 1) % EVENTS.length]; }
function hydrate(card: Tactic, layout: AbilityLayout): Tactic { const base = TACTICS.find(item => item.id === card.id) ?? card; return { ...base, ability: layout[card.id] ?? card.ability ?? base.ability }; }
export function normalizeEscalade(input: EscaladeState): EscaladeState {
  const raw = structuredClone(input) as EscaladeState & { version?: number; pressure?: [number, number]; burn?: [number, number]; event?: EscaladeEventId; abilitySeed?: number; abilityLayout?: AbilityLayout; draftBudget?: number; actionHistory?: EscaladeHistoryEntry[] };
  raw.version = 3; raw.pressure = raw.pressure ?? [0, 0]; raw.burn = raw.burn ?? [0, 0]; raw.actionHistory ??= []; raw.event = raw.event ?? eventForRound(raw.round); raw.abilitySeed ??= 0; raw.draftBudget ??= 23;
  raw.abilityLayout ??= raw.abilitySeed ? abilityLayoutForSeed(raw.abilitySeed, raw.round) : Object.fromEntries(TACTICS.map(card => [card.id, card.ability]));
  raw.hands = [raw.hands[0].map(card => hydrate(card, raw.abilityLayout)), raw.hands[1].map(card => hydrate(card, raw.abilityLayout))];
  if (raw.line) raw.line.card = hydrate(raw.line.card, raw.abilityLayout);
  return raw;
}
export function abilityCost(ability: AbilityId, event: EscaladeEventId): number { return Math.max(1, ABILITY_INFO[ability].cost - (event === "ATELIER_EFFICACE" ? 1 : 0)); }
function gainPressure(state: EscaladeState, side: Side, amount: number) { state.pressure[side] = Math.min(6, state.pressure[side] + amount + (state.event === "HAUTE_PRESSION" ? 1 : 0)); }
function spendAbility(state: EscaladeState, side: Side, card: Tactic): AbilityId {
  const cost = abilityCost(card.ability, state.event);
  if (state.pressure[side] < cost) throw new Error(`Il faut ${cost} vapeur pour ${ABILITY_INFO[card.ability].name}.`);
  state.pressure[side] -= cost;
  return card.ability;
}
// Riposte du bouclier : une attaque qui ne casse pas encaisse un contre-dégât
// immédiat, proportionnel à la taille de la défense posée — plus le bouclier est
// gros, plus rater coûte cher. Récompense les grosses défenses (avant, seule leur
// résistance comptait) et punit concrètement le "tout d'un coup" raté, qui jusque-là
// ne coûtait rien avant de céder.
function riposteDamage(defenseValue: number): number {
  if (defenseValue >= 22) return 3;
  if (defenseValue >= 15) return 2;
  if (defenseValue >= 8) return 1;
  return 0;
}
function finish(state: EscaladeState, reason: string) {
  const bestAttack = (side: Side) => Math.max(0, ...state.hands[side].filter(c => c.kind === "ATTACK").map(c => c.value));
  const attackSum = (side: Side) => state.hands[side].filter(c => c.kind === "ATTACK").reduce((sum, c) => sum + c.value, 0);
  // Priorité aux PV ; égalité → meilleure attaque restante ; égalité encore →
  // somme des attaques restantes. Réduit nettement les matchs nuls tout en gardant
  // les PV comme critère principal.
  let difference = state.hp[0] - state.hp[1];
  if (difference === 0) difference = bestAttack(0) - bestAttack(1);
  if (difference === 0) difference = attackSum(0) - attackSum(1);
  state.winner = difference > 0 ? 0 : difference < 0 ? 1 : null;
  if (state.winner !== null) state.wins[state.winner]++;
  state.log.push(`${reason} Manche ${state.round} : ${state.winner === null ? "égalité, aucun point." : `${state.winner === 0 ? "A" : "B"} gagne.`} PV ${state.hp[0]}–${state.hp[1]}. Manches ${state.wins[0]}–${state.wins[1]}.`);
  if (state.winner !== null && state.wins[state.winner] === 2) {
    state.phase = "FINISHED";
    state.log.push(`${state.winner === 0 ? "A" : "B"} remporte le match et les mises !`);
  } else {
    state.winner = null; state.phase = "DRAFT"; state.ready = [false, false]; state.hands = [[], []]; state.line = null;
    state.round++; state.starter = (1 - state.starter) as Side;
    state.pressure = [0, 0]; state.burn = [0, 0]; state.event = eventForRound(state.round); state.abilityLayout = state.abilitySeed ? abilityLayoutForSeed(state.abilitySeed, state.round) : state.abilityLayout;
  }
}
function concede(state: EscaladeState) {
  const side = state.turn;
  const amortization = state.hands[side].filter(c => c.kind === "ATTACK").reduce((sum, c) => sum + c.value, 0);
  const damage = Math.max(0, state.line!.remaining - amortization);
  state.hands[side] = state.hands[side].filter(c => c.kind !== "ATTACK");
  state.hp[side] = Math.max(0, state.hp[side] - damage);
  state.lastAction = { side, type: "cede" };
  state.log.push(`${side === 0 ? "A" : "B"} cède l'assaut : ${state.line!.remaining} − ${amortization} = ${damage} dégât(s).`);
  state.line = null;
  if (state.hp[side] === 0) finish(state, "K.O. après une ligne cédée.");
  else nextOpening(state, side, false);
}
function nextOpening(state: EscaladeState, side: Side, relay: boolean) {
  const other = (1 - side) as Side;
  if (state.hands[side].some(c => c.kind === "DEFENSE")) { state.turn = side; state.phase = relay ? "RELAY" : "OPEN"; }
  else if (state.hands[other].some(c => c.kind === "DEFENSE")) { state.turn = other; state.phase = "OPEN"; }
  else finish(state, "Plus aucune défense à poser.");
}
export function playEscalade(input: EscaladeState, side: Side, action: EscaladeAction): EscaladeState {
  input = normalizeEscalade(input);
  if (input.phase === "FINISHED") throw new Error("Ce match est terminé.");
  if (action.type === "draft") {
    if (input.phase !== "DRAFT" || input.ready[side]) throw new Error("Main déjà validée ou manche en cours.");
    const drafted: EscaladeState = structuredClone(input);
    drafted.hands[side] = draftHand(action.cardIds, drafted.abilityLayout, drafted.draftBudget); drafted.ready[side] = true; drafted.revision++;
    if (drafted.ready.every(Boolean)) {
      drafted.hp = [20, 20]; drafted.turn = drafted.starter; drafted.phase = "OPEN";
      drafted.log.push(`Manche ${drafted.round} : ${drafted.starter === 0 ? "A" : "B"} ouvre. Événement : ${EVENT_INFO[drafted.event].name}.`);
    }
    return drafted;
  }
  if (input.phase === "DRAFT" || side !== input.turn) throw new Error("Ce n'est pas ton tour.");
  const state: EscaladeState = structuredClone(input);
  const other = (1 - side) as Side;
  const label = side === 0 ? "A" : "B";
  let recordedAction: EscaladePerformedAction | null = null;
  if (state.burn[side] > 0) {
    state.burn[side]--; state.hp[side] = Math.max(0, state.hp[side] - 1);
    state.log.push(`Incendie : ${label} perd 1 PV (${state.burn[side]} pulsation(s) restante(s)).`);
    if (state.hp[side] === 0) { finish(state, "K.O. par incendie."); state.revision++; return state; }
  }
  if (action.type === "defend") {
    if (state.phase !== "OPEN" && state.phase !== "RELAY") throw new Error("Une défense est déjà active.");
    const card = state.hands[side].find(c => c.id === action.cardId && c.kind === "DEFENSE");
    if (!card) throw new Error("Défense indisponible.");
    const ability = action.useAbility ? spendAbility(state, side, card) : undefined;
    const eventPenalty = state.event === "METAL_FRAGILE" ? 2 : 0;
    const defense = Math.max(1, card.value - eventPenalty + (ability === "BLINDAGE" ? 3 : 0));
    if (ability === "SOUPAPE") state.hp[side] = Math.min(20, state.hp[side] + 2);
    state.hands[side] = state.hands[side].filter(c => c.id !== card.id);
    state.line = { owner: side, card, remaining: defense, ...(ability === "MIROIR" ? { riposteBonus: 2 } : {}), ...(ability === "ACCUMULATEUR" ? { breakPressure: 3 } : {}) };
    state.turn = other; state.phase = "REPLY";
    state.lastAction = { side, type: "defend", card, ability };
    recordedAction = state.lastAction;
    state.log.push(`${label} pose Défense ${defense}${ability ? ` et active ${ABILITY_INFO[ability].name}` : ""}.`);
    if (defense <= 12) gainPressure(state, side, 1);
    // A player without attacks cannot stall indefinitely; resolve the final line.
    if (!state.hands[other].some(c => c.kind === "ATTACK")) concede(state);
  } else if (action.type === "attack") {
    if (state.phase !== "REPLY" || !state.line || state.line.owner === side) throw new Error("Aucune défense adverse à attaquer.");
    if (!Array.isArray(action.cardIds) || !action.cardIds.length || new Set(action.cardIds).size !== action.cardIds.length) throw new Error("Sélection d'attaque invalide.");
    const cards = action.cardIds.map(id => state.hands[side].find(c => c.id === id));
    if (cards.some(c => !c || c.kind !== "ATTACK")) throw new Error("Attaque indisponible.");
    let ability: AbilityId | undefined;
    if (action.abilityCardId) {
      const abilityCard = (cards as Tactic[]).find(card => card.id === action.abilityCardId);
      if (!abilityCard) throw new Error("La capacité doit appartenir à une carte jouée.");
      ability = spendAbility(state, side, abilityCard);
    }
    const { raw, bonus, pierce } = attackPower(cards as Tactic[]);
    const power = Math.min(MAX_ATTACK_POWER, raw + bonus + (ability === "SURCHARGE" ? 2 : 0));
    const effectivePierce = pierce + (ability === "PERCUSSION" ? 2 : 0);
    const broken = power >= Math.max(0, state.line.remaining - effectivePierce);
    if (ability === "COURT_CIRCUIT") state.hp[other] = Math.max(0, state.hp[other] - 2);
    if (ability === "INCENDIE") state.burn[other] = Math.min(2, state.burn[other] + 2);
    state.hands[side] = state.hands[side].filter(c => !action.cardIds.includes(c.id));
    state.lastAction = { side, type: "attack", cards: cards as Tactic[], ability, ...(ability ? { abilityCardId: action.abilityCardId } : {}), power, broken };
    recordedAction = state.lastAction;
    state.log.push(`${label} attaque : ${power} ATK${effectivePierce ? ` · ignore ${effectivePierce} DEF` : ""}${ability ? ` · ${ABILITY_INFO[ability].name}` : ""}. ${broken ? "Ligne brisée !" : `Résistance restante : ${state.line.remaining - power}.`}`);
    if (ability === "COURT_CIRCUIT") state.log.push(`Court-circuit : ${other === 0 ? "A" : "B"} perd 2 PV à travers la défense.`);
    if (ability === "INCENDIE") state.log.push(`Incendie : ${other === 0 ? "A" : "B"} brûlera pendant ses 2 prochaines actions.`);
    gainPressure(state, side, broken ? 2 : 1);
    if (broken && ability === "TURBINE") state.pressure[side] = Math.min(6, state.pressure[side] + 2);
    if (state.hp[other] === 0) { state.line = null; finish(state, "K.O. par court-circuit."); }
    else if (broken) {
      if (state.line.breakPressure) gainPressure(state, state.line.owner, state.line.breakPressure);
      state.line = null;
      nextOpening(state, side, true);
    }
    else {
      const shieldValue = state.line.card.value;
      state.line.remaining -= power; // Pierce is temporary, not additional permanent damage.
      const counter = riposteDamage(shieldValue) + (state.line.riposteBonus ?? 0);
      if (counter > 0) {
        state.hp[side] = Math.max(0, state.hp[side] - counter);
        state.log.push(`Riposte du bouclier ${shieldValue} : ${label} encaisse ${counter} dégât(s).`);
      }
      state.log.push(`Le défenseur passe automatiquement ; ${label} peut attaquer de nouveau ou céder.`);
      if (!state.hands[side].some(c => c.kind === "ATTACK")) concede(state);
    }
  } else if (action.type === "cede") {
    if (state.phase !== "REPLY" || !state.line) throw new Error("Tu ne peux céder que face à une défense.");
    concede(state);
    recordedAction = state.lastAction;
  } else if (action.type === "pass") {
    if (state.phase !== "RELAY") throw new Error("L'ouverture impose une défense.");
    state.lastAction = { side, type: "pass" };
    recordedAction = state.lastAction;
    state.log.push(`${label} renonce à la rechute.`);
    if (state.hands[other].some(c => c.kind === "DEFENSE")) nextOpening(state, other, false);
    else finish(state, "L'adversaire ne peut plus poser de défense.");
  } else throw new Error("Action inconnue.");
  state.lastAction = recordedAction ?? state.lastAction;
  state.revision++;
  if (state.lastAction) {
    const damage: EscaladeDamage[] = ([0, 1] as const).flatMap(target => {
      const amount = Math.max(0, input.hp[target] - state.hp[target]);
      return amount ? [{ side: target, amount, kind: "hp" as const }] : [];
    });
    if (action.type === "attack" && input.line) {
      const remaining = state.line?.card.id === input.line.card.id && state.line.owner === input.line.owner ? state.line.remaining : 0;
      const amount = Math.max(0, input.line.remaining - remaining);
      if (amount) damage.push({ side: input.line.owner, amount, kind: "def" });
    }
    state.actionHistory = [...state.actionHistory, { revision: state.revision, action: structuredClone(state.lastAction), damage }].slice(-40);
  }
  return state;
}
export function publicEscalade(state: EscaladeState, side: Side): EscaladeView {
  state = normalizeEscalade(state);
  const { hands, ...visible } = state;
  return { ...visible, hand: hands[side], handCounts: [hands[0].length, hands[1].length], side };
}
