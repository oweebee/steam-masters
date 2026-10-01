# SteamMasters

Clone de WikiMasters, cartes générées depuis la bibliothèque Steam (données réelles, jamais inventées).

## Concept cartes (mis à jour 2026-09-21)

- **Jeu/Studio (catalogue)** : ATK = review score Steam, DEF = possesseurs estimés (SteamSpy), rareté intrinsèque basée sur ces possesseurs (indicateur de popularité, affiché sur les vues catalogue `/toutes-les-cartes` et `/admin/cards`).
- **Carte (exemplaire tiré au booster)** : rareté INDÉPENDANTE tirée via une loot table fixe à chaque pull, figée ensuite (modifiable seulement par un admin) :
  - 🟠 Orange (Légendaire) 0,5% · 🟣 Violet (Épique) 5% · 🔵 Bleu (Rare) 10% · 🟢 Vert (Magique) 20% · ⚪ Blanc (Commun) reste (~64,5%).
  - Ces taux concernent uniquement les nouveaux tirages. Les cartes déjà possédées et les offres actives ne bloquent ni ne rétrogradent un tirage.
- Les cartes ne sont pas globalement uniques : plusieurs joueurs peuvent posséder sans limite le même jeu/studio et la même rareté.

## Premier déploiement

1. Déployer via Coolify (Docker Compose) — voir `docker-compose.yml`.
2. Variables d'env requises côté Coolify : `POSTGRES_PASSWORD`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AUTH_TRUST_HOST=true`. Pour les notifications navigateur/PWA : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (génération : `npx web-push generate-vapid-keys`).
3. Aller sur `/setup` : cette page crée le **premier compte admin**. Elle se désactive automatiquement une fois un admin créé (redirige vers `/login`).
4. Se connecter avec ce compte admin → `/admin/settings` pour renseigner la clé API Steam (stockée en base, pas en env var — non requise pour les endpoints publics utilisés).
5. `/admin/users` : approuver/rejeter les inscriptions, attribuer les droits admin.
6. `/admin/cards` : vue catalogue complète (recherche/tri/filtres), édition manuelle Studio.about/avatarUrl, édition manuelle de la rareté d'un exemplaire précis.

## Inscription utilisateur

Email + mot de passe, pas de vérification mail. Statut `PENDING` jusqu'à approbation admin.

## Fonctionnalités

- Ouverture de paquet toutes les heures, collection personnelle, catégories, suivi de cartes et défausse à 3 gigapuissances par exemplaire.
- Catalogue complet réservé à l'administration dans `/admin/cards`; liste publique des joueurs triée alphabétiquement.
- Magasin applicatif distinct du marché joueur-à-joueur : stock mondial commun de 50 cartes, rotation horaire, exemplaires d'un même sujet sans limite globale, prix aléatoire dans les fourchettes configurées par rareté et relance manuelle côté admin.
- Chaque nouvelle rotation vise les pourcentages de rareté configurés, arrondis sur 50 offres, avec au moins une légendaire lorsque le catalogue le permet. Les collections des joueurs et les anciennes offres ne limitent jamais un nouveau tirage; seule l’éligibilité catalogue peut redistribuer un quota.
- Suivre/ne plus suivre depuis les cartes Jeu/DLC/Studio ouvertes et chaque version d’une licence; fenêtres habillées avec ImageGen, listes de jeux Studio défilantes sans écrasement sur mobile/PWA.
- Marché, enchères, échanges et envois directs : cartes et gigapuissances transférées atomiquement, avec verrouillage des exemplaires engagés.
- Notifications internes et Web Push sur PWA mobile et navigateurs PC; une alerte de carte suivie ouvre directement une popup de l’offre avec achat immédiat, sans passer par la grille du magasin.
- Classement des collectionneurs avec points par rareté, progressions plateformes/DLC/studios, combos, popup détaillée et récompenses longue durée de 20 à 5 000 gigapuissances.
- Escalade V3 : duels en deux manches gagnantes, decks tactiques, combos, pouvoirs, mises de cartes/gigapuissances et replay animé. Plateau sobre uni, dos de cartes et bannières ImageGen, face-à-face d’ouverture (passable), annonce des tours, distribution animée et résultat après le dernier replay; mouvements réduits pris en charge.
- Imports Steam et IGDB, scans DLC, sélection directe de la plateforme IGDB dans le tableau admin et contrôles de cohérence catalogue.
- Carte 3D flip : rareté et statistiques propres à l'exemplaire, informations Jeu/Studio et actions contextuelles; les liens internes ouvrent une fiche zoomée empilable sans quitter la page.
- PWA installable avec invitation mobile adaptée à Android/iPhone, service worker, interface responsive et sidebar repliable/réordonnable par joueur; le même ordre est repris dans la PWA.
- Page `/informations` accessible depuis le menu de gauche : changelog visuel, daté et sans notification, avec un post autonome par évolution majeure.
- Accès direct MCP Postgres (`steammasters-mcp.obsidianspoon.com`) pour import/administration en masse par IA — voir `AppSetting.MCP_GUIDE` en base.

## Classement

Le score de base vaut 10/30/80/200/500 points pour les cartes commune/peu commune/rare/épique/légendaire. Les collections de plateformes, DLC et jeux d'un studio accordent déjà un multiplicateur à un tiers, puis un meilleur palier à deux tiers et le maximum à 100 %. La diversité des raretés, les séries d'une même rareté, le duo jeu + studio et la collection ultime ajoutent leurs bonus. Pour un même sujet, seul le multiplicateur le plus fort est retenu.

Le tableau `/classement` reste ordonné par score. Un clic sur un joueur ouvre le détail du score, les jauges et le prochain palier. La page privée `/recompenses`, accessible depuis le menu, affiche uniquement les gains du joueur connecté; son badge indique les récompenses non récupérées. Elle distingue les gains disponibles, les objectifs entamés, ceux qui ne sont pas encore commencés et l’historique. Chaque objectif possède une explication détaillée et chaque gain ne peut être réclamé qu’une fois.

## Stack

Next.js 16 (App Router, TS, Tailwind 4) · PostgreSQL 16 (Prisma 5.22) · Redis 7 (ioredis) · NextAuth v5 beta (credentials) · Docker multi-stage standalone · Coolify (Docker Compose) + Traefik.

## Dev local

```bash
npm install
npx prisma migrate dev
npm run dev
```
# Outils de maintenance et signalements

- Admin → Import de jeux → **Cohérence** : cinq contrôles locaux Jeux/Studios/DLC,
  sélection des anomalies, réparation des liens existants, suppression persistante
  des liens invalides, création locale de studios et import Steam séparé.
- Les échecs restent rouges avec leur motif. Les imports sont validés par un nouveau
  contrôle local ; une limitation Steam interrompt le lot. La suppression d'un lien
  ne supprime aucun exemplaire détenu par un joueur.
- **Bug Report**, sous Paramètres : formulaire privé vers l'administration et suivi
  de ses signalements. Admin → **Bug Reports** : recherche, statuts, notes internes,
  réponse au joueur. L'accès MCP est décrit dans `MCP.md` et `AppSetting.MCP_GUIDE`.
- Migrations nécessaires : `0037_bug_reports` et `0038_trade_request_id` (propositions
  d'échange protégées contre les doublons lors d'une nouvelle tentative).
- Vérification de régression locale sans données réelles : `npm run test:coherence`.
