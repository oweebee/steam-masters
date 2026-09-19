# Suivi_IA_logs.md — Steam Masters
> État actuel condensé. Remplacer à chaque fin de tâche.

## État : INIT
**Date** : 2026-09-19
**Phase** : Scaffold initial pushé sur GitHub

## Ce qui existe
- [x] Next.js 16 scaffoldé (App Router, TS, Tailwind 4)
- [x] package.json avec toutes les dépendances déclarées
- [x] prisma/schema.prisma complet (User, Card, SteamGame, Trade, Auction, Bid, Guild, Message, Friend)
- [x] .env.example
- [x] Dockerfile (standalone, multi-stage)
- [x] docker-compose.yml (app + postgres + redis)
- [x] next.config.ts (standalone + images Steam CDN)
- [x] CONTEXT.md + Suivi_IA_logs.md

## Ce qui manque (TODO priorité)
1. [ ] Intégration Steam API — `/src/lib/steam.ts` (fetch + cache Redis)
2. [ ] Auth — NextAuth credentials (register/login)
3. [ ] Page collection — affichage des cartes
4. [ ] Ouverture de paquets — tirage aléatoire Steam
5. [ ] UI carte — composant Card avec rareté + stats ATK/DEF
6. [ ] Duels (quiz)
7. [ ] Troc + Enchères
8. [ ] Guildes + Messagerie

## Pièges connus
- npm install timeout en device_bash → packages déclarés dans package.json, install se fait au build Coolify
- next-auth v5 beta : config dans `/src/auth.ts` (pas dans pages/api/)
- Steam API key à retrouver (user l'a quelque part)
- Steam Spy peut être down → prévoir fallback

## Variables d'env requises
DATABASE_URL / REDIS_URL / NEXTAUTH_SECRET / NEXTAUTH_URL / STEAM_API_KEY / NEXT_PUBLIC_APP_URL
