/**
 * Script one-shot : marque tous les bug reports OUVERTS comme RESOLVED avec réponse.
 * Usage : npx tsx scripts/resolve-bugs.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REPLIES: Record<string, { title: string; reply: string }> = {
  cmuhke6fs039qzoe4gpeyf58x: {
    title: "Placement carte décalée (mobile PWA)",
    reply: "✅ Corrigé ! La carte ouverte ne déborde plus à droite sur mobile/PWA. Le padding de la vue principale est maintenant écrasé en mode compact pour les petits écrans.",
  },
  cmuhki4f303dbzoe4pbtafaap: {
    title: "Ouverture carte — overlay mal positionné",
    reply: "✅ Corrigé ! L'overlay de carte utilise désormais un portail React attaché directement à `document.body`, ce qui évite qu'il soit capturé par le parent transformé en PWA mobile.",
  },
  cmuhkju3g03f3zoe4beiabe3t: {
    title: "Liens studio cassés",
    reply: "✅ Corrigé ! La page `/studios/[name]` existe maintenant et affiche la StudioCard complète. L'API `/api/studios/info?name=X` a été créée pour alimenter cette page.",
  },
  cmuhkqtx403lxzoe47zop559r: {
    title: "Tags — renvoient au dos de la carte",
    reply: "✅ Corrigé ! Les tags de la carte renvoient maintenant vers le dos de la carte (filtre de catégorie dans la collection) sans retourner la carte elle-même.",
  },
  cmuhkxlq503shzoe4515dyol9: {
    title: "Catégories — couleur brute peu pratique",
    reply: "✅ Amélioré ! Le sélecteur de couleur brut est remplacé par une palette de 20 couleurs steampunk prédéfinies + un input couleur libre. Plus ergonomique et cohérent visuellement.",
  },
  cmui4zggq000ou4x35by05d0t: {
    title: "Menu — lien profil cassé",
    reply: "✅ Corrigé ! Les liens de navigation PWA sont à jour et fonctionnels.",
  },
  cmui7dfsw0002nmnhaop6neut: {
    title: "Liens cassés vers studios/jeux",
    reply: "✅ Corrigé ! La page `/studios/[name]` est opérationnelle. Les cartes de studio mènent maintenant à une page dédiée sans 404.",
  },
  cmui750qq00g6u4x3jh9ihb2l: {
    title: "Filtre collection — pas de filtre par type",
    reply: "✅ Implémenté ! Le filtre par type (Jeux / DLC / Studios) est disponible dans la collection, à côté des filtres existants. Tu peux aussi combiner avec les filtres de catégorie et de rareté.",
  },
  cmui7h7qn0005nmnh5qt4mvcm: {
    title: "Page d'aide inexistante",
    reply: "✅ Créé ! La page `/aide` est disponible via l'icône dans le menu de navigation. Elle couvre les cartes, les boosters, les batailles, les échanges et les catégories.",
  },
  cmui7rvjo000bnmnhi1d371t2: {
    title: "Menu PWA — icônes trop petites",
    reply: "✅ Corrigé ! Les icônes du menu PWA sont maintenant 60 % plus grandes, le texte passe à 10px, et le menu supporte le scroll horizontal pour les petits écrans.",
  },
  cmui7zo4i01ownmnh6ith4l4y: {
    title: "Redistribution des raretés manquante",
    reply: "✅ Implémenté ! Un bouton « Recalculer toutes les raretés » est disponible dans les paramètres d'administration. Il déclenche un recalcul complet du catalogue.",
  },
  cmui8in1n03cinmnhuv636cxq: {
    title: "Approbation manuelle des inscriptions",
    reply: "✅ Implémenté ! Un toggle « Inscription directe » est disponible dans les paramètres d'admin. Désactivé = les nouveaux comptes passent en statut PENDING (approbation manuelle). Activé = les comptes sont directement ACTIVE.",
  },
  cmui7oflv0008nmnhhviwxzmu: {
    title: "Alertes / notifications",
    reply: "✅ Implémenté ! Le système d'alertes est maintenant en ligne : icône phare (🏮) dans le menu avec badge de compteur non-lus, page `/alertes` dédiée, notifications automatiques pour les messages et les défis de bataille.",
  },
};

async function main() {
  console.log("Fetching all bug reports...");
  const reports = await prisma.bugReport.findMany({
    select: { id: true, status: true, updatedAt: true },
  });

  console.log(`Found ${reports.length} reports`);

  for (const report of reports) {
    const fix = REPLIES[report.id];
    if (!fix) {
      console.log(`  [SKIP] ${report.id} — no reply defined`);
      continue;
    }

    await prisma.bugReport.update({
      where: { id: report.id },
      data: {
        status: "RESOLVED",
        adminReply: fix.reply,
        adminNote: `Traité automatiquement le ${new Date().toLocaleDateString("fr-FR")}.`,
      },
    });
    console.log(`  [OK]   ${report.id} → RESOLVED`);
  }

  console.log("Done.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
