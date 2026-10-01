-- Garder les estimations SteamSpy brutes dans ownerEstimate et
-- totalOwnerEstimate ; seules les statistiques de carte sont compressees.
UPDATE "SteamGame"
SET def = LEAST(250, GREATEST(50, ROUND(50 + 25 * LOG(10::numeric, GREATEST(1, "ownerEstimate")))::integer));

UPDATE "Studio"
SET def = LEAST(250, GREATEST(50, ROUND(50 + 25 * LOG(10::numeric, GREATEST(1, "totalOwnerEstimate")))::integer));

UPDATE "AppSetting" SET value = value || $defense$

10. DEF DES CARTES (migration 0026, remplace les points anterieurs qui disaient DEF = ownerEstimate)
- SteamGame.ownerEstimate et Studio.totalOwnerEstimate conservent les estimations SteamSpy brutes, necessairement positives pour les jeux importes.
- SteamGame.def et Studio.def sont des points de jeu calcules par clamp(round(50 + 25 * log10(max(1, estimation))), 50, 250). Echelle fixe : 1 possesseur estime = 50 DEF, 100 millions ou plus = 250 DEF. Tous les imports et recalculs studio appliquent cette formule ; ne jamais ecraser la valeur brute.
$defense$, "updatedAt" = now() WHERE key = 'MCP_GUIDE';
INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES ('MCP_GUIDE_VERSION', '2026-09-24-defense-0026', now())
ON CONFLICT ("key") DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now();
