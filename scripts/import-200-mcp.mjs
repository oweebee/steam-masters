// Import ponctuel du catalogue par le MCP PostgreSQL. Aucun secret n'est écrit ici.
// Exécution : node scripts/import-200-mcp.mjs --execute
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const TARGET = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 200);
if (!Number.isInteger(TARGET) || TARGET < 1 || TARGET > 200) throw new Error("--limit doit être entre 1 et 200");
const EXECUTE = process.argv.includes("--execute");
const FRANCHISE_MODE = process.argv.includes("--franchises");
const cardDefense = (owners) => Math.max(50, Math.min(250, Math.round(50 + 25 * Math.log10(Math.max(1, owners)))));
const MCP_URL = "https://steammasters-mcp.obsidianspoon.com";
const context = readFileSync("CONTEXT.md", "utf8");
const password = context.match(/SteamMCP[0-9]+!/)?.[0];
if (!password) throw new Error("Accès MCP absent de CONTEXT.md");
const auth = `Basic ${Buffer.from(`mcp:${password}`).toString("base64")}`;
let nextId = 1;
let endpoint;
let endpointResolve;
const endpointReady = new Promise((resolve) => { endpointResolve = resolve; });
const pending = new Map();
const curl = spawn("curl.exe", ["--silent", "--show-error", "--no-buffer", "--max-time", "1800", "-K", "-", `${MCP_URL}/sse`], { stdio: ["pipe", "pipe", "pipe"] });
curl.stdin.end(`header = "Authorization: ${auth}"\nheader = "Accept: text/event-stream"\n`);
let buffer = "";
curl.stdout.setEncoding("utf8");
curl.stdout.on("data", (chunk) => {
  buffer += chunk.replaceAll("\r", "");
  let boundary;
  while ((boundary = buffer.indexOf("\n\n")) !== -1) {
    const event = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    const type = event.match(/^event: (.+)$/m)?.[1];
    const data = event.match(/^data: (.+)$/m)?.[1];
    if (type === "endpoint" && data) { endpoint = new URL(data, MCP_URL).toString(); endpointResolve(); }
    if (type === "message" && data) {
      const message = JSON.parse(data);
      const waiting = pending.get(message.id);
      if (waiting) { pending.delete(message.id); message.error ? waiting.reject(new Error(JSON.stringify(message.error))) : waiting.resolve(message.result); }
    }
  }
});
curl.stderr.on("data", (chunk) => process.stderr.write(`MCP SSE: ${chunk}`));
curl.on("exit", (code) => {
  for (const waiting of pending.values()) waiting.reject(new Error(`Flux MCP fermé (${code})`));
  pending.clear();
});

async function rpc(method, params = {}, notification = false) {
  await endpointReady;
  const id = notification ? undefined : nextId++;
  const message = { jsonrpc: "2.0", ...(id ? { id } : {}), method, params };
  const result = id ? new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP ${method} sans réponse`)); }, 120_000);
    pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
  }) : null;
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(message), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`MCP POST ${response.status}`);
  return result;
}

async function sql(statement) {
  const result = await rpc("tools/call", { name: "execute_sql", arguments: { sql: statement } });
  if (result?.isError) throw new Error(result.content?.map((item) => item.text).join("\n") || "Erreur SQL MCP");
  return result?.content?.[0]?.text ?? "";
}

async function rows(statement) {
  const wrapped = `SELECT encode(convert_to(COALESCE(json_agg(t)::text, '[]'), 'UTF8'), 'base64') AS payload FROM (${statement}) t`;
  const response = await sql(wrapped);
  const encoded = response.match(/['"]payload['"]:\s*['"]([^'"]+)['"]/)?.[1]?.replaceAll("\\n", "").replaceAll("\n", "");
  if (!encoded) throw new Error(`Réponse MCP illisible : ${response.slice(0, 200)}`);
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
}

function literal(value) {
  if (value == null) return "NULL";
  return `'${String(value).replaceAll("\u0000", "").replaceAll("'", "''")}'`;
}
function array(values) { return `ARRAY[${values.map(literal).join(",")}]::text[]`; }
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url, kind = "json") {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "SteamMasters/1.0 catalog-import" }, signal: AbortSignal.timeout(15_000) });
      if (response.status === 429 || response.status >= 500) { await pause(1500 * (attempt + 1)); continue; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return kind === "bytes" ? response : response.json();
    } catch (error) {
      if (attempt === 3) throw error;
      await pause(1200 * (attempt + 1));
    }
  }
  throw new Error("Source indisponible");
}

