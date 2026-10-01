const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

const source = fs.readFileSync("src/lib/changelog.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(compiled, sandbox);

const posts = sandbox.exports.CHANGELOG_POSTS;
if (!Array.isArray(posts) || posts.length === 0) throw new Error("Le changelog doit contenir au moins un post.");

const slugs = new Set();
for (const post of posts) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(post.date)) throw new Error(`Date invalide : ${post.slug}`);
  if (!post.slug || slugs.has(post.slug)) throw new Error(`Slug absent ou dupliqué : ${post.slug}`);
  if (!post.title || !post.summary || !Array.isArray(post.details) || post.details.length === 0) {
    throw new Error(`Post incomplet : ${post.slug}`);
  }
  slugs.add(post.slug);
}

for (let index = 1; index < posts.length; index += 1) {
  if (posts[index - 1].date < posts[index].date) throw new Error("Les posts doivent être antéchronologiques.");
}

console.log(`${posts.length} posts de changelog valides.`);
