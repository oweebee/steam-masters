export const DICE_KILLER_VERSION = 4;
export const DICE_KILLER_STARTING_HP = 30;

export type DiceSide = 0 | 1;
export type DiceKillerPhase = "BUILD" | "ATTACK" | "FINISHED";
export type DiceKillerEvent = {
  revision: number;
  side: DiceSide;
  kind: "ROLL" | "ATTACK_READY" | "HEAL" | "BACKLASH" | "HIT" | "MISS";
  dice: number[];
  total?: number;
  amount?: number;
  attackValue?: number;
  hits?: number;
};

export type DiceKillerState = {
  version: 4;
  phase: DiceKillerPhase;
  turn: DiceSide;
  hp: [number, number];
  held: number[];
  roll: number[];
  attackValue: number | null;
  attackHits: number;
  attackDice: number;
  winner: DiceSide | null;
  revision: number;
  log: string[];
  lastEvent: DiceKillerEvent | null;
};

export type DiceKillerView = DiceKillerState & { side: DiceSide };

function validateDice(dice: number[], expected: number) {
  if (dice.length !== expected || dice.some((die) => !Number.isInteger(die) || die < 1 || die > 6)) {
    throw new Error("Lancer de dés invalide.");
  }
}

export function createDiceKiller(starter: DiceSide): DiceKillerState {
  return {
    version: DICE_KILLER_VERSION,
    phase: "BUILD",
    turn: starter,
    hp: [DICE_KILLER_STARTING_HP, DICE_KILLER_STARTING_HP],
    held: [],
    roll: [],
    attackValue: null,
    attackHits: 0,
    attackDice: 5,
    winner: null,
    revision: 0,
    log: [`${starter === 0 ? "A" : "B"} commence avec 30 PV.`],
    lastEvent: null,
  };
}

function nextTurn(state: DiceKillerState) {
  state.turn = (1 - state.turn) as DiceSide;
  state.phase = "BUILD";
  state.held = [];
  state.roll = [];
  state.attackValue = null;
  state.attackHits = 0;
  state.attackDice = 5;
}

function finishIfNeeded(state: DiceKillerState, defeated: DiceSide) {
  if (state.hp[defeated] > 0) return false;
  state.hp[defeated] = 0;
  state.phase = "FINISHED";
  state.winner = (1 - defeated) as DiceSide;
  state.log.push(`${defeated === 0 ? "A" : "B"} tombe à 0 PV. ${state.winner === 0 ? "A" : "B"} remporte le duel.`);
  return true;
}

export function rollBuild(input: DiceKillerState, side: DiceSide, dice: number[]): DiceKillerState {
  const state = structuredClone(input);
  if (state.phase !== "BUILD" || state.turn !== side || state.roll.length) throw new Error("Ce lancer n'est pas disponible.");
  const expected = 5 - state.held.length;
  validateDice(dice, expected);
  state.roll = [...dice];
  state.revision++;
  state.lastEvent = { revision: state.revision, side, kind: "ROLL", dice: [...state.held, ...dice] };
  state.log.push(`${side === 0 ? "A" : "B"} lance ${expected} dé${expected > 1 ? "s" : ""}.`);
  return state;
}

