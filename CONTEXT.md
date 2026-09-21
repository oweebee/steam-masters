# CONTEXT.md — Steam Masters
> Règles d'archi stables. Ne modifier QUE si une règle change.

## Concept
Clone de WikiMasters mais avec la base de données Steam.
Cartes = jeux Steam + studios/développeurs. Stats dérivées de données Steam/SteamSpy réelles, jamais inventées.

## Stack
| Couche | Techno |
|--------|--------|
| Frontend + API | Next.js 16 (App Router, TypeScript) |
| DB | PostgreSQL 16 (Prisma ORM 5.22) |
| Cache / sessions | Redis 7 (ioredis) |
| Realtime | Socket.io 4 (dépendance présente, non branchée à une fonctionnalité à ce jour) |
| Auth | NextAuth v5 beta (credentials) |
| CSS | Tailwind CSS 4 |
| Deploy | Coolify + Docker Compose (standalone) + Traefik |
| Accès DB direct IA | MCP Postgres dédié (`steammasters-mcp.obsidianspoon.com`, sous-domaine Host-only — jamais de sous-chemin, incompatible SSE) |

## Logique des cartes (refonte 2026-09-21)
Deux notions de "rareté" bien distinctes, ne pas les confondre :

1. **Rareté intrinsèque du jeu/studio (catalogue)** — inchangée depuis le début, basée sur `ownerEstimate` réel (SteamSpy) :
   - COMMON >10M / UNCOMMON 2–10M / RARE 500k–2M / EPIC 100k–500k / LEGENDARY <100k possesseurs estimés
   - ATK jeu = review score Steam (0–100) ; DEF jeu = ownerEstimate ; idem agrégé pour Studio (moyenne review / somme ownerEstimate de ses jeux en base)
   - Affichée sur les vues catalogue (`/toutes-les-cartes`, `/admin/cards`)

2. **Rareté de l'exemplaire de carte (`Card.rarity`)** — tirée indépendamment à CHAQUE pull booster via une loot table fixe, figée ensuite, modifiable SEULEMENT par un admin (`/api/admin/instances/[id]`) :
   - 🟠 Orange/LEGENDARY 0,5% — plafond **1 par jeu/studio, tous joueurs confondus** (unique sur toute la partie)
   - 🟣 Violet/EPIC 5% — plafond 5 par jeu/studio
   - 🔵 Bleu/RARE 10% — plafond 10 par jeu/studio
   - 🟢 Vert/UNCOMMON 20% — plafond 20 par jeu/studio
   - ⚪ Blanc/COMMON reste (~64,5%) — illimité
   - Si le palier tiré est déjà plafonné pour ce jeu/studio précis → redescend d'un cran (jamais changement de jeu/studio). Vérifié atomiquement dans la transaction de création (`src/app/api/booster/route.ts`, `src/lib/rarityRoll.ts`).
   - Catégorie "gris" mentionnée une fois par l'user puis explicitement abandonnée — ne jamais l'ajouter.
   - **Les cartes ne sont PLUS uniques par défaut** (contrainte `@@unique([gameId])`/`@@unique([studioId])` supprimée, migration 0008) : un même jeu/studio peut être tiré par plusieurs joueurs (ou plusieurs fois par le même), sous réserve des plafonds ci-dessus.

- Source données jeu/studio : Steam Store API (`appdetails`, `appreviews`) + `GetNumberOfCurrentPlayers` + SteamSpy (`owners`, tiers/non-officiel) — toujours ces sources, jamais de champ inventé.

## Règles anti-casse
1. Jamais modifier le schema Prisma sans migration explicite (une migration = un fichier numéroté dans `prisma/migrations/`)
2. Les routes API Steam sont TOUJOURS cachées dans Redis (TTL 30 min, `src/lib/steam.ts`) — jamais d'appel direct depuis le client
3. node_modules exclus du repo (.gitignore)
4. .env jamais commité — utiliser .env.example
5. `output: "standalone"` dans next.config.ts — obligatoire pour Docker
6. Ne jamais fabriquer de donnée (atk/def/rarity/prix/bio/logo studio) sans source réelle vérifiée (API ou saisie manuelle explicite d'un admin, jamais générée par l'IA) — toute formule doit être documentée ici ET dans `AppSetting.MCP_GUIDE` (tenu à jour en même temps, via MCP)
7. Un service MCP en transport SSE ne peut PAS être routé par sous-chemin sur un domaine partagé — toujours sous-domaine Host-only dédié
8. Workflow de sync : édition dans un clone cloud → build de vérification (`npm run build`) → copie vers le device (`device_commit_files`) → commit sur le device (`device_bash`) → **`push.bat` côté user** (le device Windows local a `npm install` cassé et pas de credential helper git, donc jamais de build/push local)
