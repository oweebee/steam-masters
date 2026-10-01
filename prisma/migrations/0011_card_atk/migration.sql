-- ATK propre à chaque exemplaire de carte (Card.atk), roulé dans la bande % de
-- sa rareté au pull (même logique que rarity : fixé, modifiable admin seulement).
-- Ne touche pas SteamGame.atk/Studio (catalogue, inchangé) ni la logique de
-- tirage de la rareté elle-même (rollCardRarity/RARITY_CAP inchangés).
ALTER TABLE "Card" ADD COLUMN "atk" INTEGER NOT NULL DEFAULT 0;
