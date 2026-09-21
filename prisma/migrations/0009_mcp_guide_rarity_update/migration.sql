-- MAJ AppSetting.MCP_GUIDE : documente le nouveau système de rareté par exemplaire
-- (loot table + plafonds), la suppression de l'unicité des cartes, et les champs
-- Studio.about/avatarUrl/games. Idempotent (ON CONFLICT), ne touche rien d'autre.
INSERT INTO "AppSetting" (key, value, "updatedAt")
VALUES (
  'MCP_GUIDE',
  E'\n\n--- MAJ 2026-09-21 : rareté par exemplaire de carte ---\n' ||
  E'Card.rarity != SteamGame.rarity / Studio.rarity (catalogue, intrinsèque, ownerEstimate, INCHANGÉ).\n' ||
  E'Card.rarity est tirée UNE FOIS au pull booster via une loot table fixe, puis figée :\n' ||
  E'  LEGENDARY (Orange) 0.5% - plafond 1 par jeu/studio, tous joueurs confondus (unique sur toute la partie)\n' ||
  E'  EPIC (Violet) 5% - plafond 5 par jeu/studio\n' ||
  E'  RARE (Bleu) 10% - plafond 10 par jeu/studio\n' ||
  E'  UNCOMMON (Vert) 20% - plafond 20 par jeu/studio\n' ||
  E'  COMMON (Blanc) reste (~64.5%) - illimité\n' ||
  E'Si le palier tiré est déjà plafonné pour ce jeu/studio précis, redescend d''un cran (jamais de changement\n' ||
  E'de jeu/studio). Catégorie "gris" jamais implémentée, ne pas l''ajouter. Modifiable ensuite UNIQUEMENT par\n' ||
  E'un admin via PATCH /api/admin/instances/[id]. Cartes plus uniques par défaut (contrainte @@unique retirée\n' ||
  E'en migration 0008) : un même jeu/studio peut être tiré par plusieurs joueurs ou plusieurs fois.\n' ||
  E'Studio.about (texte libre) et Studio.avatarUrl (logo) : saisie manuelle admin uniquement, aucune API\n' ||
  E'Steam/SteamSpy ne les fournit — ne jamais fabriquer une URL non vérifiée (HTTP 200 + content-type image/*).\n' ||
  E'Studio.games : liste de noms de jeux du studio, résolue en liens cliquables vers les cartes existantes.\n',
  now()
)
ON CONFLICT (key) DO UPDATE SET
  value = "AppSetting".value || EXCLUDED.value,
  "updatedAt" = now();
