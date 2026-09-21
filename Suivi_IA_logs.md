# Suivi_IA_logs.md — Steam Masters
> État actuel condensé. Remplacer à chaque fin de tâche.

## État (2026-09-21, 3e passe)
**Session relais** : une autre IA (même device, autre chat) a travaillé sur ce projet entre-temps (8 commits
`scaffold initial` sur le device, jusqu'à MCP indisponible côté user qui a coupé la session). Ce tour = audit +
validation de son travail + décision utilisateur sur un point d'archi, PAS de nouveau code métier.

**24 commits locaux (device) prêts, PAS ENCORE PUSHÉS — user doit lancer `push.bat`, PUIS `prisma migrate deploy`
côté serveur (migrations 0004 à 0014 en attente).** MCP toujours injoignable (à revérifier prochain chat).

## Audit du travail de l'autre IA (ce tour) — VALIDÉ
Rapatrié sur clone cloud + testé réellement (pas de supposition) :
- `npx tsc --noEmit` : 0 erreur. `npm run build` : succès complet (43 routes générées).
- Migration 0014 testée via `prisma migrate deploy` (vrai chemin transactionnel, pas `psql -f` qui casse le
  `CREATE TEMP TABLE ... ON COMMIT DROP` en autocommit — piège de méthode de test, pas un bug de la migration).
  Vérifié sur données seedées réelles : purge des jeux DEF≤0 + leurs Card/Trade/Auction liés, recalcul studio
  exact, redistribution rareté catalogue exacte aux taux (18 jeux → 12 Commune/3 Peu commune/2 Rare/1 Épique,
  conforme aux %).
- Nouvelles fonctionnalités ajoutées par l'autre IA (code compilé/build OK, pas testées visuellement en prod) :
  vente de cartes (`/api/collection/sell`, 1 pièce/carte, `sellable` flag sur les cartes engagées dans un
  échange), sync studios (`/api/admin/studios/sync`), découverte de nouveaux appids Steam
  (`/api/admin/games/discover`), couverture jeu sur carte Studio (image du 1er jeu), refonte visuelle
  collection/joueurs/échanges (`globals.css` +389 lignes).

## Décision utilisateur (ce tour) — changement d'archi confirmé
**La rareté CATALOGUE (`SteamGame.rarity`/`Studio.rarity`) n'est PLUS basée sur `ownerEstimate` réel.** L'autre
IA l'avait remplacée par un tirage aléatoire (mêmes taux que `Card.rarity` : 0,5/5/10/20/reste) car l'ancien
mapping par seuils classait à tort les jeux récents à faible estimation SteamSpy en Légendaire. **Confirmé
explicitement par l'user ("garder aléatoire") le 2026-09-21** — exception assumée et documentée à la règle
anti-casse #6 (voir CONTEXT.md). Rareté catalogue tirée UNE SEULE FOIS à la création, figée, un refresh Steam
ne la recalcule jamais. ATK (review score) et DEF (ownerEstimate) restent des données Steam réelles, inchangés.

**Règle DEF > 0 obligatoire à l'import** (demande explicite user) : jeu à `ownerEstimate<=0` refusé (422) à
l'import ; migration 0014 a purgé rétroactivement les jeux DEF=0 déjà en base.

## Mécanique cartes — état complet (voir CONTEXT.md pour le détail)
1. Rareté catalogue (`SteamGame.rarity`/`Studio.rarity`) — **aléatoire, figée à la création** (changé ce tour,
   voir ci-dessus). DEF/ATK catalogue restent réels (ownerEstimate/reviewScore).
2. Rareté d'exemplaire (`Card.rarity`) — loot table au tirage booster (Orange 0,5%/plafond 1 unique-partie,
   Violet 5%/plafond 5, Bleu 10%/plafond 10, Vert 20%/plafond 20, Blanc reste/illimité), figée, downgrade en
   cascade si plafond atteint pour CE jeu/studio, modifiable admin seul. Taux INCHANGÉS depuis leur définition.
3. ATK d'exemplaire (`Card.atk`, migration 0011) — roulé dans une bande liée à la rareté d'exemplaire (Orange
   98-100 / Violet 96-97 / Bleu 91-95 / Vert 85-90 / Blanc 0-84), figé pareil, modifiable admin seul.
Cartes plus uniques par défaut (migration 0008). Booster pioche uniformément tout le catalogue (jeux+studios).
Backfill rareté (0010) et ATK (0012) des cartes pré-existantes fait en migration SQL testée sur Postgres réel.

## Système d'échange + vente — déployé, jamais testé en prod
`/echanges` : N cartes (0 possible) contre M cartes (0 possible) + jetons optionnels, acceptation mutuelle,
transaction atomique. `/api/collection/sell` (ajout autre IA) : vend des cartes non engagées dans un échange
pour 1 pièce/carte.

