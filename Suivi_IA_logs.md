# Suivi_IA_logs.md — Steam Masters
> État actuel condensé. Remplacer à chaque fin de tâche.

## État : DOCKER COMPOSE PROD
**Date** : 2026-09-19
**Phase** : docker-compose.yml prod complet — app + postgres + redis intégrés

## Déploiement Coolify
- Type : **Docker Compose** (pas "Public Git Repository")
- Repo : https://github.com/oweebee/steam-masters
- Vars à renseigner dans Coolify (3 seulement) :
  - `POSTGRES_PASSWORD` = mot de passe fort
  - `NEXTAUTH_SECRET` = chaîne random (openssl rand -base64 32)
  - `NEXTAUTH_URL` = https://steammasters.obsidianspoon.com
- DATABASE_URL et REDIS_URL sont calculés dans le compose (internes)
- Domaine : steammasters.obsidianspoon.com → A record vers IP VPS

## Premier accès
- Aller sur /setup → créer compte admin
- Clé Steam API → /admin/settings

## Ce qui existe
- [x] Next.js 16 (App Router, TS, Tailwind 4)
- [x] Prisma schema complet
- [x] NextAuth v5 credentials
- [x] Middleware protection routes
- [x] /setup, /login, /signup, /admin, /admin/users, /admin/settings, /dashboard
- [x] APIs : setup, register, admin/users, admin/settings
- [x] Dockerfile multi-stage standalone
- [x] entrypoint.sh (prisma migrate deploy auto)
- [x] docker-compose.yml prod (app + postgres + redis, healthchecks)

## TODO priorité
1. [ ] Migration Prisma initiale commitée
2. [ ] src/lib/steam.ts — Steam API + cache Redis
3. [ ] Ouverture de paquets
4. [ ] UI carte Steam
5. [ ] Collection / Duels / Troc / Enchères

## Pièges
- next-auth v5 beta : src/auth.ts + /api/auth/[...nextauth]/route.ts
- entrypoint.sh : prisma migrate deploy avant node server.js
- Migration initiale : doit être générée localement (npx prisma migrate dev --name init) puis commitée
- Steam API key stockée en AppSetting DB, lue via prisma (pas .env)
