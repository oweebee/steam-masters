"use client";
import { useEffect, useState } from "react";

export default function AdminSettingsPage() {
  const [steamKey, setSteamKey] = useState("");
  const [igdbClientId, setIgdbClientId] = useState("");
  const [igdbClientSecret, setIgdbClientSecret] = useState("");
  const [saved, setSaved] = useState(false);
  const [redistWorking, setRedistWorking] = useState(false);
  const [redistMsg, setRedistMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/settings?keys=STEAM_API_KEY,IGDB_CLIENT_ID,IGDB_CLIENT_SECRET").then((r) => r.json()).then((d) => {
      setSteamKey(d.STEAM_API_KEY ?? "");
      setIgdbClientId(d.IGDB_CLIENT_ID ?? "");
      setIgdbClientSecret(d.IGDB_CLIENT_SECRET ?? "");
      setLoading(false);
    });
  }, []);

  async function redist() {
    setRedistWorking(true); setRedistMsg("");
    const res = await fetch("/api/admin/consistency", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const data = await res.json();
    setRedistWorking(false);
    if (res.ok) setRedistMsg(`✓ ${data.gamesRarityFixed ?? 0} raretés catalogue corrigées · ${data.studiosUpserted ?? 0} studios · ${data.cardsRarityFixed ?? 0} cartes`);
    else setRedistMsg(`Erreur : ${data.error ?? "Inconnu"}`);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ STEAM_API_KEY: steamKey, IGDB_CLIENT_ID: igdbClientId, IGDB_CLIENT_SECRET: igdbClientSecret }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="flex items-center gap-4 mb-8">
        <a href="/admin" className="text-gray-400 hover:text-white">← Admin</a>
        <h1 className="text-2xl font-bold text-white">Configuration</h1>
      </div>
      {loading ? <p className="text-gray-400">Chargement…</p> : (
        <form onSubmit={save} className="max-w-xl space-y-6">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">Clé API Steam</label>
            <input
              type="password"
              value={steamKey}
              onChange={(e) => setSteamKey(e.target.value)}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
            <p className="text-gray-500 text-xs mt-1">
              Obtenir sur <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">steamcommunity.com/dev/apikey</a>
            </p>
          </div>
          <div className="border-t border-gray-800 pt-6">
            <label className="block text-gray-300 text-sm font-medium mb-2">IGDB — Client ID</label>
            <input
              type="text"
              value={igdbClientId}
              onChange={(e) => setIgdbClientId(e.target.value)}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm mb-4"
            />
            <label className="block text-gray-300 text-sm font-medium mb-2">IGDB — Client Secret</label>
            <input
              type="password"
              value={igdbClientSecret}
              onChange={(e) => setIgdbClientSecret(e.target.value)}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
            <p className="text-gray-500 text-xs mt-1">
              Depuis <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">dev.twitch.tv/console/apps</a>
            </p>
          </div>
          <div className="border-t border-gray-800 pt-6">
            <h2 className="text-gray-300 font-semibold mb-1">Sauvegarde complète</h2>
            <p className="text-gray-500 text-xs mb-3">
              Télécharge toute la base : réglages, joueurs, cartes, decks, combats, échanges, catalogue et images.
              Fichier <code>.dump</code> PostgreSQL (peut être volumineux). Contient les données de compte des joueurs : à garder en lieu sûr.
              Restauration : <code>pg_restore --clean --if-exists --no-owner -d &lt;DATABASE_URL&gt; fichier.dump</code>
            </p>
            <a href="/api/admin/backup" download className="inline-block rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600">⬇ Télécharger la sauvegarde</a>
          </div>
          <div className="border-t border-gray-800 pt-6">
            <h2 className="text-gray-300 font-semibold mb-1">Redistribution des raretés catalogue</h2>
            <p className="text-gray-500 text-xs mb-3">Recalcule les raretés de TOUS les jeux, DLC et studios selon leur popularité (ownerEstimate). Aucune donnée supprimée — seulement les raretés sont recalculées.</p>
            <button type="button" onClick={redist} disabled={redistWorking}
              className="bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-lg transition">
              {redistWorking ? "Recalcul en cours…" : "⚙ Recalculer toutes les raretés"}
            </button>
            {redistMsg && <p className="text-green-400 text-sm mt-2">{redistMsg}</p>}
          </div>
          <button type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-lg transition">
            {saved ? "✓ Enregistré" : "Enregistrer"}
          </button>
        </form>
      )}
    </div>
  );
}
