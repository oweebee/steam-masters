import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatBytes(value: bigint | number) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 o";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** index;
  return `${amount.toLocaleString("fr-FR", { maximumFractionDigits: index === 0 ? 0 : 1 })} ${units[index]}`;
}

export default async function AdminPage() {
  const [gameCount, dlcCount, studioCount, cardCount, storedImageCount, storedImageBytes, invalidGames, invalidCardLinks, databaseSize] = await Promise.all([
    prisma.steamGame.count({ where: { contentType: "GAME" } }),
    prisma.steamGame.count({ where: { contentType: "DLC" } }),
    prisma.studio.count(),
    prisma.card.count(),
    prisma.storedImage.count({ where: { data: { not: null } } }),
    prisma.$queryRaw<Array<{ bytes: bigint }>>`SELECT COALESCE(SUM(octet_length("data")), 0)::bigint AS bytes FROM "StoredImage"`,
    prisma.steamGame.count({ where: { def: { lte: 0 } } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Card"
      WHERE ("gameId" IS NULL AND "studioId" IS NULL)
         OR ("gameId" IS NOT NULL AND "studioId" IS NOT NULL)
    `,
    prisma.$queryRaw<Array<{ bytes: bigint }>>`SELECT pg_database_size(current_database())::bigint AS bytes`,
  ]);
  const catalogCardCount = gameCount + dlcCount + studioCount;
  const errorCount = invalidGames + Number(invalidCardLinks[0]?.count ?? BigInt(0));

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <h1 className="text-3xl font-bold text-white mb-8">Console Admin</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
        <Link href="/admin/users"
          className="bg-gray-900 border border-gray-800 hover:border-blue-500 rounded-xl p-6 text-white transition">
          <div className="text-2xl mb-2">👥</div>
          <div className="font-semibold">Gestion des utilisateurs</div>
          <div className="text-gray-400 text-sm mt-1">Approuver, rejeter, promouvoir</div>
        </Link>
        <Link href="/admin/settings"
          className="bg-gray-900 border border-gray-800 hover:border-blue-500 rounded-xl p-6 text-white transition">
          <div className="text-2xl mb-2">⚙️</div>
          <div className="font-semibold">Configuration</div>
          <div className="text-gray-400 text-sm mt-1">Clé API Steam, paramètres app</div>
        </Link>
        <Link href="/admin/cards"
          className="bg-gray-900 border border-gray-800 hover:border-blue-500 rounded-xl p-6 text-white transition">
          <div className="text-2xl mb-2">🗂️</div>
          <div className="font-semibold">Toutes les cartes</div>
          <div className="text-gray-400 text-sm mt-1">Recherche, tri, statut de réclamation</div>
        </Link>
        <Link href="/admin/games"
          className="bg-gray-900 border border-gray-800 hover:border-blue-500 rounded-xl p-6 text-white transition">
          <div className="text-2xl mb-2">🎮</div>
          <div className="font-semibold">Import de jeux</div>
          <div className="text-gray-400 text-sm mt-1">Ajouter un jeu Steam par AppID</div>
        </Link>
        <Link href="/admin/logs"
          className="bg-gray-900 border border-gray-800 hover:border-amber-600 rounded-xl p-6 text-white transition">
          <div className="text-2xl mb-2">📜</div>
          <div className="font-semibold">Journal de l’application</div>
          <div className="text-gray-400 text-sm mt-1">Imports, synchronisations, erreurs et progression</div>
        </Link>
        <section className="md:col-span-2 overflow-hidden rounded-xl border border-amber-800/60 bg-[linear-gradient(135deg,#1b1510_0%,#111827_58%,#16100c_100%)] text-white shadow-[inset_0_1px_0_rgba(251,191,36,.14),0_12px_30px_rgba(0,0,0,.25)]">
          <div className="flex items-center gap-3 border-b border-amber-900/50 px-6 py-4">
            <span className="text-2xl" aria-hidden="true">🗄️</span>
            <div>
              <h2 className="font-semibold">Base de données</h2>
              <p className="text-sm text-amber-100/55">État réel du catalogue et du stockage PostgreSQL</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-amber-900/30 md:grid-cols-4">
            {[
              [catalogCardCount.toLocaleString("fr-FR"), "cartes catalogue"],
              [cardCount.toLocaleString("fr-FR"), "exemplaires joueurs"],
              [formatBytes(databaseSize[0]?.bytes ?? BigInt(0)), "taille totale"],
              [errorCount.toLocaleString("fr-FR"), "entrées en erreur"],
              [gameCount.toLocaleString("fr-FR"), "cartes Jeu"],
              [dlcCount.toLocaleString("fr-FR"), "cartes DLC"],
              [studioCount.toLocaleString("fr-FR"), "cartes Studio"],
              [storedImageCount.toLocaleString("fr-FR"), "images en base"],
              [formatBytes(storedImageBytes[0]?.bytes ?? BigInt(0)), "poids des images"],
            ].map(([value, label]) => (
              <div key={label} className="bg-gray-950/80 px-4 py-4 text-center">
                <div className={`font-mono text-xl font-bold ${label === "entrées en erreur" && errorCount > 0 ? "text-red-400" : "text-amber-400"}`}>{value}</div>
                <div className="mt-1 text-xs uppercase tracking-wide text-gray-400">{label}</div>
              </div>
            ))}
          </div>
          <p className="px-6 py-3 text-xs text-gray-500">Erreurs = jeux avec DEF ≤ 0 ou exemplaires liés à zéro/deux fiches catalogue.</p>
        </section>
      </div>
    </div>
  );
}
