export type ChangelogPost = {
  slug: string;
  date: string;
  category: "Magasin" | "Collection" | "Bataille" | "Classement" | "Application" | "Catalogue";
  title: string;
  summary: string;
  details: string[];
};

// Un changement majeur = un objet/post autonome. Toujours ajouter le nouveau post en tête.
export const CHANGELOG_POSTS: ChangelogPost[] = [
  {
    slug: "combat-des-tueurs",
    date: "2026-10-02",
    category: "Bataille",
    title: "Les Dés tueurs entrent dans l’arène",
    summary: "Le menu Bataille accueille un second duel asynchrone fondé sur le Killer à cinq dés.",
    details: ["Les lancers, dés gardés, attaques et dégâts sont enregistrés côté serveur pour reprendre la partie à tout moment.", "Tous les joueurs voient les mêmes dés sur un plateau pixel art en 2D; chaque total, calcul et prochaine action est expliqué simplement.", "Un entraînement sans mise permet d’affronter lentement l’Automate avec le même moteur avant de défier un joueur."],
  },
  {
    slug: "magasin-cadence-configurable",
    date: "2026-10-01",
    category: "Magasin",
    title: "La cadence du magasin devient configurable",
    summary: "L’administration peut désormais régler chaque rotation mondiale entre 1 et 24 heures.",
    details: ["Le nouveau curseur affiche précisément la durée choisie et la rotation active conserve son heure de fin.", "La cadence enregistrée s’applique à la rotation suivante ou immédiatement lors d’une relance manuelle."],
  },
  {
    slug: "installation-pwa-mobile",
    date: "2026-10-01",
    category: "Application",
    title: "Installation mobile proposée au bon moment",
    summary: "Sur téléphone, Steam Masters propose maintenant son installation comme application sans harceler les joueurs qui préfèrent attendre.",
    details: ["Android et les navigateurs compatibles utilisent l’invite d’installation native.", "Sur iPhone et les autres navigateurs mobiles, la popup explique les étapes; elle disparaît dans la PWA installée et attend 7 jours après un refus."],
  },
  {
    slug: "centre-mes-recompenses",
    date: "2026-10-01",
    category: "Classement",
    title: "Un espace personnel pour récupérer ses récompenses",
    summary: "Le menu accueille une page Mes récompenses avec le nombre de gains en attente et leur récupération en gigapuissances.",
    details: ["Le badge du menu indique uniquement tes récompenses non récupérées.", "La page dédiée sépare gains disponibles, objectifs en progression, objectifs non commencés et historique; un bouton d’information explique chaque condition et les récompenses des autres joueurs restent privées."],
  },
  {
    slug: "classement-recompenses-paliers",
    date: "2026-10-01",
    category: "Classement",
    title: "Des récompenses conçues pour durer",
    summary: "Les objectifs exigeants du classement peuvent être réclamés une fois, de 20 à 5 000 gigapuissances selon leur difficulté réelle.",
    details: ["Les objectifs triviaux et les catalogues à une seule carte ne distribuent plus de gigapuissances.", "Les petits catalogues demandent 100 %, les paliers intermédiaires sont réservés aux collections profondes et l’attribution reste sécurisée côté serveur."],
  },
  {
    slug: "navigation-cartes-zoom-liens",
    date: "2026-10-01",
    category: "Collection",
    title: "Retournement des cartes et fiches liées mieux séparés",
    summary: "Le clic sur une carte garde son retournement 3D, tandis qu’un lien Studio, jeu ou version fait sortir une fiche zoomée depuis le lien.",
    details: ["Les fiches liées peuvent s’empiler sans quitter la partie en cours.", "Croix, Échap et clic extérieur ferment seulement la dernière fiche."],
  },
  {
    slug: "menu-personnel-pwa",
    date: "2026-10-01",
    category: "Application",
    title: "Le menu s’organise selon tes préférences",
    summary: "Les boutons du menu gauche peuvent être montés ou descendus et leur ordre est enregistré sur ton compte.",
    details: ["Le classement choisi reste identique après reconnexion.", "La barre de navigation PWA reprend automatiquement le même ordre."],
  },
  {
    slug: "magasin-offre-ciblee-copies-illimitees",
    date: "2026-10-01",
    category: "Magasin",
    title: "Alertes précises et exemplaires sans limite globale",
    summary: "Une alerte de carte suivie ouvre maintenant la carte seule avec achat direct, et un même jeu ou studio peut retomber sans plafond global.",
    details: ["La popup affiche le prix, le solde et le bouton d’achat sans ouvrir la grille du magasin.", "Les cartes déjà possédées ne limitent jamais un nouveau tirage; seule la répartition du nouveau lot est appliquée."],
  },
  {
    slug: "informations-changelog",
    date: "2026-10-01",
    category: "Application",
    title: "Un centre d’informations dans le menu",
    summary: "Les évolutions importantes de Steam Masters sont désormais regroupées dans une page dédiée, sans notification ni compteur.",
    details: ["Chaque changement majeur possède son propre post daté.", "Les nouveautés les plus récentes apparaissent en premier."],
  },
  {
    slug: "magasin-repartition-raretes",
    date: "2026-10-01",
    category: "Magasin",
    title: "Une rotation mieux répartie par rareté",
    summary: "Les 50 offres du magasin visent maintenant les pourcentages de rareté configurés, avec un objectif d’au moins une carte légendaire.",
    details: ["Les quotas impossibles à cause de l’éligibilité catalogue sont redistribués vers les raretés disponibles.", "Les collections des joueurs et les anciennes offres ne modifient jamais la nouvelle rotation."],
  },
  {
    slug: "suivre-depuis-fiches",
    date: "2026-10-01",
    category: "Collection",
    title: "Suivre une carte depuis toutes ses fiches",
    summary: "Une carte Jeu, DLC ou Studio absente de ta collection peut être suivie directement depuis sa fiche ou une fenêtre de versions.",
    details: ["Le bouton permet aussi d’arrêter immédiatement le suivi.", "Une carte suivie présente dans une nouvelle rotation du magasin déclenche l’alerte déjà prévue par le système de suivi."],
  },
  {
    slug: "bataille-nouveau-rythme",
    date: "2026-09-30",
    category: "Bataille",
    title: "Les duels gagnent en rythme et en lisibilité",
    summary: "L’ouverture, les changements de tour, les actions adverses et la fin du duel disposent maintenant de transitions dédiées.",
    details: ["Les cartes jouées par l’adversaire sont révélées dans l’ordre sans dévoiler sa main.", "Le résultat attend le dernier impact et reste accessible sur les petits écrans."],
  },
  {
    slug: "magasin-mondial",
    date: "2026-09-30",
    category: "Magasin",
    title: "Ouverture du magasin mondial",
    summary: "Une rotation commune à tous les joueurs propose 50 cartes différentes pendant la durée configurée par l’administration.",
    details: ["Les prix sont tirés dans les fourchettes définies par rareté.", "Une offre achetée disparaît du stock commun et un administrateur peut relancer une rotation."],
  },
  {
    slug: "classement-collectionneurs",
    date: "2026-09-30",
    category: "Classement",
    title: "Le classement des collectionneurs arrive",
    summary: "Les collections rapportent des points selon leurs raretés, leurs progressions et leurs combinaisons.",
    details: ["Les bonus progressent par tiers pour les plateformes, DLC et studios.", "Le détail d’un joueur explique chaque source de points et le prochain objectif."],
  },
  {
    slug: "notifications-pwa-web",
    date: "2026-09-30",
    category: "Application",
    title: "Notifications Web et PWA",
    summary: "Chaque appareil peut recevoir les alertes Steam Masters dans la PWA mobile ou un navigateur PC compatible.",
    details: ["L’activation reste volontaire dans les paramètres.", "Un clic sur une notification ouvre directement la page concernée."],
  },
  {
    slug: "import-igdb-plateformes",
    date: "2026-09-30",
    category: "Catalogue",
    title: "Sélection directe des plateformes IGDB",
    summary: "L’administration choisit maintenant la plateforme à scanner directement depuis le tableau de comptage.",
    details: ["La ligne active est mise en évidence.", "Le menu déroulant séparé a été supprimé."],
  },
];
