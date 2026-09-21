# Suivi_IA_logs.md — Steam Masters
> État actuel condensé. Remplacer à chaque fin de tâche.

## État (2026-09-21)
**16 commits locaux (device) prêts, PAS ENCORE PUSHÉS — user doit lancer `push.bat`, PUIS `prisma migrate deploy`
côté serveur (migrations 0004 à 0013 en attente : prix jeu, jeux studio, about/avatar studio, jetons trade,
rareté par exemplaire, MCP_GUIDE, backfill rareté, ATK par exemplaire, backfill ATK, MCP_GUIDE ATK).**
MCP toujours injoignable → ces MAJ MCP_GUIDE/backfill ont été faites en migrations SQL versionnées (testées sur
Postgres local réel) au lieu de requêtes MCP live, sur demande explicite user. Vérifier par requête réelle
(MCP/curl) plutôt que supposer un push fait.

Derniers commits (device, du plus ancien au plus récent, résumé) : refonte rareté par exemplaire + plafonds,
onglets admin, système d'échange, sidebar repliable réelle + Joueurs, PWA, `54e1139` (MAJ
README/CONTEXT/Suivi_IA_logs), `2c94f76` (migrations 0009/0010 MCP_GUIDE + backfill rareté, code direct car MCP
injoignable), + commit ATK par exemplaire (migrations 0011-0013, ce tour).

## MCP Postgres — état 2026-09-21 : INJOIGNABLE (timeout complet, pas juste 503)
Précédemment opérationnel (import 153 jeux + 141 studios). `https://steammasters-mcp.obsidianspoon.com/sse`
timeout total sur curl. À revérifier en premier au prochain chat. **Toute MAJ MCP_GUIDE ou backfill de données
en attente de MCP a été faite via migration SQL versionnée (testée sur Postgres local réel avant commit) plutôt
que d'attendre — pattern à réutiliser si MCP reste indisponible.**

## Mécanique cartes — refonte 2026-09-21 (voir CONTEXT.md pour le détail complet)
Trois notions distinctes désormais, ne pas les confondre :
1. Rareté catalogue jeu/studio (`SteamGame.rarity`/`Studio.rarity`) — INCHANGÉE, basée sur ownerEstimate réel.
2. Rareté d'exemplaire (`Card.rarity`) — loot table au tirage (Orange 0,5%/plafond 1 unique-partie, Violet
   5%/plafond 5, Bleu 10%/plafond 10, Vert 20%/plafond 20, Blanc reste/illimité), figée, downgrade en cascade si
   plafond atteint pour CE jeu/studio, modifiable admin seul. **Logique/taux INCHANGÉS ce tour** (demande
   explicite user : "on touche pas au taux de presence de ces cartes").
3. **ATK d'exemplaire (`Card.atk`, NOUVEAU ce tour, migration 0011)** — ne touche PAS (2), vient APRÈS : une
   fois `Card.rarity` connue, ATK roulé dans une bande liée à ce palier (Orange 98-100 / Violet 96-97 / Bleu
   91-95 / Vert 85-90 / Blanc 0-84), figé pareil, modifiable admin seul (re-roll auto si l'admin change la
   rareté, ou valeur explicite). Remplace l'ATK catalogue sur l'affichage de CETTE carte (collection, résultat
   de pull) ; vues catalogue (`/toutes-les-cartes`, liste `/admin/cards`) gardent l'ATK catalogue jeu/studio.
   Panneau « Exemplaires » de `/admin/cards` : select rareté + input ATK par exemplaire.
Cartes plus uniques par défaut (migration 0008, `@@unique` supprimé). Booster pioche uniformément tout le
catalogue. **Backfill rareté (0010) et ATK (0012) des cartes pré-existantes fait en migration SQL, testé sur
Postgres local réel (plafonds et bandes vérifiés exactement) avant commit.**

## Système d'échange (Trade) — déployé, jamais testé en prod
`/echanges` : proposer N cartes (0 possible) contre M cartes (0 possible) + jetons optionnels des deux côtés
à un joueur choisi. Le destinataire accepte (transaction atomique, re-vérifie tout) ou refuse. Historique.
Schema Trade/TradeCard préexistant, ajout `offerCoins`/`wantCoins`/`resolvedAt` (migration 0007).

