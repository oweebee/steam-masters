import Link from "next/link";

export const metadata = { title: "Aide — Steam Masters" };

export default function AidePage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-200 p-6 sm:p-10 max-w-2xl mx-auto">
      <div className="mb-8">
        <Link href="/" className="text-gray-400 hover:text-amber-400 text-sm transition">← Accueil</Link>
      </div>

      <h1 className="text-3xl font-bold text-amber-400 mb-2">Aide &amp; Règles</h1>
      <p className="text-gray-400 text-sm mb-10">Comment jouer à Steam Masters ?</p>

      <section className="space-y-8">
        <div className="bg-gray-900 border border-amber-900/40 rounded-2xl p-6">
          <h2 className="text-amber-300 font-bold text-lg mb-3">🎴 Les cartes</h2>
          <p className="text-sm leading-relaxed">Chaque carte représente un jeu ou un studio de jeux. Les cartes ont une <strong className="text-white">rareté</strong> (du blanc au légendaire orange) et des stats : <strong className="text-white">ATK</strong> (attaque) et <strong className="text-white">DEF</strong> (défense). Plus un jeu est populaire, plus sa carte est rare !</p>
        </div>

        <div className="bg-gray-900 border border-amber-900/40 rounded-2xl p-6">
          <h2 className="text-amber-300 font-bold text-lg mb-3">📦 Les boosters</h2>
          <p className="text-sm leading-relaxed">Tu peux ouvrir un booster toutes les heures pour recevoir 5 cartes aléatoires. Plus tu joues, plus tu débloque des chances d'obtenir des cartes rares. Les boosters s'accumulent si tu ne les ouvres pas (jusqu'à 5 en réserve).</p>
        </div>

        <div className="bg-gray-900 border border-amber-900/40 rounded-2xl p-6">
          <h2 className="text-amber-300 font-bold text-lg mb-3">⚔️ Les batailles</h2>
          <p className="text-sm leading-relaxed">Défie d'autres joueurs ! Chaque bataille se déroule en 6 manches. Tu choisis une carte, ton adversaire aussi — et les stats décident du vainqueur. Bonne stratégie !</p>
        </div>

        <div className="bg-gray-900 border border-amber-900/40 rounded-2xl p-6">
          <h2 className="text-amber-300 font-bold text-lg mb-3">🔄 Les échanges &amp; le marché</h2>
          <p className="text-sm leading-relaxed">Tu peux proposer des échanges avec d'autres joueurs directement depuis leur bibliothèque. Sur le <strong className="text-white">Marché</strong>, tu peux mettre des cartes aux enchères et en acheter d'autres avec tes pièces.</p>
        </div>

        <div className="bg-gray-900 border border-amber-900/40 rounded-2xl p-6">
          <h2 className="text-amber-300 font-bold text-lg mb-3">🏷️ Mes collections</h2>
          <p className="text-sm leading-relaxed">Organise tes cartes avec des <strong className="text-white">catégories privées</strong> que toi seul peux voir. Tu peux nommer et coloriser chaque catégorie, et y placer plusieurs cartes à la fois.</p>
        </div>

        <div className="bg-gray-900 border border-green-900/40 rounded-2xl p-6">
          <h2 className="text-green-400 font-bold text-lg mb-3">✉️ Contacter oweebee</h2>
          <p className="text-sm leading-relaxed mb-4">Un problème, une idée ou juste envie de dire bonjour ? Envoie un message directement.</p>
          <Link
            href="/messages?to=oweebee"
            className="inline-block bg-amber-600 hover:bg-amber-500 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm"
          >
            ✉ Envoyer un message à oweebee
          </Link>
        </div>
      </section>
    </main>
  );
}
