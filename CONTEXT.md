# CONTEXT.md — Steam Masters
> Règles d'archi stables. Ne modifier QUE si une règle change.

## Concept
Clone de WikiMasters mais avec la base de données Steam.
Cartes = jeux Steam. Stats dérivées des métadonnées Steam API.

## Stack
| Couche | Techno |
|--------|--------|
| Frontend + API | Next.js 16 (App Router, TypeScript) |
| DB | PostgreSQL 16 (Prisma ORM) |
| Cache / sessions | Redis 7 (ioredis) |
| Realtime | Socket.io 4 |
| Auth | NextAuth v5 (credentials) |
| CSS | Tailwind CSS 4 |
| Deploy | Coolify + Docker (standalone) |

## Logique des cartes
- **Rareté** = estimation propriétaires (owners)
  - COMMON > 10M / UNCOMMON 1–10M / RARE 100k–1M / EPIC 10k–100k / LEGENDARY < 10k
- **ATK** = review score Steam (0–100), normalisé 0–10000
- **DEF** = peak CCU normalisé 0–10000
- Source : Steam Spy API + Steam Store API

## Règles anti-casse
1. Jamais modifier le schema Prisma sans migration explicite
2. Les routes API Steam sont TOUJOURS cachées dans Redis (TTL 24h) — jamais d'appel direct depuis le client
3. node_modules exclus du repo (.gitignore)
4. .env jamais commité — utiliser .env.example
5. `output: "standalone"` dans next.config.ts — obligatoire pour Docker