function ownersFromRange(range) {
  const [lo, hi] = String(range ?? "").split("..").map((part) => Number(part.replaceAll(/[,.\s]/g, "")));
  return Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo ? Math.round((lo + hi) / 2) : 0;
}
const asianTitle = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u;
const nonGameEdition = /\b(test server|playtest|demo|dedicated server|soundtrack|prologue|teaser|trial|beta)\b/i;
// Grands univers demandés par l'utilisateur. Les noms restent de simples
// critères de recherche : Steam Store + SteamSpy valident chaque fiche importée.
const franchisePatterns = [
  /tomb raider/i, /alan wake/i, /borderlands/i, /fallout/i,
  /bio\s*shock/i, /elder scrolls|skyrim/i, /dishonored/i, /^doom(?:$|\s+(?:ii|iii|3|64|eternal|vfr|classic|the dark ages)\b|:\s*the dark ages)|^final doom$|^master levels for doom/i,
  /wolfenstein/i, /assassin.s creed/i, /far cry/i, /resident evil/i,
  /devil may cry/i, /\bhitman\b/i, /^metro (?:2033|last light|exodus|awakening|redux)/i, /mass effect/i,
  /dragon age/i, /dead space/i, /\bhalo\b/i, /gears of war/i,
  /batman.*arkham/i, /the witcher/i, /cyberpunk 2077/i, /just cause/i,
  /saints row/i, /watch.dogs/i, /splinter cell/i, /prince of persia/i,
  /red dead/i, /grand theft auto/i, /max payne/i, /quantum break/i,
  /star wars/i, /\blego\b/i, /^uncharted[™:]|^uncharted\s+legacy/i, /god of war/i, /horizon.*(zero dawn|forbidden west)/i,
  /^dark souls|^elden ring|^sekiro/i, /^f\.e\.a\.r\./i, /^unreal tournament/i,
  /^crysis/i, /^call of duty/i, /^red faction/i, /^rayman/i,
  /^castlevania/i, /^street fighter/i, /final fantasy/i,
  /^danganronpa/i, /^zero escape/i, /^dynasty warriors/i,
  /^one piece/i, /^naruto/i, /^dead or alive/i, /^nba 2k/i, /^wwe 2k/i,
  /^grid\b/i, /^dirt\b/i,
];
const matchesFranchise = (name) => franchisePatterns.some((pattern) => pattern.test(name ?? ""));
const normalizedStudio = (name) => String(name ?? "").trim().toLocaleLowerCase("en");

