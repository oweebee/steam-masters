-- Remplace les ajouts historiques contradictoires par une source de vérité unique.
-- Le MCP PostgreSQL doit lire AppSetting.MCP_GUIDE avant toute modification métier.
INSERT INTO "AppSetting" (key, value, "updatedAt")
VALUES (
  'MCP_GUIDE',
  $guide$STEAM MASTERS — GUIDE MCP CANONIQUE
Version : 2026-09-22 / schéma attendu : migrations 0001 à 0023.
Ce texte REMPLACE toutes les versions antérieures. En cas de contradiction avec un ancien commentaire ou historique, ce guide et le schéma courant priment. Le code applicatif reste la source finale pour les transactions et validations.

1. RÔLE DU MCP ET SÉCURITÉ
- Le MCP donne un accès PostgreSQL direct. Toujours inspecter le schéma et les contraintes avant une écriture.
- Ne jamais modifier _prisma_migrations, les mots de passe, secrets, rôles admin ou soldes sans demande explicite.
- Toute évolution de schéma passe par une migration Prisma numérotée ; ne jamais faire dériver la production avec un ALTER manuel isolé.
- SteamGame et Studio sont le catalogue. Card est un EXEMPLAIRE appartenant à un joueur. Ne jamais confondre les raretés catalogue et exemplaire.
- Ne jamais inventer ATK/DEF/prix/statistiques/bio/logo. Les données catalogue proviennent de Steam/SteamSpy ou d'une saisie admin explicite.

2. SOURCES ET IMPORT DES JEUX
- SteamGame.id = AppID Steam sous forme de texte.
- name, description, headerImage, prix, gratuité et développeurs : Steam Store appdetails.
- reviewScore et SteamGame.atk : pourcentage réel d'avis positifs Steam.
- peakCcu : joueurs connectés au moment de la collecte ; ce n'est pas un pic historique.
- ownerEstimate et SteamGame.def : moyenne de la fourchette SteamSpy, source tierce non officielle.
- Un jeu avec ownerEstimate/def <= 0 est INÉLIGIBLE et doit être refusé ou purgé.
- Les appels Steam sont mis en cache Redis 30 minutes, limités dans le temps et retentés de façon bornée.
- Après tout ajout de jeu : synchroniser les studios concernés puis recalculer toute la rareté catalogue.

3. RARETÉ CATALOGUE — SteamGame.rarity / Studio.rarity
- Elle est recalculée globalement, elle n'est ni un tirage aléatoire figé ni un seuil fixe par jeu.
- Jeux et Studios sont réunis puis triés par score décroissant : reviewScore pour Jeu, avgReviewScore pour Studio. Les égalités sont départagées par id.
- Tranches cumulées de position : LEGENDARY jusqu'à round(total*0,005), EPIC jusqu'à round(total*0,055), RARE jusqu'à round(total*0,155), UNCOMMON jusqu'à round(total*0,355), COMMON ensuite.
- Ainsi, une note de 99% ne garantit pas LEGENDARY : seule la position relative dans tout le catalogue décide.
- Règle supplémentaire Studio : la tranche obtenue est un maximum, plafonné par le meilleur jeu réel du studio. LEGENDARY exige au moins un jeu à 98-100 ; EPIC 96-97 ; RARE 91-95 ; UNCOMMON 85-90 ; sinon COMMON.
- Ce plafond Studio peut seulement rétrograder, jamais promouvoir.
- Fonction de référence : recalculateCatalogRarity dans src/lib/catalogRarity.ts.

4. STUDIOS ET CHAMPS DÉRIVÉS
- Studio.name est unique et correspond au développeur Steam.
- gameCount, games, avgReviewScore, totalOwnerEstimate, atk et def sont recalculés depuis tous les SteamGame dont developers contient ce nom.
- Studio.atk = moyenne arrondie des reviewScore ; Studio.def = somme des ownerEstimate.
- Studio.about et Studio.avatarUrl sont les seuls champs éditables manuellement par admin.
- Ne jamais corriger manuellement un compteur Studio sans recalculer depuis SteamGame.

5. EXEMPLAIRES — Card.rarity / Card.atk
- Un booster est disponible toutes les heures et pioche uniformément une entrée du catalogue Jeu+Studio.
- Card.rarity est tirée indépendamment de la rareté catalogue, une fois à la création, puis figée sauf édition admin.
- Probabilités : LEGENDARY 0,5% ; EPIC 5% ; RARE 10% ; UNCOMMON 20% ; COMMON 64,5%.
- Plafonds mondiaux par jeu/studio et palier : LEGENDARY 1, EPIC 5, RARE 10, UNCOMMON 20, COMMON illimité.
- Si le palier est plein, rétrograder en cascade vers le palier suivant ; ne pas changer la carte catalogue tirée.
- Card.atk est tirée selon la rareté finale : LEGENDARY 98-100, EPIC 96-97, RARE 91-95, UNCOMMON 85-90, COMMON 0-84.
- Une Card doit avoir exactement un lien : gameId XOR studioId. Zéro ou deux liens = entrée incohérente.

6. IMAGES
- Les images servies aux cartes sont stockées dans StoredImage.data (BYTEA) avec mimeType.
- StoredImage.sourceUrl est une provenance interne seulement ; elle ne doit jamais être exposée comme image au client.
- SteamGame.headerImage = /api/images/game/[id]. Studio.avatarUrl = /api/images/studio/[id].
- Les nouveaux imports doivent appeler persistRemoteImage avant la création/mise à jour de la fiche.
- Les anciennes sources sont rapatriées au premier accès si data est encore NULL.

7. VENTE, ÉCHANGES ET MARCHÉ
- Vente directe de collection : 1 pièce par exemplaire supprimé, maximum 100 cartes, transaction Serializable. Interdit si échange PENDING ou enchère ACTIVE.
- Un échange peut contenir N cartes contre M cartes et des pièces de chaque côté. Aucun transfert à la création ; transfert atomique seulement à l'acceptation du destinataire.
- Le marché vend un exemplaire Card réel. Une carte ne peut pas être simultanément dans un échange PENDING et une enchère ACTIVE.
- Ne jamais déplacer, vendre ou supprimer une Card sans revalider le propriétaire et ses liens actifs dans la même transaction.

8. JOURNAL ET DIAGNOSTIC
- AppLog conserve pendant 30 jours les imports, découvertes Steam, synchronisations, réparations, images et erreurs.
- runId regroupe une exécution complète ; category et level permettent le filtrage. La page admin /admin/logs lit ces entrées.
- Une erreur d'écriture du journal ne doit jamais faire échouer l'opération métier.
- Pour diagnostiquer une importation figée : lire les AppLog les plus récents par runId, puis vérifier les derniers timestamps et détails.

9. RÈGLES DE TRAVAIL POUR UNE IA
- Avant écriture : lire ce guide, introspecter les tables concernées, compter les lignes visées et vérifier les contraintes/références.
- Pour une réparation massive : produire d'abord un diagnostic en lecture seule, puis agir dans une transaction et fournir les comptes avant/après.
- Ne jamais recalculer Card.rarity ou Card.atk lors d'un refresh catalogue.
- Ne jamais utiliser reviewScore comme garantie directe de couleur : la rareté catalogue dépend du rang global.
- Après import/suppression catalogue : recalculer Studios et raretés catalogue pour éviter les incohérences.
- Les fichiers CONTEXT.md et Suivi_IA_logs.md sont locaux et ne doivent pas être stockés dans Git ; le MCP ne doit pas prétendre les avoir lus.
$guide$,
  now()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "AppSetting" (key, value, "updatedAt")
VALUES ('MCP_GUIDE_VERSION', '2026-09-22-canonical-0023', now())
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  "updatedAt" = EXCLUDED."updatedAt";
