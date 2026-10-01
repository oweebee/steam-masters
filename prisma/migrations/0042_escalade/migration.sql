-- Existing matches keep their original rules and stakes.
ALTER TABLE "Battle" ADD COLUMN "escalationState" JSONB;
ALTER TABLE "Battle" ALTER COLUMN "rulesVersion" SET DEFAULT 3;
INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES (
 'MCP_GUIDE',
 E'\nESCALADE V3: New battles use identical tactical decks (ATK 2,2,3,4,5,6,7,8,9,10; DEF 8,12,15,18,22), independent of collection stats. First to win TWO rounds wins the match. Secret draft of five including a defense every round; 20 HP reset each round, first opener random then alternating. Best combo only: pair +3 or three consecutive values +5; one pierce of 4 if 2/3 included. Erosion subtracts raw+combo; pierce is temporary. Concede subtracts remaining raw attack sum from resistance, minimum zero damage. HP then highest remaining drafted attack decide round; residual tie gives no win and starts a new round. Discarded draft cards never count for tie-break. Automatic defender pass; no attacks causes automatic concede. No further defenses ends round. Stakes/rewards settled only at match end. escalationState is private server JSON: NEVER return enemy hand or raw state. Actions use revision and Serializable transactions. Legacy V1/V2 continue separately.',
 CURRENT_TIMESTAMP
) ON CONFLICT ("key") DO UPDATE SET "value" = "AppSetting"."value" || EXCLUDED."value", "updatedAt" = CURRENT_TIMESTAMP;
