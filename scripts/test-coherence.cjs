// Isolated regression tests: no live database, Redis, Steam or player data.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(relative, mocks = {}) {
  const file = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`, mocks);
    if (name.startsWith('.')) return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), `${name}.ts`)), mocks);
    return require(name);
  };
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  return module.exports;
}
const core = load('src/lib/catalogCoherenceCore.ts');
const game = (id, extra = {}) => ({ id, name: `Game ${id}`, contentType: 'GAME', developers: ['Studio'], dlcAppIds: [], parentGameId: null, reviewScore: 90, ownerEstimate: 10000, ...extra });
const studio = (games = ['Game 1'], extra = {}) => ({ id: 's1', name: 'Studio', games, ...extra });
function fixture(input) {
  const state = structuredClone(input);
  const settings = new Map();
  const writes = [];
  const db = {
    $queryRaw: async () => [],
    $transaction: async (fn) => fn(db),
    steamGame: { findMany: async () => structuredClone(state.games), update: async ({ where, data }) => { writes.push(['game', where.id]); Object.assign(state.games.find((g) => g.id === where.id), structuredClone(data)); } },
    studio: { findMany: async () => structuredClone(state.studios), update: async ({ where, data }) => { writes.push(['studio', where.id]); Object.assign(state.studios.find((s) => s.id === where.id), structuredClone(data)); }, create: async ({ data }) => { const row = { id: `s${state.studios.length + 1}`, ...data }; state.studios.push(row); writes.push(['create-studio']); return row; } },
    appSetting: { findMany: async () => [...settings.entries()].map(([key, value]) => ({ key, value })), upsert: async ({ where, update }) => { settings.set(where.key, update.value); writes.push(['setting']); } },
  };
  return { state, writes, settings, service: load('src/lib/catalogCoherence.ts', { '@/lib/prisma': { prisma: db } }) };
}
test('healthy GAME/STUDIO/DLC graph has no issue', () => {
  const snapshot = { games: [game('1', { dlcAppIds: ['2'] }), game('2', { contentType: 'DLC', parentGameId: '1' })], studios: [studio()] };
  assert.deepEqual(core.analyzeCoherence(snapshot), []);
});
test('all five controls detect missing references from stored data', () => {
  const issues = core.analyzeCoherence({ games: [game('1', { developers: ['Absent'], dlcAppIds: ['9'] }), game('2', { contentType: 'DLC', developers: [], parentGameId: null })], studios: [studio(['Unknown Game'])] });
  assert.deepEqual(new Set(issues.map((i) => i.relation)), new Set(['GAME_STUDIO', 'STUDIO_GAME', 'DLC_PARENT', 'DLC_STUDIO', 'GAME_DLC']));
});
test('duplicate game names are blocked; no arbitrary AppID', () => {
  const issues = core.analyzeCoherence({ games: [game('1', { name: 'Same', developers: [] }), game('2', { name: 'Same', developers: [] })], studios: [studio(['Same'])] });
  const issue = issues.find((i) => i.relation === 'STUDIO_GAME');
  assert.equal(issue.method, 'BLOCKED'); assert.equal(issue.repair, undefined);
});
test('two possible parents are blocked', () => {
  const issues = core.analyzeCoherence({ games: [game('1', { dlcAppIds: ['3'] }), game('2', { dlcAppIds: ['3'] }), game('3', { contentType: 'DLC' })], studios: [studio(['Game 1', 'Game 2'])] });
  assert.equal(issues.find((i) => i.relation === 'DLC_PARENT').method, 'BLOCKED');
});
test('existing conflicting parent requires Steam verification', () => {
  const issues = core.analyzeCoherence({ games: [game('1', { dlcAppIds: ['3'] }), game('2', { dlcAppIds: ['3'] }), game('3', { contentType: 'DLC', parentGameId: '2' })], studios: [studio(['Game 1', 'Game 2'])] });
  assert.equal(issues.find((i) => i.relation === 'GAME_DLC' && i.sourceId === '1').method, 'STEAM');
});
test('local repair handles orphan parent, inherited studio and reverse links; idempotent', async () => {
  const f = fixture({ games: [game('1', { dlcAppIds: ['2'] }), game('2', { contentType: 'DLC', developers: [] })], studios: [studio([])] });
  const result = await f.service.repairCoherenceLocally();
  assert.ok(result.links >= 3); assert.equal(result.created, 0);
  assert.deepEqual(core.analyzeCoherence(f.state), []);
  assert.equal((await f.service.repairCoherenceLocally()).links, 0);
});
test('repair links an existing game from Studio evidence', async () => {
  const f = fixture({ games: [game('1', { developers: [] })], studios: [studio()] });
  await f.service.repairCoherenceLocally();
  assert.deepEqual(f.state.games[0].developers, ['Studio']);
});
test('repair reverse DLC list without losing existing missing declarations', async () => {
  const f = fixture({ games: [game('1', { dlcAppIds: ['99'] }), game('2', { contentType: 'DLC', parentGameId: '1' })], studios: [studio()] });
  await f.service.repairCoherenceLocally();
  assert.deepEqual(f.state.games[0].dlcAppIds, ['99', '2']);
});
test('scan reads only local data and never writes', async () => {
  const f = fixture({ games: [game('1')], studios: [studio()] });
  const original = global.fetch;
  global.fetch = () => { throw new Error('NETWORK FORBIDDEN'); };
  try { assert.equal((await f.service.getCoherenceReport()).steamRequests, 0); assert.deepEqual(f.writes, []); }
  finally { global.fetch = original; }
});
test('dismissed links stay suppressed after rescan and local repair', async () => {
  const f = fixture({ games: [game('1')], studios: [studio([])] });
  const issue = (await f.service.getCoherenceReport()).issues[0];
  await f.service.dismissCoherenceIssues([issue.key]);
  assert.equal((await f.service.repairCoherenceLocally()).links, 0);
  assert.equal((await f.service.getCoherenceReport()).issues.length, 0);
  assert.deepEqual(f.state.studios[0].games, []);
  assert.equal(core.studioGameIsIgnored(f.state.studios[0], f.state.games[0], await f.service.readCoherenceRegistry()), true);
});
test('missing Studio game stays retired when later imported', async () => {
  const f = fixture({ games: [], studios: [studio()] });
  await f.service.dismissCoherenceIssues([(await f.service.getCoherenceReport()).issues[0].key]);
  f.state.games.push(game('1', { developers: ['Other'] }));
  const issues = (await f.service.getCoherenceReport()).issues;
  assert.equal(issues.some((i) => i.relation === 'STUDIO_GAME'), false);
});
test('a failed import remains red across scans, then disappears when validated', async () => {
  const f = fixture({ games: [game('1', { dlcAppIds: ['2'] })], studios: [studio()] });
  const issue = (await f.service.getCoherenceReport()).issues[0];
  await f.service.rememberCoherenceFailure(issue, 'Steam HTTP 429');
  assert.equal((await f.service.getCoherenceReport()).issues[0].failureReason, 'Steam HTTP 429');
  f.state.games.push(game('2', { contentType: 'DLC', parentGameId: '1' }));
  assert.equal((await f.service.getCoherenceReport()).issues.length, 0);
});
test('studio names containing commas are never split', async () => {
  const f = fixture({ games: [game('1', { developers: ['ACME, Inc.'] })], studios: [] });
  const keys = (await f.service.getCoherenceReport()).issues.map((i) => i.key);
  assert.equal((await f.service.repairCoherenceLocally(keys, true)).created, 1);
  assert.equal(f.state.studios[0].name, 'ACME, Inc.');
});
test('corrupt tombstones are not silently discarded', async () => {
  const f = fixture({ games: [], studios: [] });
  f.settings.set('CATALOG_COHERENCE_IGNORED', 'invalid');
  await assert.rejects(() => f.service.repairCoherenceLocally());
  assert.deepEqual(f.writes, []);
});
test('Bug Report validates lengths and forbids external or secret-bearing paths', () => {
  const { newReport, publicReportSelect } = load('src/lib/bugReports.ts');
  const base = { requestId: '71ed2308-336b-4fef-964d-252f888b9caa', title: 'Bug échange', description: 'Le bouton reste bloqué.', pagePath: '/echanges' };
  assert.equal(newReport.safeParse(base).success, true);
  for (const pagePath of ['https://evil.test', '//evil.test', '/?token=secret']) assert.equal(newReport.safeParse({ ...base, pagePath }).success, false);
  assert.equal(Object.hasOwn(publicReportSelect, 'adminNote'), false);
  assert.equal(newReport.safeParse({ ...base, description: 'x'.repeat(5001) }).success, false);
});
test('coherence admin routes reject ordinary users before any DB access', async () => {
  const route = load('src/app/api/admin/coherence/route.ts', { '@/auth': { auth: async () => ({ user: { id: 'u1', role: 'USER' } }) }, '@/lib/catalogCoherence': {}, '@/lib/appLog': {} });
  assert.equal((await route.GET()).status, 403);
  assert.equal((await route.POST(new Request('http://local', { method: 'POST', body: '{}' }))).status, 403);
});
test('exchanges reject malformed JSON and invalid money without DB writes', async () => {
  const route = load('src/app/api/echanges/route.ts', { '@/auth': { auth: async () => ({ user: { id: 'u1' } }) }, '@/lib/prisma': { prisma: {} }, '@/lib/tradeExpiry': {}, '@/lib/appLog': {} });
  for (const body of ['broken', JSON.stringify({ toUserId: 'u2', offerCoins: 2.5 }), JSON.stringify({ toUserId: 'u2', wantCoins: -1 })]) assert.equal((await route.POST(new Request('http://local', { method: 'POST', body }))).status, 400);
});

if (process.env.COHERENCE_TEST_DATABASE_URL) test('real PostgreSQL: repairs, archives, private reports, MCP view and exchange idempotency', async () => {
  const url = new URL(process.env.COHERENCE_TEST_DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/steammasters_test', 'Only the isolated local test database is allowed');
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const auth = { auth: async () => ({ user: { id: 'test-user-1', role: 'USER' } }) };
  const logs = { writeAppLog: async () => {} };
  const mocks = { '@/lib/prisma': { prisma: db }, '@/auth': auth, '@/lib/appLog': logs };
  const request = (body, method = 'POST') => new Request('http://local', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    await db.user.createMany({ data: [1, 2].map((id) => ({ id: `test-user-${id}`, username: `Test ${id}`, email: `test${id}@example.invalid`, password: 'not-a-real-login', status: 'ACTIVE' })) });
    const base = { description: 'test', headerImage: '/test.png', atk: 90, def: 100, rarity: 'COMMON', tags: [], developers: ['Test Studio'], reviewScore: 90, peakCcu: 1, ownerEstimate: 10000 };
    await db.steamGame.create({ data: { ...base, id: '901', name: 'Test Game', dlcAppIds: ['902', '999'] } });
    await db.steamGame.create({ data: { ...base, id: '902', name: 'Test DLC', contentType: 'DLC', developers: [] } });
    await db.studio.create({ data: { id: 'test-studio', name: 'Test Studio', games: [], atk: 90, def: 100, rarity: 'COMMON' } });
    const service = load('src/lib/catalogCoherence.ts', mocks);
    assert.ok((await service.repairCoherenceLocally()).links >= 3);
    assert.equal((await db.steamGame.findUnique({ where: { id: '902' } })).parentGameId, '901');
    const issue = (await service.getCoherenceReport()).issues.find((i) => i.targetId === '999');
    await service.rememberCoherenceFailure(issue, 'Known test failure');
    assert.equal((await service.getCoherenceReport()).issues.find((i) => i.key === issue.key).status, 'FAILED');
    await service.dismissCoherenceIssues([issue.key]);
    assert.equal((await service.getCoherenceReport()).issues.some((i) => i.key === issue.key), false);
    assert.equal((await service.repairCoherenceLocally()).links, 0);
    const reports = load('src/app/api/bug-reports/route.ts', mocks);
    const payload = { requestId: crypto.randomUUID(), title: 'Test bug report', description: 'Le bouton reste bloqué.', pagePath: '/echanges' };
    const first = await reports.POST(request(payload)); assert.equal(first.status, 201);
    const report = await first.json();
    assert.equal((await (await reports.POST(request(payload))).json()).id, report.id);
    const adminRoute = load('src/app/api/admin/bug-reports/route.ts', { ...mocks, '@/auth': { auth: async () => ({ user: { id: 'test-user-2', role: 'ADMIN' } }) } });
    const patch = { id: report.id, updatedAt: report.updatedAt, status: 'IN_PROGRESS', adminNote: 'Private test note', adminReply: 'Investigation en cours.' };
    assert.equal((await adminRoute.PATCH(request(patch, 'PATCH'))).status, 200);
    assert.equal((await adminRoute.PATCH(request(patch, 'PATCH'))).status, 409);
    const personal = (await (await reports.GET()).json()).reports[0];
    assert.equal(personal.adminReply, patch.adminReply); assert.equal(Object.hasOwn(personal, 'adminNote'), false);
    const otherReports = load('src/app/api/bug-reports/route.ts', { ...mocks, '@/auth': { auth: async () => ({ user: { id: 'test-user-2' } }) } });
    assert.equal((await (await otherReports.GET()).json()).reports.length, 0);
    const view = await db.$queryRaw`SELECT "username", "adminNote" FROM "AdminBugInbox" WHERE "id" = ${report.id}`;
    assert.equal(view[0].username, 'Test 1'); assert.equal(view[0].adminNote, patch.adminNote);
    const exchanges = load('src/app/api/echanges/route.ts', mocks);
    const tradeInput = { toUserId: 'test-user-2', offerCoins: 1, requestId: crypto.randomUUID() };
    const tradeResponse = await exchanges.POST(request(tradeInput)); assert.equal(tradeResponse.status, 200);
    const trade = await tradeResponse.json();
    const repeated = await (await exchanges.POST(request(tradeInput))).json();
    assert.equal(repeated.id, trade.id); assert.equal(await db.trade.count({ where: { requestId: tradeInput.requestId } }), 1);
    assert.equal((await db.user.findUnique({ where: { id: 'test-user-1' } })).coins, 100, 'Creation must not transfer money');
  } finally { await db.$disconnect(); }
});
