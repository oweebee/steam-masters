const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const moduleBox = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/diceKiller.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(moduleBox.exports);
const { createDiceKiller, forfeitDiceKiller, rollBuild, keepBuildDice, rollAttack, publicDiceKiller } = moduleBox.exports;

test('a build keeps at least one die and produces an attack from a total below 11', () => {
  let state = createDiceKiller(0);
  state = rollBuild(state, 0, [1, 1, 2, 4, 6]);
  assert.throws(() => keepBuildDice(state, 0, [], []));
  state = keepBuildDice(state, 0, [0, 1, 2], [1, 1]);
  state = keepBuildDice(state, 0, [0, 1], []);
  assert.equal(state.phase, 'ATTACK');
  assert.equal(state.attackValue, 5);
  assert.equal(state.held.reduce((sum, die) => sum + die, 0), 6);
});

test('scores 11-17 heal, 18-23 charge a capped shield and pass the turn', () => {
  let heal = rollBuild(createDiceKiller(0), 0, [2, 2, 2, 3, 4]);
  heal = keepBuildDice(heal, 0, [0, 1, 2, 3, 4], [], 6);
  assert.deepEqual(heal.hp, [22, 20]); assert.equal(heal.turn, 1);
  let shield = rollBuild(createDiceKiller(0), 0, [4, 4, 4, 4, 4]);
  shield = keepBuildDice(shield, 0, [0, 1, 2, 3, 4], []);
  assert.deepEqual(shield.hp, [20, 20]); assert.deepEqual(shield.shield, [5, 0]); assert.equal(shield.turn, 1);
});

test('an attack chains hits, deals authoritative damage and rejects stale turns', () => {
  let state = rollBuild(createDiceKiller(0), 0, [1, 1, 1, 1, 1]);
  state = keepBuildDice(state, 0, [0, 1, 2, 3, 4], []);
  assert.equal(state.attackValue, 6);
  state = rollAttack(state, 0, [6, 6, 2, 3, 4]);
  assert.equal(state.attackHits, 2); assert.equal(state.attackDice, 3);
  state = rollAttack(state, 0, [1, 2, 3]);
  assert.deepEqual(state.hp, [20, 5]); assert.equal(state.turn, 1); assert.equal(state.phase, 'BUILD');
  assert.throws(() => rollBuild(state, 0, [1, 1, 1, 1, 1]));
});

test('a shield absorbs damage, is consumed, and cannot exceed seven points', () => {
  let state = rollBuild(createDiceKiller(0), 0, [1, 1, 1, 1, 1]);
  state = keepBuildDice(state, 0, [0, 1, 2, 3, 4], []);
  state.shield[1] = 7;
  state = rollAttack(state, 0, [6, 6, 2, 3, 4]);
  state = rollAttack(state, 0, [1, 2, 3]);
  assert.deepEqual(state.hp, [20, 12]);
  assert.deepEqual(state.shield, [0, 0]);
  assert.equal(state.lastEvent.blocked, 7);
});

test('a total of 30 triggers an ultimate attack with doubled damage', () => {
  let state = rollBuild(createDiceKiller(0), 0, [6, 6, 6, 6, 6]);
  state = keepBuildDice(state, 0, [0, 1, 2, 3, 4], []);
  assert.equal(state.attackValue, 6);
  assert.equal(state.attackMultiplier, 2);
  state = rollAttack(state, 0, [6, 1, 2, 3, 4]);
  state = rollAttack(state, 0, [1, 2, 3, 4]);
  assert.equal(state.lastEvent.amount, 15);
  assert.deepEqual(state.hp, [20, 5]);
});

test('the public view is immutable, identifies the viewer and exposes the opponent dice', () => {
  const state = rollBuild(createDiceKiller(1), 1, [1, 2, 3, 4, 5]);
  const view = publicDiceKiller(state, 0);
  view.hp[0] = 1;
  assert.equal(state.hp[0], 20); assert.equal(view.side, 0);
  assert.deepEqual(view.roll, [1, 2, 3, 4, 5]);
  assert.deepEqual(view.lastEvent.dice, [1, 2, 3, 4, 5]);
  assert.deepEqual(view.displayDice[1], [1, 2, 3, 4, 5]);
});

test('the board keeps each player last visible dice between asynchronous turns', () => {
  let state = rollBuild(createDiceKiller(0), 0, [2, 2, 2, 3, 4]);
  state = keepBuildDice(state, 0, [0, 1, 2, 3, 4], []);
  state = rollBuild(state, 1, [6, 5, 4, 3, 2]);
  const view = publicDiceKiller(state, 1);
  assert.deepEqual(view.displayDice[0], [2, 2, 2, 3, 4]);
  assert.deepEqual(view.displayDice[1], [6, 5, 4, 3, 2]);
});

test('a player can forfeit at any time and the opponent wins', () => {
  const state = forfeitDiceKiller(createDiceKiller(0), 0);
  assert.equal(state.phase, 'FINISHED');
  assert.equal(state.winner, 1);
  assert.deepEqual(state.hp, [0, 20]);
  assert.throws(() => forfeitDiceKiller(state, 1));
});
