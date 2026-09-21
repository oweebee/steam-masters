-- MAJ AppSetting.MCP_GUIDE : documente Card.atk (ATK par exemplaire, lié à la
-- rareté déjà tirée — la logique/les taux de tirage de la rareté eux-mêmes
-- restent inchangés, voir migration 0009).
INSERT INTO "AppSetting" (key, value, "updatedAt")
VALUES (
  'MCP_GUIDE',
  E'\n\n--- MAJ 2026-09-21 (suite) : ATK par exemplaire de carte ---\n' ||
  E'Card.atk (nouveau champ) != SteamGame.atk / Studio.atk (catalogue, inchangé).\n' ||
  E'Roulé UNE FOIS au pull booster dans une bande liée à Card.rarity DÉJÀ tirée (taux/plafonds de\n' ||
  E'tirage de la rareté INCHANGÉS, voir bloc précédent) :\n' ||
  E'  LEGENDARY (Orange) -> ATK 98-100\n' ||
  E'  EPIC (Violet) -> ATK 96-97\n' ||
  E'  RARE (Bleu) -> ATK 91-95\n' ||
  E'  UNCOMMON (Vert) -> ATK 85-90\n' ||
  E'  COMMON (Blanc) -> ATK 0-84\n' ||
  E'Figé ensuite comme rarity, modifiable ensuite UNIQUEMENT par un admin via PATCH\n' ||
  E'/api/admin/instances/[id] (atk explicite, ou re-roll auto dans la nouvelle bande si la rareté change).\n',
  now()
)
ON CONFLICT (key) DO UPDATE SET
  value = "AppSetting".value || EXCLUDED.value,
  "updatedAt" = now();
