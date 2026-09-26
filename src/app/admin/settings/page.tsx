"use client";
import { useEffect, useState } from "react";

export default function AdminSettingsPage() {
  const [steamKey, setSteamKey] = useState("");
  const [openReg, setOpenReg] = useState(false);
  const [saved, setSaved] = useState(false);
  const [redistWorking, setRedistWorking] = useState(false);
  const [redistMsg, setRedistMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/settings?keys=STEAM_API_KEY,OPEN_REGISTRATION").then((r) => r.json()).then((d) => {
      setSteamKey(d.STEAM_API_KEY ?? "");
      setOpenReg(d.OPEN_REGISTRATION === "true");
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
      body: JSON.stringify({ STEAM_API_KEY: steamKey, OPEN_REGISTRATION: String(openReg) }),
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
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={openReg} onChange={(e) => setOpenReg(e.target.checked)}
                className="w-5 h-5 accent-amber-500 cursor-pointer" />
              <span className="text-gray-300 font-medium">Inscription directe (sans approbation admin)</span>
            </label>
            <p className="text-gray-500 text-xs mt-1">
              Si activé, les nouveaux comptes sont immédiatement <strong>ACTIVE</strong> au lieu de <strong>PENDING</strong>.
            </p>
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
