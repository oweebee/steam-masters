const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const moduleBox = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/diceKiller.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(moduleBox.exports);
const { createDiceKiller, rollBuild, keepBuildDice, rollAttack, publicDiceKiller } = moduleBox.exports;

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

test('scores 11-17 heal, 18-23 hurt and pass the turn', () => {
  let heal = rollBuild(createDiceKiller(0), 0, [2, 2, 2, 3, 4]);
  heal = keepBuildDice(heal, 0, [0, 1, 2, 3, 4], [], 6);
  assert.deepEqual(heal.hp, [32, 30]); assert.equal(heal.turn, 1);
  let hurt = rollBuild(createDiceKiller(0), 0, [4, 4, 4, 4, 4]);
  hurt = keepBuildDice(hurt, 0, [0, 1, 2, 3, 4], []);
  assert.deepEqual(hurt.hp, [26, 30]); assert.equal(hurt.turn, 1);
});

test('an attack chains hits, deals authoritative damage and rejects stale turns', () => {
  let state = rollBuild(createDiceKiller(0), 0, [1, 1, 1, 1, 1]);
  state = keepBuildDice(state, 0, [0, 1, 2, 3, 4], []);
  assert.equal(state.attackValue, 6);
  state = rollAttack(state, 0, [6, 6, 2, 3, 4]);
  assert.equal(state.attackHits, 2); assert.equal(state.attackDice, 3);
  state = rollAttack(state, 0, [1, 2, 3]);
  assert.deepEqual(state.hp, [30, 18]); assert.equal(state.turn, 1); assert.equal(state.phase, 'BUILD');
  assert.throws(() => rollBuild(state, 0, [1, 1, 1, 1, 1]));
});

test('the public view is immutable, identifies the viewer and exposes the opponent dice', () => {
  const state = rollBuild(createDiceKiller(1), 1, [1, 2, 3, 4, 5]);
  const view = publicDiceKiller(state, 0);
  view.hp[0] = 1;
  assert.equal(state.hp[0], 30); assert.equal(view.side, 0);
  assert.deepEqual(view.roll, [1, 2, 3, 4, 5]);
  assert.deepEqual(view.lastEvent.dice, [1, 2, 3, 4, 5]);
});
