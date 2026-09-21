# SteamMasters

Clone de WikiMasters, cartes générées depuis la bibliothèque Steam (données réelles, jamais inventées).

## Concept cartes (mis à jour 2026-09-21)

- **Jeu/Studio (catalogue)** : ATK = review score Steam, DEF = possesseurs estimés (SteamSpy), rareté intrinsèque basée sur ces possesseurs (indicateur de popularité, affiché sur les vues catalogue `/toutes-les-cartes` et `/admin/cards`).
- **Carte (exemplaire tiré au booster)** : rareté INDÉPENDANTE tirée via une loot table fixe à chaque pull, figée ensuite (modifiable seulement par un admin) :
  - 🟠 Orange (Légendaire) 0,5% — **unique sur toute la partie** (1 seul exemplaire par jeu/studio, tous joueurs confondus)
  - 🟣 Violet (Épique) 5% — max 5 exemplaires par jeu/studio
  - 🔵 Bleu (Rare) 10% — max 10 exemplaires par jeu/studio
  - 🟢 Vert (Magique) 20% — max 20 exemplaires par jeu/studio
  - ⚪ Blanc (Commun) reste (~64,5%) — illimité
  - Si le palier tiré est déjà plafonné pour ce jeu/studio précis, redescend d'un cran (jamais ne change de jeu/studio).
- Les cartes ne sont plus globalement uniques par jeu/studio (sauf Orange) : plusieurs joueurs peuvent posséder le même jeu.

## Premier déploiement

1. Déployer via Coolify (Docker Compose) — voir `docker-compose.yml`.
2. Variables d'env requises côté Coolify : `POSTGRES_PASSWORD`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AUTH_TRUST_HOST=true`.
3. Aller sur `/setup` : cette page crée le **premier compte admin**. Elle se désactive automatiquement une fois un admin créé (redirige vers `/login`).
4. Se connecter avec ce compte admin → `/admin/settings` pour renseigner la clé API Steam (stockée en base, pas en env var — non requise pour les endpoints publics utilisés).
5. `/admin/users` : approuver/rejeter les inscriptions, attribuer les droits admin.
6. `/admin/cards` : vue catalogue complète (recherche/tri/filtres), édition manuelle Studio.about/avatarUrl, édition manuelle de la rareté d'un exemplaire précis.

## Inscription utilisateur

Email + mot de passe, pas de vérification mail. Statut `PENDING` jusqu'à approbation admin.

## Fonctionnalités

- Ouverture de paquet (1/heure), collection, "Toutes les cartes" (catalogue public), "Joueurs" (liste publique, pas de système de demande d'ami)
- Échanges entre joueurs : N cartes (ou 0) contre M cartes (ou 0) + jetons optionnels des deux côtés, acceptation mutuelle, transaction atomique
- Carte 3D flip (clic) : stats figées, studio, prix, lien Steam au dos
- PWA installable (manifest + service worker), sidebar repliable (repliée par défaut)
- Accès direct MCP Postgres (`steammasters-mcp.obsidianspoon.com`) pour import/administration en masse par IA — voir `AppSetting.MCP_GUIDE` en base

## Stack

Next.js 16 (App Router, TS, Tailwind 4) · PostgreSQL 16 (Prisma 5.22) · Redis 7 (ioredis) · NextAuth v5 beta (credentials) · Docker multi-stage standalone · Coolify (Docker Compose) + Traefik.

## Dev local

```bash
npm install
npx prisma migrate dev
npm run dev
```
