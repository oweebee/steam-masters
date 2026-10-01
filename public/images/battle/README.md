# Visuels de bataille

Créés avec l’outil intégré ImageGen le 2026-09-30, puis optimisés en WebP avec Sharp.

- `arena-generated.webp` : 1536×1024, 250 056 octets. Prompt : plateau de jeu steampunk original, cuir sombre dégagé au centre, cadre de laiton et cuivre, tubes cyan, sans texte ni cartes ni éléments de franchise.
- `phase-generated.webp` : 1200×400, 130 724 octets, transparence conservée. Prompt : plaque mécanique horizontale symétrique en laiton, ailes de cuivre et cristal cyan, centre émaillé vide, fond transparent, sans texte.
- `coin-generated.webp` : 512×512, transparence conservée. Prompt : pièce steampunk épaisse de trois quarts, tranche cylindrique crantée bien visible, laiton/cuivre et centre turquoise, sans texte ni logo. Lancer et rebond animés sans écraser sa tranche; annonce du premier joueur à l’atterrissage.

Les noms, scores et instructions sont du HTML accessible. Les animations sont des transformations CSS des images et cartes existantes. Aucun asset de Hearthstone n’est utilisé.

Dos des cartes : `card-back-generated.webp` (512×512), outil ImageGen intégré. Prompt : dos carré steampunk en relief, laiton brossé, cuir bleu nuit et noyau de verre cyan, lisible à petite taille, sans texte ni logo. Utilisé pour la main cachée et les retournements du replay.

Le plateau utilise désormais un fond uni anthracite à la demande de l’utilisateur. `arena-generated.webp` est conservé mais n’est plus affiché comme fond étiré.