## Joueurs / PWA / UI — déployés (code), jamais vérifiés visuellement en prod
- `/joueurs` remplace `/amis`. Sidebar repliable par défaut. PWA installable. Onglets admin.
- Carte 3D flip unifiée dans `FlipCard.tsx` (bugs badge-au-dos/disparition corrigés).
- Restyle collection/joueurs/échanges + couverture jeu sur carte Studio (autre IA, ce tour, non vérifié visuel).

## Studio.about / Studio.avatarUrl — déployé (migration 0006)
Saisie manuelle admin. 8 logos réels intégrés (Valve, Rockstar North, Treyarch, Respawn, CAPCOM, Infinity Ward,
Pocketpair, Raven Software). 133 studios restants sans avatar — continuer par lots sur demande.

## MCP Postgres — état 2026-09-21 : INJOIGNABLE
Toujours en timeout. Toute MAJ MCP_GUIDE/backfill en attente a été faite en migration SQL versionnée testée sur
Postgres local réel (pattern à réutiliser tant que MCP est down). MCP_GUIDE pas encore mis à jour sur le
changement de rareté catalogue aléatoire ce tour (à faire via migration si MCP reste indisponible).

## TODO immédiat (ordre)
1. **User : push.bat**, puis `prisma migrate deploy` côté serveur (11 migrations en attente : 0004→0014)
2. MAJ `AppSetting.MCP_GUIDE` sur la rareté catalogue désormais aléatoire (migration SQL si MCP toujours down)
3. Vérification visuelle réelle en prod : tout ce qui est listé "jamais vérifié visuellement" ci-dessus,
   notamment le restyle UI et la vente de cartes ajoutés par l'autre IA
4. Continuer la recherche de logos studio par lots (133 restants) si demandé
5. Gaps de game design non tranchés (voir liste dédiée ci-dessous)

## Gaps de game design NON tranchés
1. Nom de la monnaie virtuelle (`coins` générique)
2. Catégorisation par thème (SteamGame n'a que `tags` brut)
3. Système d'accumulation de paquets (WikiMasters : jusqu'à 10 en stock) — actuellement 1/heure sans stock
4. Pondération jeux vs studios dans le tirage booster — actuellement uniforme (1 poids par entrée catalogue)

## Mécaniques du schema PAS ENCORE implémentées (UI+logique)
Duels/quiz (Bataille=stub), enchères (Marché=stub), guildes (stub), messagerie (stub), leaderboard (stub, aucun
schema), succès (stub, aucun schema), profil (stub).

## Pièges à ne pas refaire
- Ne jamais dupliquer docker-compose.yml/.yaml ; vérifier .gitignore n'exclut pas un dossier tout juste committé
- Vérifier POSTGRES_PASSWORD/NEXTAUTH_SECRET/NEXTAUTH_URL réellement remplis dans Coolify
- Pas de shadow DB Postgres locale → un vrai Postgres 16 local (service postgresql + createuser/createdb) est
  disponible dans le sandbox cloud : TOUJOURS tester une migration SQL data dessus avant commit
- **`CREATE TEMP TABLE ... ON COMMIT DROP` dans une migration** : ne JAMAIS tester avec `psql -f` seul
  (autocommit par instruction → la temp table est droppée avant la requête suivante, faux négatif). Toujours
  tester via `prisma migrate deploy` réel (une seule transaction par fichier de migration), qui est aussi le
  chemin utilisé en prod.
- npm install cassé sur le device Windows local → toujours valider un build sur clone cloud avant commit/push
- Device Windows sans credential helper git → committer via device_bash, laisser l'user lancer push.bat
- Un service MCP en transport SSE ne peut PAS être routé par sous-chemin sur un domaine partagé
- Le clone cloud `/tmp/steam-masters` est en retard sur les commits device (normal) → ne pas s'inquiéter du
  `git log` cloud qui diffère, le device fait foi ; rapatrier via `device_stage_files` avant d'auditer/tester
- `device_commit_files` peut écrire un contenu périmé sans erreur — revérifier côté device après commit sur un
  fichier déjà modifié plusieurs fois dans le tour, retenter avec `force: true` si divergence
- Ne jamais fabriquer de donnée (atk/def/prix/bio/logo studio) — sourcer Steam/SteamSpy réel ou saisie admin
  explicite. EXCEPTION CONFIRMÉE : la rareté (catalogue et exemplaire) est un mécanisme de jeu aléatoire assumé,
  pas une donnée Steam — voir CONTEXT.md règle #6.
- **Quand une autre IA/session a modifié le projet entre deux tours : rapatrier ET tester réellement son travail
  (tsc, build, migration sur Postgres local) avant de continuer — ne jamais supposer que "ça a compilé chez
  elle". Si un changement contredit une règle documentée (ex. donnée inventée), le signaler et trancher avec
  l'user avant de committer la suite, ne jamais accepter ou défaire silencieusement.**
