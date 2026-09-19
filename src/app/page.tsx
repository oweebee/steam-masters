import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 text-center">
      <h1 className="text-5xl font-bold text-white mb-4">Steam<span className="text-blue-500">Masters</span></h1>
      <p className="text-gray-400 text-lg mb-8">Collectionnez, duels, enchères — basé sur la bibliothèque Steam.</p>
      <div className="flex gap-4">
        <Link href="/signup" className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl transition">
          S'inscrire
        </Link>
        <Link href="/login" className="bg-gray-800 hover:bg-gray-700 text-white font-semibold px-6 py-3 rounded-xl transition">
          Se connecter
        </Link>
      </div>
    </div>
  );
}
