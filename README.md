# SteamMasters

Clone de WikiMasters, cartes générées depuis la bibliothèque Steam (ATK = score reviews, DEF = pic CCU, Rareté = nombre de possesseurs).

## Premier déploiement

1. Déployer via Coolify (Docker Compose) — voir `docker-compose.yml`.
2. Variables d'env requises côté Coolify : `POSTGRES_PASSWORD`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.
3. Aller sur `/setup` : cette page crée le **premier compte admin**. Elle se désactive automatiquement une fois un admin créé (redirige vers `/login`).
4. Se connecter avec ce compte admin → `/admin/settings` pour renseigner la clé API Steam (stockée en base, pas en env var).
5. `/admin/users` : approuver/rejeter les inscriptions, attribuer les droits admin.

## Inscription utilisateur

Email + mot de passe, pas de vérification mail. Statut `PENDING` jusqu'à approbation admin.

## Stack

Next.js 16 (App Router, TS, Tailwind 4) · PostgreSQL 16 (Prisma) · Redis 7 · NextAuth v5 beta (credentials) · Docker multi-stage standalone.

## Dev local

```bash
npm install
npx prisma migrate dev
npm run dev
```
