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
| Accès DB direct IA | MCP Postgres dédié (`steammasters-mcp.obsidianspoon.com`, sous-domaine Host-only — jamais de sous-chemin, incompatible SSE). Service `mcp` (docker-compose.yml) : `crystaldba/postgres-mcp`, transport SSE, protégé par Traefik basicauth user `mcp` (mot de passe stocké en hash apr1 dans le label Traefik, irréversible — pas de credential IA accessible en clair). |
| NEXTAUTH_SECRET (Coolify) | confirmé non-vide et stable (capture Coolify 2026-09-22), écarte l'hypothèse "secret vide/instable" pour le bug de reconnexion |

## Logique des cartes (refonte 2026-09-21)
Deux notions de "rareté" bien distinctes, ne pas les confondre :

1. **Rareté du jeu/studio (catalogue)** — **CHANGÉ 2026-09-21 (2e passe)** : n'est PLUS dérivée de `ownerEstimate` (l'ancien mapping par seuils classait à tort les jeux récents à faible estimation SteamSpy en Légendaire). Tirée via la MÊME loot table que `Card.rarity` (0,5 % Légendaire / 5 % Épique / 10 % Rare / 20 % Peu commune / reste Commune), **une seule fois à la création** du jeu/studio en base, puis figée (un refresh Steam ne la recalcule jamais). Exception explicite et assumée à la règle anti-casse #6 (source réelle obligatoire) — confirmée par l'user le 2026-09-21.
   - ATK jeu = review score Steam (0–100, réel) ; DEF jeu = ownerEstimate (réel) — inchangés, seule `rarity` catalogue est désormais aléatoire.
   - **Règle DEF > 0 obligatoire à l'import** (`/api/admin/games`, `POST`) : un jeu avec `ownerEstimate <= 0` est refusé (HTTP 422). Migration 0014 a purgé rétroactivement les jeux DEF=0 déjà en base (+ leurs Card/Trade/Auction liés), recalculé les studios à partir des jeux valides restants, supprimé les studios sans jeu valide, et redistribué la rareté catalogue restante selon les taux ci-dessus.
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

3. **ATK de l'exemplaire (`Card.atk`, migration 0011)** — NE touche PAS la logique/les taux/plafonds de tirage de `Card.rarity` ci-dessus (inchangés). Une fois la rareté obtenue, l'ATK est roulé dans une bande liée à ce palier, figé pareil, modifiable ensuite SEULEMENT par un admin (`rollAtkForRarity` dans `src/lib/rarityRoll.ts`) :
   - 🟠 LEGENDARY → ATK 98-100 / 🟣 EPIC → 96-97 / 🔵 RARE → 91-95 / 🟢 UNCOMMON → 85-90 / ⚪ COMMON → 0-84
   - Remplace l'ATK catalogue (`SteamGame.atk`/`Studio`, inchangé) sur l'affichage de CETTE carte (collection, résultat de pull). Les vues catalogue (`/toutes-les-cartes`, `/admin/cards`) continuent d'afficher l'ATK catalogue au niveau jeu/studio ; l'ATK par exemplaire est visible/éditable dans le panneau « Exemplaires » de `/admin/cards`.

- Source données jeu/studio : Steam Store API (`appdetails`, `appreviews`) + `GetNumberOfCurrentPlayers` + SteamSpy (`owners`, tiers/non-officiel) — toujours ces sources, jamais de champ inventé.

## Règles anti-casse
1. Jamais modifier le schema Prisma sans migration explicite (une migration = un fichier numéroté dans `prisma/migrations/`)
2. Les routes API Steam sont TOUJOURS cachées dans Redis (TTL 30 min, `src/lib/steam.ts`) — jamais d'appel direct depuis le client
3. node_modules exclus du repo (.gitignore)
4. .env jamais commité — utiliser .env.example
5. `output: "standalone"` dans next.config.ts — obligatoire pour Docker
6. Ne jamais fabriquer de donnée (atk/def/prix/bio/logo studio) sans source réelle vérifiée (API ou saisie manuelle explicite d'un admin, jamais générée par l'IA) — toute formule doit être documentée ici ET dans `AppSetting.MCP_GUIDE` (tenu à jour en même temps, via MCP). **Exception explicite, confirmée par l'user** : la rareté (catalogue ET exemplaire) est un mécanisme de jeu tiré aléatoirement, pas une donnée Steam — voir « Logique des cartes » ci-dessus.
7. Un service MCP en transport SSE ne peut PAS être routé par sous-chemin sur un domaine partagé — toujours sous-domaine Host-only dédié
8. Workflow de sync : édition dans un clone cloud → build de vérification (`npm run build`) → copie vers le device (`device_commit_files`) → commit sur le device (`device_bash`) → **`push.bat` côté user** (le device Windows local a `npm install` cassé et pas de credential helper git, donc jamais de build/push local)
