UPDATE "AppSetting" SET value = value || $battle$

9. BATAILLES ASYNCHRONES (migration 0025, remplace les formules et questions du point 8)
- SteamGame.def et Studio.def restent les estimations SteamSpy reelles. La DEF de combat est uniquement celle du snapshot Battle : clamp(round(8000 + 250 * log10(max(1, ownerEstimate))), 8000, 10500).
- Degats de combat = 3500 + clamp(Card.atk, 0, 100) * 40. Objectif indicatif : 2 a 5 minutes d'actions cumulees, jusqu'a 6 pour un duel long, hors attente entre joueurs ; aucune duree reelle garantie.
- Les questions alternent strictement entre une carte du deck adverse et une carte du catalogue general, avec source initiale aleatoire. Le catalogue choisit un jeu ou un studio eligibles ; les reponses et les liens jeu/studio ne sont pas exposes dans l'API combat.
- Les nouveaux decks utilisent ces formules ; les batailles deja actives conservent leurs snapshots HP/ATK anterieurs pour ne pas corrompre leur progression.
$battle$, "updatedAt" = now() WHERE key = 'MCP_GUIDE';
INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES ('MCP_GUIDE_VERSION', '2026-09-24-battles-0025', now())
ON CONFLICT ("key") DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now();
