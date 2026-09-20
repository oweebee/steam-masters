import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <h1 className="text-3xl font-bold text-white mb-8">Console Admin</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
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
      </div>
    </div>
  );
}
