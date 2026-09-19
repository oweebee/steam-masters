"use client";
import { useEffect, useState } from "react";

export default function AdminSettingsPage() {
  const [steamKey, setSteamKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then((d) => {
      setSteamKey(d.STEAM_API_KEY ?? "");
      setLoading(false);
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ STEAM_API_KEY: steamKey }),
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
          <button type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-lg transition">
            {saved ? "✓ Enregistré" : "Enregistrer"}
          </button>
        </form>
      )}
    </div>
  );
}
