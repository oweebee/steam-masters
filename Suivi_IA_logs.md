# Suivi_IA_logs.md — Steam Masters
> État actuel condensé. Remplacer à chaque fin de tâche.

## État (2026-09-21)
**14 commits locaux (device) prêts, PAS ENCORE PUSHÉS — user doit lancer `push.bat`, PUIS `prisma migrate deploy`
côté serveur (migrations 0004 à 0008 en attente : prix jeu, jeux studio, about/avatar studio, jetons trade,
rareté par exemplaire).** Vérifier par requête réelle (MCP/curl) plutôt que supposer un push fait.

Derniers commits (du plus ancien au plus récent) : `5772da7` (MCP sous-domaine), `4b8ca85` (admin/cards v1,
DEF=ownerEstimate), `ba11338` (sidebar repliable v1, jamais arrivée en prod), `1b27deb` (autocomplete import),
`1bb5ec2` (flip card v1 + prix), `8406a1f`/`ec6fd56` (toutes-les-cartes publique, liens studio→jeu,
about/avatar studio), `4add2a4` (fix flip qui disparaissait), `6d06af4` (PWA), `33284ef` (sidebar repliable
réelle + repliée par défaut, page Joueurs remplace Amis), `c3fc381` (système d'échange), `f2d1fb6` (onglets
admin), `35e20d7` (refonte rareté par exemplaire), `54b32e6` (plafonds par palier de rareté).

## MCP Postgres — état 2026-09-21 : INJOIGNABLE (timeout)
Précédemment opérationnel et utilisé avec succès (import 153 jeux + 141 studios). Depuis peu :
`https://steammasters-mcp.obsidianspoon.com/sse` timeout/503. À vérifier en premier au prochain chat —
probablement lié au VPS ou au redeploy en attente. **MCP_GUIDE (AppSetting) et backfill des cartes
existantes (rareté + games[] studio + priceCents jeu) sont EN ATTENTE de MCP disponible.**

## Mécanique cartes — refonte majeure 2026-09-21 (voir CONTEXT.md pour le détail)
Deux raretés distinctes : celle du jeu/studio (catalogue, intrinsèque, basée ownerEstimate, INCHANGÉE) et
celle de CHAQUE exemplaire de carte (`Card.rarity`, loot table au tirage, figée, admin peut la forcer) :
Orange 0,5% (plafond 1/jeu-studio, tous joueurs confondus) / Violet 5% (plafond 5) / Bleu 10% (plafond 10) /
Vert 20% (plafond 20) / Blanc reste (illimité). Cartes plus uniques par défaut (migration 0008 a supprimé
`@@unique([gameId/studioId])`). Booster pioche uniformément tout le catalogue, roule la rareté, redescend
d'un cran si le palier est plafonné pour ce jeu/studio précis. **Les ~155 Card déjà en base (avant cette
migration) ont `rarity=COMMON` par défaut — backfill à faire via MCP dès qu'il est joignable, avec le même
algorithme de tirage.**

## Système d'échange (Trade) — déployé, jamais testé en prod
`/echanges` : proposer N cartes (0 possible) contre M cartes (0 possible) + jetons optionnels des deux côtés
à un joueur choisi. Le destinataire accepte (transaction atomique, re-vérifie tout) ou refuse. Historique.
Schema Trade/TradeCard préexistant, ajout `offerCoins`/`wantCoins`/`resolvedAt` (migration 0007).

## Joueurs / PWA / UI — déployés (code), jamais vérifiés visuellement en prod
- `/joueurs` remplace `/amis` (liste publique tous users, pas de système de demande) ; `/amis` redirige.
- Sidebar réellement repliable, repliée par défaut (persisté localStorage) — la version "repliable" d'un
  commit antérieur (`ba11338`) n'était en fait jamais arrivée sur origin/main, corrigé.
- PWA : manifest.json, sw.js (cache app-shell, jamais l'API), icônes générées (placeholder "SM"), installable.
- Onglets de navigation admin (`AdminTabs.tsx` + `admin/layout.tsx`) sur toutes les pages `/admin/*`.
- Carte 3D flip unifiée dans `FlipCard.tsx` (un seul composant pour GameCard/StudioCard) — 2 bugs corrigés :
  badge visible au dos (fix `visibility` + `backfaceVisibility`), carte qui disparaissait au milieu de
  l'animation (délai de bascule `visibility` devait être FIXE 0,25s dans les deux sens, pas conditionné par
  le sens du flip).

## Studio.about / Studio.avatarUrl — déployé (migration 0006)
Saisie manuelle admin (aucune API Steam/SteamSpy ne fournit bio/logo studio) via `/admin/cards`. 8 logos
réels intégrés par recherche web + vérification HTTP (Wikimedia Commons/Wikipedia `Special:FilePath`,
content-type image/* + 200 obligatoires avant écriture) : Valve, Rockstar North, Treyarch, Respawn, CAPCOM,
Infinity Ward, Pocketpair, Raven Software. 133 studios restants sans avatar (icône 🏢 par défaut) —
continuer par lots sur demande, coûteux en recherches une par une.

## TODO immédiat (ordre)
1. **User : push.bat**, puis `prisma migrate deploy` côté serveur (5 migrations en attente : 0004→0008)
2. Dès MCP dispo : backfill rareté des ~155 Card existantes (même algorithme loot table) + `games[]` Studio
   + `priceCents`/`isFree` SteamGame + MAJ `AppSetting.MCP_GUIDE` (nouveaux champs/mécaniques ci-dessus)
3. Vérification visuelle réelle en prod : flip card, sidebar repliable, PWA installable, échanges, joueurs
4. Continuer la recherche de logos studio par lots (133 restants) si demandé
5. Gaps de game design non tranchés (voir liste dédiée ci-dessous)

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
- Pas de shadow DB Postgres locale → `prisma migrate diff --from-empty` si besoin de régénérer une migration
- npm install cassé sur le device Windows local → toujours valider un build sur clone cloud avant commit/push
- Device Windows sans credential helper git → committer via device_bash, laisser l'user lancer push.bat
- Un service MCP en transport SSE ne peut PAS être routé par sous-chemin sur un domaine partagé
- Le clone cloud `/tmp/steam-masters` est parfois remis à `origin/main` (reset --hard) → vérifier après coup
  que les features précédentes (fichiers trackés modifiés non encore pushés) sont toujours là
- `device_commit_files` peut occasionnellement écrire un contenu périmé sans le signaler en erreur (vu le
  2026-09-21 : deux fichiers rarityRoll.ts/booster non mis à jour malgré un retour "written" success) —
  **toujours revérifier le contenu réel côté device après un commit_files sur un fichier déjà modifié
  plusieurs fois dans le même tour**, retenter avec `force: true` si divergence
- Ne jamais fabriquer de donnée (atk/def/rarity/prix/bio/logo studio) — toujours sourcer Steam/SteamSpy réel
  ou saisie manuelle admin explicite ; toute formule documentée ET tenue à jour dans `AppSetting.MCP_GUIDE`
