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
const { cardDefense } = load('src/lib/cardDefense.ts');
const { atkFromReviewScore } = load('src/lib/cardAttack.ts');
const { rollAtkForRarity } = load('src/lib/rarityRoll.ts');
const { parseShopPriceRanges, randomShopPrice, shopRotationWindow } = load('src/lib/shopConfig.ts', { '@/lib/prisma': { prisma: {} } });
const { buildShopWatchNotifications } = load('src/lib/shopNotifications.ts');
const { notificationLink } = load('src/lib/notificationLinks.ts');
const { buildLeaderboard, LEADERBOARD_RARITY_POINTS } = load('src/lib/leaderboard.ts');
const { sanitizeSidebarOrder } = load('src/lib/sidebarOrder.ts');
const { combatAttack } = load('src/lib/battle.ts', { '@/lib/battleStake': {}, '@/lib/tradeExpiry': {} });
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
test('sidebar order keeps known routes once and rejects injected links', () => {
  assert.deepEqual(sanitizeSidebarOrder(['/magasin', '/evil', '/magasin', '/recompenses', '/classement']), ['/magasin', '/recompenses', '/classement']);
});
test('compact stats divide by ten and keep integers', () => {
  assert.equal(cardDefense(1), 5);
  assert.equal(cardDefense(10_000), 15);
  assert.equal(cardDefense(100_000_000), 25);
  assert.equal(combatAttack(0), 3);
  assert.equal(combatAttack(10), 8);
  assert.equal(atkFromReviewScore(97), 9);
  assert.equal(atkFromReviewScore(98), 10);
  assert.equal(atkFromReviewScore(99), 10);
  assert.equal(rollAtkForRarity('COMMON', 98), 10);
  for (const rarity of ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']) {
    const atk = rollAtkForRarity(rarity);
    assert.ok(Number.isInteger(atk) && atk >= 0 && atk <= 10);
  }
});
test('new draws never count player cards or active offers as rarity caps', () => {
  const boosterSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/app/api/booster/route.ts'), 'utf8');
  const shopSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/lib/shop.ts'), 'utf8');
  const raritySource = fs.readFileSync(path.resolve(__dirname, '..', 'src/lib/rarityRoll.ts'), 'utf8');
  assert.doesNotMatch(boosterSource, /card\.count|shopOffer\.count|RARITY_CAP|nextLowerRarity/);
  assert.doesNotMatch(shopSource, /card\.groupBy|rarityBySubject|RARITY_CAP/);
  assert.doesNotMatch(raritySource, /RARITY_CAP|nextLowerRarity/);
});
test('shop price ranges are complete, bounded and inclusive', () => {
  const valid = Object.fromEntries(['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'].map((rarity, index) => [rarity, { min: index + 1, max: index + 3 }]));
  assert.deepEqual(parseShopPriceRanges(JSON.stringify(valid)), valid);
  assert.equal(parseShopPriceRanges(JSON.stringify({ ...valid, COMMON: { min: 0, max: 3 } })), null);
  assert.equal(parseShopPriceRanges(JSON.stringify({ ...valid, EPIC: { min: 9, max: 8 } })), null);
  assert.equal(parseShopPriceRanges(JSON.stringify({ COMMON: valid.COMMON })), null);
  assert.equal(randomShopPrice({ min: 4, max: 8 }, () => 0), 4);
  assert.equal(randomShopPrice({ min: 4, max: 8 }, () => 0.999999), 8);
  const window = shopRotationWindow(new Date('2026-09-30T12:42:17.000Z'));
  assert.equal(window.startsAt.toISOString(), '2026-09-30T12:00:00.000Z');
  assert.equal(window.endsAt.toISOString(), '2026-09-30T13:00:00.000Z');
});
test('shop rotation notifies each matching card watcher', () => {
  const notifications = buildShopWatchNotifications(
    [{ offerId: 'offer-g1', subjectKey: 'GAME:g1', name: 'Half-Life', price: 125 }, { offerId: 'offer-s1', subjectKey: 'STUDIO:s1', name: 'Valve', price: 240 }],
    [{ userId: 'u1', gameId: 'g1', studioId: null }, { userId: 'u1', gameId: null, studioId: 's1' }, { userId: 'u2', gameId: 'g2', studioId: null }],
  );
  assert.equal(notifications.length, 2);
  assert.deepEqual(notifications.map((notification) => notification.userId), ['u1', 'u1']);
  assert.deepEqual(notifications.map((notification) => notification.link), ['/offre-magasin/offer-g1', '/offre-magasin/offer-s1']);
  assert.equal(notificationLink('/magasin?offre=ancienne-offre'), '/offre-magasin/ancienne-offre');
  assert.match(notifications[0].body, /125 gigapuissances/);
});
test('shop purchase can claim one global offer only once', async () => {
  let coins = 10; let purchasedAt = null; const cards = [];
  const offer = { id: 'offer-1', price: 6, rarity: 'RARE', atk: 9, gameId: 'game-1', studioId: null, purchasedAt, rotation: { endsAt: new Date(Date.now() + 60_000) } };
  const tx = {
    shopOffer: {
      findUnique: async () => ({ ...offer, purchasedAt }),
      updateMany: async () => purchasedAt ? { count: 0 } : (purchasedAt = new Date(), { count: 1 }),
    },
    user: {
      updateMany: async () => coins >= offer.price ? (coins -= offer.price, { count: 1 }) : { count: 0 },
      findUniqueOrThrow: async () => ({ coins }),
    },
    card: { create: async ({ data }) => (cards.push(data), { id: 'card-1' }) },
  };
  const route = load('src/app/api/magasin/[id]/buy/route.ts', {
    '@/auth': { auth: async () => ({ user: { id: 'user-1' } }) },
    '@/lib/prisma': { prisma: { $transaction: async (fn) => fn(tx) } },
  });
  const context = { params: Promise.resolve({ id: 'offer-1' }) };
  const first = await route.POST(new Request('http://local', { method: 'POST' }), context);
  assert.equal(first.status, 200); assert.equal(coins, 4); assert.equal(cards.length, 1);
  const second = await route.POST(new Request('http://local', { method: 'POST' }), context);
  assert.equal(second.status, 400); assert.equal(coins, 4); assert.equal(cards.length, 1);
});
test('discarding cards pays three coins per instance', async () => {
  let increment = 0;
  const tx = {
    card: {
      findMany: async () => [{ id: 'card-1' }, { id: 'card-2' }],
      deleteMany: async () => ({ count: 2 }),
    },
    tradeCard: { count: async () => 0, deleteMany: async () => ({ count: 0 }) },
    auction: { count: async () => 0 },
    user: { update: async ({ data }) => (increment = data.coins.increment, { coins: 106 }) },
  };
  const route = load('src/app/api/collection/sell/route.ts', {
    '@/auth': { auth: async () => ({ user: { id: 'user-1' } }) },
    '@/lib/prisma': { prisma: { $transaction: async (fn) => fn(tx) } },
    '@/lib/battleStake': { stakedCardCount: async () => 0, activeDeckCardCount: async () => 0 },
    '@/lib/tradeExpiry': { activeTradeWhere: () => ({}) },
  });
  const response = await route.POST(new Request('http://local', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardIds: ['card-1', 'card-2'] }) }));
  assert.equal(response.status, 200); assert.equal((await response.json()).earned, 6); assert.equal(increment, 6);
});
test('leaderboard uses the increased rarity scale and stable tied ranks', () => {
  assert.deepEqual(LEADERBOARD_RARITY_POINTS, { COMMON: 10, UNCOMMON: 30, RARE: 80, EPIC: 200, LEGENDARY: 500 });
  const cards = Object.keys(LEADERBOARD_RARITY_POINTS).map((rarity, index) => ({ rarity, gameId: `g${index}`, studioId: null }));
  const entries = buildLeaderboard([{ id: 'b', username: 'Zoé', cards }, { id: 'a', username: 'Alice', cards }], [], []);
  assert.equal(entries[0].score, 1820);
  assert.equal(entries[0].rank, 1);
  assert.equal(entries[1].rank, 1);
  assert.deepEqual(entries.map((entry) => entry.username), ['Alice', 'Zoé']);
});
test('leaderboard platform collection rewards one third, two thirds and completion progressively', () => {
  const games = ['pc', 'ps', 'xbox'].map((platform, index) => ({ id: `p${index}`, name: 'Voyager', contentType: 'GAME', source: 'IGDB', parentGameId: null, dlcAppIds: [], platforms: [platform], developers: ['Maker'] }));
  const users = [1, 2, 3].map((owned) => ({ id: `u${owned}`, username: `P${owned}`, cards: games.slice(0, owned).map((row) => ({ rarity: 'COMMON', gameId: row.id, studioId: null })) }));
  const entries = buildLeaderboard(users, games, []);
  const multipliers = Object.fromEntries(entries.map((entry) => [entry.id, entry.bonuses.find((bonus) => bonus.label.toLocaleLowerCase('fr').includes('multiplateforme')).multiplier]));
  assert.deepEqual(multipliers, { u3: 1.5, u2: 1.3, u1: 1.15 });
});
test('leaderboard DLC and studio progress expose gauges and next thresholds', () => {
  const base = (id, name, extra = {}) => ({ id, name, contentType: 'GAME', source: 'STEAM', parentGameId: null, dlcAppIds: [], platforms: ['PC'], developers: ['Atelier'], ...extra });
  const games = [base('main', 'Saga', { dlcAppIds: ['d1', 'd2', 'd3'] }), base('d1', 'Saga DLC 1', { contentType: 'DLC', parentGameId: 'main' }), base('d2', 'Saga DLC 2', { contentType: 'DLC', parentGameId: 'main' }), base('d3', 'Saga DLC 3', { contentType: 'DLC', parentGameId: 'main' }), base('other-1', 'Other 1'), base('other-2', 'Other 2')];
  const cards = [{ rarity: 'COMMON', gameId: 'main', studioId: null }, { rarity: 'COMMON', gameId: 'd1', studioId: null }];
  const entry = buildLeaderboard([{ id: 'u', username: 'Player', cards }], games, [{ id: 's', name: 'Atelier' }])[0];
  const dlc = entry.bonuses.find((bonus) => bonus.label.includes('DLC'));
  const studioProgress = entry.bonuses.find((bonus) => bonus.label === 'Progression studio');
  assert.equal(dlc.multiplier, 1.15); assert.deepEqual(dlc.progress, { current: 1, total: 3, next: 2 });
  assert.equal(studioProgress.multiplier, 1.25); assert.deepEqual(studioProgress.progress, { current: 1, total: 3, next: 2 });
});
test('leaderboard GP rewards reject trivial goals and reserve intermediate stages for deep catalogs', () => {
  const tinyGames = [{ id: 'tiny', name: 'Tiny', contentType: 'GAME', source: 'IGDB', parentGameId: null, dlcAppIds: [], platforms: ['pc'], developers: ['Solo'] }];
  const tinyCards = [{ rarity: 'COMMON', gameId: 'tiny', studioId: null }, { rarity: 'COMMON', gameId: null, studioId: 'solo' }];
  const tiny = buildLeaderboard([{ id: 'u', username: 'Tiny', cards: tinyCards }], tinyGames, [{ id: 'solo', name: 'Solo' }])[0];
  assert.equal(tiny.rewards.some((reward) => reward.key.startsWith('platform:')), false);
  assert.equal(tiny.rewards.some((reward) => reward.key.startsWith('studio:solo:')), false);
  assert.equal(tiny.rewards.find((reward) => reward.key === 'studio-card:solo').coins, 50);

  const games = ['a', 'b', 'c'].map((id) => ({ id, name: `Game ${id}`, contentType: 'GAME', source: 'IGDB', parentGameId: null, dlcAppIds: [], platforms: ['pc'], developers: ['Trio'] }));
  const full = buildLeaderboard([{ id: 'f', username: 'Full', cards: games.map((game) => ({ rarity: 'COMMON', gameId: game.id, studioId: null })) }], games, [{ id: 'trio', name: 'Trio' }])[0];
  assert.deepEqual(full.rewards.filter((reward) => reward.key.startsWith('studio:trio:')).map((reward) => reward.coins), [120]);
  assert.ok(full.rewards.every((reward) => reward.coins >= 20 && reward.coins <= 5000));
});
test('leaderboard indexes a large catalog once instead of rescanning it per player', () => {
  const mainCount = 1500;
  const studios = Array.from({ length: 30 }, (_, index) => ({ id: `studio-${index}`, name: `Studio ${index}` }));
  const games = [];
  for (let index = 0; index < mainCount; index += 1) {
    const developer = studios[index % studios.length].name;
    games.push({ id: `main-${index}`, name: `Game ${index}`, contentType: 'GAME', source: 'STEAM', parentGameId: null, dlcAppIds: [`dlc-${index}`], platforms: ['PC'], developers: [developer] });
    games.push({ id: `dlc-${index}`, name: `Game ${index} DLC`, contentType: 'DLC', source: 'STEAM', parentGameId: `main-${index}`, dlcAppIds: [], platforms: ['PC'], developers: [developer] });
  }
  const users = Array.from({ length: 15 }, (_, userIndex) => ({
    id: `load-user-${userIndex}`,
    username: `Load ${userIndex}`,
    cards: Array.from({ length: 80 }, (_, cardIndex) => ({ rarity: 'COMMON', gameId: `${cardIndex % 2 ? 'dlc' : 'main'}-${cardIndex}`, studioId: null })),
  }));
  const startedAt = performance.now();
  const entries = buildLeaderboard(users, games, studios);
  const duration = performance.now() - startedAt;
  assert.equal(entries.length, users.length);
  assert.ok(duration < 1500, `large leaderboard took ${Math.round(duration)}ms`);
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
test('IGDB coherence scope excludes unrelated Steam studio issues', async () => {
  const f = fixture({ games: [
    game('steam-1', { source: 'STEAM', developers: ['Studio Steam'] }),
    game('igdb-1', { source: 'IGDB', developers: ['Studio IGDB'] }),
  ], studios: [
    studio(['Titre Steam absent'], { id: 'steam-studio', name: 'Studio Steam' }),
    studio(['Titre IGDB absent'], { id: 'igdb-studio', name: 'Studio IGDB' }),
  ] });
  const report = await f.service.getCoherenceReport('IGDB');
  assert.ok(report.issues.length >= 1);
  assert.ok(report.issues.every((issue) => issue.method !== 'STEAM'));
  assert.ok(report.issues.every((issue) => issue.sourceName !== 'Studio Steam'));
  assert.equal(report.counts.studios, 1);
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
    await db.bugReportMessage.deleteMany();
    await db.bugReport.deleteMany();
    await db.tradeCard.deleteMany();
    await db.trade.deleteMany();
    await db.steamGame.deleteMany();
    await db.studio.deleteMany();
    await db.appSetting.deleteMany();
    await db.user.deleteMany({ where: { id: { startsWith: 'test-user-' } } });
    await db.user.createMany({ data: [1, 2].map((id) => ({ id: `test-user-${id}`, username: `Test ${id}`, email: `test${id}@example.invalid`, password: 'not-a-real-login', status: 'ACTIVE' })) });
    const base = { description: 'test', headerImage: '/test.png', atk: 9, def: 15, rarity: 'COMMON', tags: [], developers: ['Test Studio'], reviewScore: 90, peakCcu: 1, ownerEstimate: 10000 };
    await db.steamGame.create({ data: { ...base, id: '901', name: 'Test Game', dlcAppIds: ['902', '999'] } });
    await db.steamGame.create({ data: { ...base, id: '902', name: 'Test DLC', contentType: 'DLC', developers: [] } });
    await db.studio.create({ data: { id: 'test-studio', name: 'Test Studio', games: [], atk: 9, def: 15, rarity: 'COMMON' } });
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