export function keepBuildDice(
  input: DiceKillerState,
  side: DiceSide,
  indices: number[],
  nextDice: number[],
  regenerationDie?: number,
): DiceKillerState {
  const state = structuredClone(input);
  if (state.phase !== "BUILD" || state.turn !== side || !state.roll.length) throw new Error("Aucun dé à garder.");
  const unique = [...new Set(indices)].sort((a, b) => a - b);
  if (!unique.length || unique.some((index) => !Number.isInteger(index) || index < 0 || index >= state.roll.length)) {
    throw new Error("Garde au moins un dé de ce lancer.");
  }
  state.held.push(...unique.map((index) => state.roll[index]));
  const remaining = 5 - state.held.length;
  state.roll = [];
  state.revision++;

  if (remaining > 0) {
    validateDice(nextDice, remaining);
    state.roll = [...nextDice];
    state.lastEvent = { revision: state.revision, side, kind: "ROLL", dice: [...state.held, ...nextDice] };
    state.log.push(`${side === 0 ? "A" : "B"} garde ${unique.length} dé${unique.length > 1 ? "s" : ""} et relance les ${remaining} autres.`);
    return state;
  }

  validateDice(nextDice, 0);
  const total = state.held.reduce((sum, die) => sum + die, 0);
  if (total < 11 || total > 24) {
    const attackValue = total < 11 ? 11 - total : total - 24;
    state.phase = "ATTACK";
    state.attackValue = attackValue;
    state.attackHits = 0;
    state.attackDice = 5;
    state.lastEvent = { revision: state.revision, side, kind: "ATTACK_READY", dice: [...state.held], total, attackValue };
    state.log.push(`${side === 0 ? "A" : "B"} totalise ${total} : attaque aux ${attackValue}.`);
    return state;
  }

  if (total === 11 || total === 24) {
    if (!Number.isInteger(regenerationDie) || regenerationDie! < 1 || regenerationDie! > 6) throw new Error("Dé de régénération invalide.");
    const before = state.hp[side];
    state.hp[side] += regenerationDie!;
    state.lastEvent = { revision: state.revision, side, kind: "HEAL", dice: [...state.held, regenerationDie!], total, amount: state.hp[side] - before };
    state.log.push(`${side === 0 ? "A" : "B"} totalise ${total} et récupère ${regenerationDie} PV.`);
    nextTurn(state);
    return state;
  }

  if (total <= 17) {
    const gain = total - 11;
    state.hp[side] += gain;
    state.lastEvent = { revision: state.revision, side, kind: "HEAL", dice: [...state.held], total, amount: gain };
    state.log.push(`${side === 0 ? "A" : "B"} totalise ${total} et récupère ${gain} PV.`);
    nextTurn(state);
    return state;
  }

  const loss = 24 - total;
  state.hp[side] -= loss;
  state.lastEvent = { revision: state.revision, side, kind: "BACKLASH", dice: [...state.held], total, amount: loss };
  state.log.push(`${side === 0 ? "A" : "B"} totalise ${total} et perd ${loss} PV.`);
  if (!finishIfNeeded(state, side)) nextTurn(state);
  return state;
}

export function rollAttack(input: DiceKillerState, side: DiceSide, dice: number[]): DiceKillerState {
  const state = structuredClone(input);
  if (state.phase !== "ATTACK" || state.turn !== side || !state.attackValue) throw new Error("Aucune attaque à lancer.");
  validateDice(dice, state.attackDice);
  const hits = dice.filter((die) => die === state.attackValue).length;
  state.revision++;
  if (hits > 0) {
    state.attackHits += hits;
    state.attackDice -= hits;
    if (state.attackDice === 0) state.attackDice = 5;
    state.lastEvent = { revision: state.revision, side, kind: "HIT", dice, attackValue: state.attackValue, hits };
    state.log.push(`${side === 0 ? "A" : "B"} trouve ${hits} dé${hits > 1 ? "s" : ""} de valeur ${state.attackValue} et poursuit.`);
    return state;
  }

  const damage = state.attackHits * state.attackValue;
  const target = (1 - side) as DiceSide;
  state.hp[target] -= damage;
  state.lastEvent = { revision: state.revision, side, kind: "MISS", dice, attackValue: state.attackValue, hits: state.attackHits, amount: damage };
  state.log.push(`${side === 0 ? "A" : "B"} termine son attaque : ${state.attackHits} × ${state.attackValue} = ${damage} dégât${damage > 1 ? "s" : ""}.`);
  if (!finishIfNeeded(state, target)) nextTurn(state);
  return state;
}

export function publicDiceKiller(state: DiceKillerState, side: DiceSide): DiceKillerView {
  return { ...structuredClone(state), side };
}