## Joueurs / PWA / UI — déployés (code), jamais vérifiés visuellement en prod
- `/joueurs` remplace `/amis` (liste publique tous users, pas de système de demande) ; `/amis` redirige.
- Sidebar réellement repliable, repliée par défaut (persisté localStorage).
- PWA : manifest.json, sw.js (cache app-shell, jamais l'API), icônes générées (placeholder "SM"), installable.
- Onglets de navigation admin (`AdminTabs.tsx` + `admin/layout.tsx`) sur toutes les pages `/admin/*`.
- Carte 3D flip unifiée dans `FlipCard.tsx` — bugs badge-au-dos et disparition mi-animation corrigés
  (délai `visibility` FIXE 0,25s dans les deux sens).

## Studio.about / Studio.avatarUrl — déployé (migration 0006)
Saisie manuelle admin via `/admin/cards`. 8 logos réels intégrés (Valve, Rockstar North, Treyarch, Respawn,
CAPCOM, Infinity Ward, Pocketpair, Raven Software), sourcés web + vérifiés HTTP avant écriture. 133 studios
restants sans avatar — continuer par lots sur demande.

## TODO immédiat (ordre)
1. **User : push.bat**, puis `prisma migrate deploy` côté serveur (10 migrations en attente : 0004→0013)
2. Vérification visuelle réelle en prod : flip card, sidebar repliable, PWA installable, échanges, joueurs,
   ATK par exemplaire affiché (collection + résultat de pull + panneau admin)
3. Continuer la recherche de logos studio par lots (133 restants) si demandé
4. Gaps de game design non tranchés (voir liste dédiée ci-dessous)
5. Retenter MCP en début de prochain chat — si dispo, reprendre le pattern normal (requêtes live) plutôt que
   des migrations SQL pour les prochaines MAJ ponctuelles

## Gaps de game design NON tranchés
1. Nom de la monnaie virtuelle (`coins` générique)
2. Catégorisation par thème (SteamGame n'a que `tags` brut)
3. Système d'accumulation de paquets (WikiMasters : jusqu'à 10 en stock) — actuellement 1/heure sans stock
4. Pondération jeux vs studios dans le tirage booster — actuellement uniforme (1 poids par entrée catalogue)

## Mécaniques du schema PAS ENCORE implémentées (UI+logique)
Duels/quiz (Bataille=stub), enchères (Marché=stub, schema Auction/Bid existe — `Auction.gameId` requis/non-
null, ne gère pas les cartes Studio), guildes (stub), messagerie (stub), leaderboard (stub, aucun schema),
succès (stub, aucun schema), profil (stub).

## Pièges à ne pas refaire
- Ne jamais dupliquer docker-compose.yml/.yaml ; vérifier .gitignore n'exclut pas un dossier tout juste committé
- Vérifier POSTGRES_PASSWORD/NEXTAUTH_SECRET/NEXTAUTH_URL réellement remplis dans Coolify
- Pas de shadow DB Postgres locale → un vrai Postgres 16 local (service postgresql + createuser/createdb) est
  disponible dans le sandbox cloud : TOUJOURS tester une migration SQL data (backfill, DO $$ blocks) dessus
  avant commit, pas juste `prisma validate` — a permis de vérifier exactement les bandes ATK/plafonds rareté
- npm install cassé sur le device Windows local → toujours valider un build sur clone cloud avant commit/push
- Device Windows sans credential helper git → committer via device_bash, laisser l'user lancer push.bat
- Un service MCP en transport SSE ne peut PAS être routé par sous-chemin sur un domaine partagé
- Le clone cloud `/tmp/steam-masters` est en retard sur les commits device (normal, ils sont poussés séparément
  via device_bash) → ne pas s'inquiéter du `git log` cloud qui diffère, c'est le device qui fait foi
- `device_commit_files` peut occasionnellement écrire un contenu périmé sans le signaler en erreur — toujours
  revérifier le contenu réel côté device (`grep`/`wc -l`) après un commit_files sur un fichier déjà modifié
  plusieurs fois dans le même tour, retenter avec `force: true` si divergence
- Ne jamais fabriquer de donnée (atk/def/rarity/prix/bio/logo studio) — toujours sourcer Steam/SteamSpy réel
  ou saisie manuelle admin explicite ; toute formule documentée ET tenue à jour dans `AppSetting.MCP_GUIDE`
- Si MCP injoignable et qu'une MAJ MCP_GUIDE/backfill est demandée : la faire en migration SQL versionnée,
  testée sur Postgres local réel, jamais en supposant les résultats
