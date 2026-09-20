"use client";
import { useEffect, useState } from "react";

type Joueur = { id: string; username: string; xp: number; cardCount: number; createdAt: string };

export function JoueursClient() {
  const [joueurs, setJoueurs] = useState<Joueur[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/joueurs")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setJoueurs(data);
        setLoaded(true);
      });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Joueurs</h1>
      <p className="text-gray-500 text-sm mb-6">
        {loaded ? `${joueurs.length} joueur(s)` : "Chargement…"}
      </p>

      <div className="border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-900 text-gray-400">
            <tr>
              <th className="px-4 py-3">Joueur</th>
              <th className="px-4 py-3">XP</th>
              <th className="px-4 py-3">Cartes</th>
              <th className="px-4 py-3">Membre depuis</th>
            </tr>
          </thead>
          <tbody>
            {joueurs.map((j) => (
              <tr key={j.id} className="border-t border-gray-800 hover:bg-gray-900/50">
                <td className="px-4 py-2 text-white font-medium">{j.username}</td>
                <td className="px-4 py-2 text-amber-400">{j.xp}</td>
                <td className="px-4 py-2 text-blue-400">{j.cardCount}</td>
                <td className="px-4 py-2 text-gray-500">{new Date(j.createdAt).toLocaleDateString("fr-FR")}</td>
              </tr>
            ))}
            {loaded && joueurs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  Aucun autre joueur pour l'instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
