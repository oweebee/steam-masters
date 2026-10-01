/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const mod = { exports: {} };
new Function("exports", ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/studioLicenses.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod.exports);
const { groupStudioLicenses } = mod.exports;

test("a studio lists one license and keeps every platform version", () => {
  const games = [
    { id: "igdb-10-p19", name: "Metal Slug", platforms: ["Neo Geo CD"] },
    { id: "igdb-10-p80", name: "Metal Slug", platforms: ["Neo Geo AES"] },
    { id: "igdb-20-p7", name: "Samurai Shodown", platforms: ["PS1"] },
  ];
  const licenses = groupStudioLicenses(games);
  assert.equal(licenses.length, 2);
  assert.deepEqual(licenses[0].versions.map((game) => game.id), ["igdb-10-p19", "igdb-10-p80"]);
});

test("case, spaces and accents do not duplicate the same license", () => {
  const licenses = groupStudioLicenses([{ name: " Pokémon " }, { name: "pokemon" }, { name: "POKÉMON" }]);
  assert.equal(licenses.length, 1);
  assert.equal(licenses[0].versions.length, 3);
});