async function gameFromSteam(appid) {
  const [store, reviews, ccu, spy] = await Promise.all([
    get(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=fr&l=french`),
    get(`https://store.steampowered.com/appreviews/${appid}?json=1&language=all&purchase_type=all`).catch(() => null),
    get(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`).catch(() => null),
    get(`https://steamspy.com/api.php?request=appdetails&appid=${appid}`),
  ]);
  const details = store?.[appid]?.success ? store[appid].data : null;
  if (!details || details.type !== "game" || !details.header_image?.startsWith("https://") || !details.developers?.length || asianTitle.test(details.name) || nonGameEdition.test(details.name)) return null;
  if ((details.genres ?? []).some((genre) => /utilit|software|logiciel|production|design|animation/i.test(genre.description ?? ""))) return null;
  const owners = ownersFromRange(spy?.owners);
  if (owners <= 0) return null;
  const imageResponse = await get(details.header_image, "bytes");
  const mime = imageResponse.headers.get("content-type")?.split(";")[0]?.toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(mime)) return null;
  const image = Buffer.from(await imageResponse.arrayBuffer());
  if (image.length === 0 || image.length > 3 * 1024 * 1024) return null;
  const summary = reviews?.query_summary;
  const score = summary?.total_reviews ? Math.round(summary.total_positive / summary.total_reviews * 100) : 0;
  return {
    id: String(appid), name: details.name, description: details.short_description ?? "",
    image, imageUrl: details.header_image, mime, score, ccu: Math.max(0, Number(ccu?.response?.player_count) || 0),
    owners, tags: (details.genres ?? []).map((genre) => genre.description),
    developers: details.developers.map((name) => name.trim()).filter(Boolean),
    price: details.price_overview?.final ?? null, free: !!details.is_free,
  };
}

function importSql(games) {
  const images = games.map((game) => `(${literal(`game:${game.id}`)}, decode('${game.image.toString("base64")}', 'base64'), ${literal(game.mime)}, ${literal(game.imageUrl)}, now(), now())`).join(",\n");
  const values = games.map((game) => `(${literal(game.id)},${literal(game.name)},${literal(game.description)},${literal(`/api/images/game/${game.id}`)},${game.score},${game.ccu},${game.owners},'COMMON'::"Rarity",${game.score},${cardDefense(game.owners)},${array(game.tags)},${array(game.developers)},${game.price == null ? "NULL" : Number(game.price)},${game.free},now())`).join(",\n");
  const names = [...new Set(games.flatMap((game) => game.developers))];
  const studioNames = names.map((name) => `(${literal(name)})`).join(",");
  return `DO $import$ BEGIN
    INSERT INTO "StoredImage" (key,data,"mimeType","sourceUrl","createdAt","updatedAt") VALUES ${images}
      ON CONFLICT (key) DO UPDATE SET data=EXCLUDED.data,"mimeType"=EXCLUDED."mimeType","sourceUrl"=EXCLUDED."sourceUrl","updatedAt"=now();
    INSERT INTO "SteamGame" (id,name,description,"headerImage","reviewScore","peakCcu","ownerEstimate",rarity,atk,def,tags,developers,"priceCents","isFree","updatedAt") VALUES ${values}
      ON CONFLICT (id) DO NOTHING;
    WITH names(name) AS (VALUES ${studioNames}), agg AS (
      SELECT names.name, COUNT(*)::integer AS game_count, ROUND(AVG(game."reviewScore"))::integer AS avg_score,
        SUM(game."ownerEstimate")::integer AS owners, array_agg(game.name ORDER BY game.name) AS games
      FROM names JOIN "SteamGame" game ON names.name=ANY(game.developers) GROUP BY names.name
    )
    INSERT INTO "Studio" (id,name,"gameCount","avgReviewScore","totalOwnerEstimate",games,rarity,atk,def,"updatedAt")
      SELECT 'mcp-' || md5(random()::text || clock_timestamp()::text),name,game_count,avg_score,owners,games,'COMMON'::"Rarity",avg_score,LEAST(250,GREATEST(50,ROUND(50 + 25 * LOG(10, GREATEST(1, owners)))::integer)),now() FROM agg
      ON CONFLICT (name) DO UPDATE SET "gameCount"=EXCLUDED."gameCount","avgReviewScore"=EXCLUDED."avgReviewScore",
        "totalOwnerEstimate"=EXCLUDED."totalOwnerEstimate",games=EXCLUDED.games,atk=EXCLUDED.atk,def=EXCLUDED.def,"updatedAt"=now();
  END $import$;`;
}

const raritySql = `WITH best AS (
  SELECT studio.id,COALESCE(MAX(game."reviewScore"),0) AS best_score FROM "Studio" studio LEFT JOIN "SteamGame" game ON studio.name=ANY(game.developers) GROUP BY studio.id
), catalog AS (
  SELECT 'GAME'::text kind,id,"reviewScore" score,0 best_score FROM "SteamGame"
  UNION ALL SELECT 'STUDIO'::text,studio.id,studio."avgReviewScore",best.best_score FROM "Studio" studio JOIN best ON best.id=studio.id
), ranked AS (
  SELECT *,ROW_NUMBER() OVER (ORDER BY score DESC,id ASC) pos,COUNT(*) OVER () total FROM catalog
), assigned AS (
  SELECT *,GREATEST(CASE WHEN pos<=ROUND(total*0.005) THEN 0 WHEN pos<=ROUND(total*0.055) THEN 1 WHEN pos<=ROUND(total*0.155) THEN 2 WHEN pos<=ROUND(total*0.355) THEN 3 ELSE 4 END,
    CASE WHEN kind='GAME' THEN 0 WHEN best_score>=98 THEN 0 WHEN best_score>=96 THEN 1 WHEN best_score>=91 THEN 2 WHEN best_score>=85 THEN 3 ELSE 4 END) rank FROM ranked
), final AS (
  SELECT kind,id,(CASE rank WHEN 0 THEN 'LEGENDARY' WHEN 1 THEN 'EPIC' WHEN 2 THEN 'RARE' WHEN 3 THEN 'UNCOMMON' ELSE 'COMMON' END)::"Rarity" rarity FROM assigned
), games_updated AS (
  UPDATE "SteamGame" game SET rarity=final.rarity FROM final WHERE final.kind='GAME' AND game.id=final.id AND game.rarity<>final.rarity RETURNING game.id
)
UPDATE "Studio" studio SET rarity=final.rarity FROM final WHERE final.kind='STUDIO' AND studio.id=final.id AND studio.rarity<>final.rarity;`;

try {
  await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "steammasters-import", version: "1.0" } });
  await rpc("notifications/initialized", {}, true);
  if (process.argv.includes("--recalculate-only")) {
    await sql(raritySql);
    console.log("Raretés du catalogue recalculées.");
    process.exit(0);
  }
  if (process.argv.includes("--audit-only")) {
    const summary = await rows(`SELECT (SELECT COUNT(*) FROM "SteamGame") games,(SELECT COUNT(*) FROM "Studio") studios,(SELECT COUNT(*) FROM "Card") instances,
      (SELECT COUNT(*) FROM "SteamGame" WHERE def<=0) invalid_def,
      (SELECT COUNT(*) FROM "SteamGame" game LEFT JOIN "StoredImage" image ON image.key='game:'||game.id WHERE game."headerImage" <> '/api/images/game/'||game.id OR image.data IS NULL) invalid_images,
      (SELECT COUNT(*) FROM "SteamGame" game WHERE NOT EXISTS (SELECT 1 FROM "Studio" studio WHERE studio.name=ANY(game.developers))) missing_studio_links,
      (SELECT COUNT(*) FROM "Studio" studio WHERE studio."gameCount" <> (SELECT COUNT(*) FROM "SteamGame" game WHERE studio.name=ANY(game.developers)) OR studio.games <> COALESCE((SELECT array_agg(game.name ORDER BY game.name) FROM "SteamGame" game WHERE studio.name=ANY(game.developers)),ARRAY[]::text[])) inconsistent_studios`);
    const suspect = await rows(`SELECT game.id,game.name,game.tags,game.developers,(SELECT COUNT(*) FROM "Card" WHERE "gameId"=game.id) instances,(SELECT COUNT(*) FROM "Auction" WHERE "gameId"=game.id) auctions,(SELECT json_agg(json_build_object('name',studio.name,'gameCount',studio."gameCount",'instances',(SELECT COUNT(*) FROM "Card" WHERE "studioId"=studio.id),'auctions',(SELECT COUNT(*) FROM "Auction" WHERE "studioId"=studio.id))) FROM "Studio" studio WHERE studio.name=ANY(game.developers)) studios FROM "SteamGame" game WHERE game."updatedAt" > now()-interval '30 minutes' AND (game.name ~* '(^|[^[:alnum:]])(test server|playtest|demo|dedicated server|soundtrack|prologue|crosshair|lossless)([^[:alnum:]]|$)' OR game.tags::text ~* '(utilit|software|production|design|animation)') ORDER BY game.name`);
    console.log("Audit", summary[0], "Titres à examiner", JSON.stringify(suspect));
    if (FRANCHISE_MODE) {
      const named = await rows(`SELECT
        COUNT(*) FILTER (WHERE name ILIKE '%Tomb Raider%') tomb_raider,
        COUNT(*) FILTER (WHERE name ILIKE '%Alan Wake%') alan_wake,
        COUNT(*) FILTER (WHERE name ILIKE '%Borderlands%') borderlands,
        COUNT(*) FILTER (WHERE name ILIKE '%Fallout%') fallout
        FROM "SteamGame"`);
      const franchise = await rows(`SELECT id,name,developers FROM "SteamGame" WHERE "updatedAt" > now()-interval '60 minutes' ORDER BY "updatedAt"`);
      const catalog = await rows('SELECT name,developers FROM "SteamGame"');
      const confirmedStudios = new Set(catalog.filter((game) => matchesFranchise(game.name)).flatMap((game) => game.developers ?? []).map(normalizedStudio));
      const directCount = franchise.filter((game) => matchesFranchise(game.name)).length;
      const unrelated = franchise.filter((game) => !matchesFranchise(game.name) && !game.developers.some((developer) => confirmedStudios.has(normalizedStudio(developer))));
      console.log("Licences nommées", named[0], "Import récent", franchise.length, "titres directs", directCount, "jeux des studios", franchise.length - directCount - unrelated.length, "hors cible confirmée", JSON.stringify(unrelated));
    }
    process.exit(0);
  }
  const before = (await rows('SELECT (SELECT COUNT(*) FROM "SteamGame") AS games, (SELECT COUNT(*) FROM "Studio") AS studios, (SELECT value FROM "AppSetting" WHERE key=\'MCP_GUIDE_VERSION\') AS guide_version'))[0];
  console.log("Avant import", before);
  const existing = new Set((await rows('SELECT id FROM "SteamGame"')).map((row) => row.id));
  const candidates = new Map();
  for (let page = 0; page < 15 && (FRANCHISE_MODE || candidates.size < 800); page++) {
    const data = await get(`https://steamspy.com/api.php?request=all&page=${page}`);
    for (const [id, item] of Object.entries(data)) {
      if (existing.has(id) || asianTitle.test(item.name ?? "") || nonGameEdition.test(item.name ?? "") || ownersFromRange(item.owners) <= 0) continue;
      candidates.set(id, { id, name: item.name, developer: item.developer, owners: ownersFromRange(item.owners), reviews: (item.positive ?? 0) + (item.negative ?? 0) });
    }
    console.log(`Candidats page ${page}: ${candidates.size}`);
  }
  let queue = [...candidates.values()].sort((a, b) => b.owners - a.owners || b.reviews - a.reviews || Number(a.id) - Number(b.id));
  let franchiseStudios = new Set();
  if (FRANCHISE_MODE) {
    const catalogStudios = await rows('SELECT name,developers FROM "SteamGame"');
    const studioNames = new Set(catalogStudios.filter((game) => matchesFranchise(game.name)).flatMap((game) => game.developers ?? []).map(normalizedStudio));
    const direct = queue.filter((candidate) => matchesFranchise(candidate.name));
    for (const candidate of direct) {
      for (const developer of String(candidate.developer ?? "").split(/[,;]/)) {
        if (developer.trim()) studioNames.add(normalizedStudio(developer));
      }
    }
    const siblings = queue.filter((candidate) => !matchesFranchise(candidate.name) && String(candidate.developer ?? "").split(/[,;]/).some((developer) => studioNames.has(normalizedStudio(developer))));
    franchiseStudios = studioNames;
    queue = [...direct, ...siblings];
    console.log(`Grandes licences : ${direct.length} titres directs absents, ${siblings.length} autres jeux de leurs studios, ${studioNames.size} studios ciblés.`);
    console.log("Aperçu licences", direct.slice(0, 15).map((game) => game.name));
  }
  if (!EXECUTE) { console.log(`Préparation seulement : ${queue.length} candidats, ajouter --execute pour importer.`); process.exit(0); }
  let added = 0;
  let checked = 0;
  const failures = [];
  let batch = [];
  async function flush() {
    if (!batch.length) return;
    try { await sql(importSql(batch)); added += batch.length; console.log(`Importés ${added}/${TARGET} (${batch.at(-1).name})`); }
    catch (error) {
      console.error(`Lot refusé, essai individuel : ${error.message.slice(0, 180)}`);
      for (const game of batch) {
        try { await sql(importSql([game])); added++; console.log(`Importés ${added}/${TARGET} (${game.name})`); }
        catch (inner) { failures.push(`${game.id}: SQL ${inner.message.slice(0, 120)}`); }
      }
    }
    batch = [];
  }
  for (const candidate of queue) {
    if (added + batch.length >= TARGET) break;
    checked++;
    try {
      const game = await gameFromSteam(candidate.id);
      if (!game) { failures.push(`${candidate.id}: inéligible`); continue; }
      if (FRANCHISE_MODE) {
        const direct = matchesFranchise(game.name);
        if (!direct && !game.developers.some((developer) => franchiseStudios.has(normalizedStudio(developer)))) {
          failures.push(`${candidate.id}: studio non confirmé par Steam`);
          continue;
        }
        if (direct) for (const developer of game.developers) franchiseStudios.add(normalizedStudio(developer));
      }
      batch.push(game);
      if (batch.length >= 5) await flush();
    } catch (error) { failures.push(`${candidate.id}: ${error.message.slice(0, 100)}`); }
    if (checked % 10 === 0) console.log(`Vérifiés ${checked}, prêts/importés ${added + batch.length}, refusés ${failures.length}`);
    await pause(850);
  }
  await flush();
  await sql(raritySql);
  const after = (await rows('SELECT (SELECT COUNT(*) FROM "SteamGame") AS games, (SELECT COUNT(*) FROM "Studio") AS studios, (SELECT COUNT(*) FROM "SteamGame" WHERE def<=0) AS invalid_def, (SELECT COUNT(*) FROM "SteamGame" game LEFT JOIN "StoredImage" image ON image.key=\'game:\'||game.id WHERE image.data IS NULL) AS missing_images'))[0];
  console.log("Après import", after, "ajoutés réellement", after.games - before.games, "candidats contrôlés", checked, "refusés", failures.length);
  if (failures.length) console.log("Refus (10 premiers)", failures.slice(0, 10));
  const logId = `mcp-${randomUUID()}`;
  await sql(`INSERT INTO "AppLog" (id,category,level,message,details,"createdAt") VALUES (${literal(logId)},'IMPORT','SUCCESS',${literal(`Import MCP : ${after.games - before.games} nouveaux jeux, ${after.studios - before.studios} studios`)},${literal(JSON.stringify({ before, after, checked, refused: failures.length }))}::jsonb,now())`);
} finally {
  curl.kill();
}
