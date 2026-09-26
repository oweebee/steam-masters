"use client";
import { useState, useEffect, useCallback } from "react";

type AnnonceLog = {
  id: string;
  message: string;
  details: { content?: string; recipientCount?: number } | null;
  createdAt: string;
};

export default function AnnoncesPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; error?: string; recipientCount?: number } | null>(null);
  const [history, setHistory] = useState<AnnonceLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/annonces");
      if (res.ok) setHistory(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/annonces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, recipientCount: data.recipientCount });
        setTitle("");
        setContent("");
        loadHistory();
      } else {
        setResult({ error: data.error ?? "Erreur inconnue" });
      }
    } catch {
      setResult({ error: "Erreur réseau" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-300 mb-1">📢 Annonces</h1>
        <p className="text-gray-400 text-sm">
          Un message sera envoyé dans la boîte de réception de tous les joueurs actifs.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSend} className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Titre</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            placeholder="Ex: Maintenance programmée…"
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-amber-600 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Contenu</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={2000}
            required
            rows={5}
            placeholder="Corps de l'annonce…"
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-amber-600 text-sm resize-none"
          />
          <div className="text-right text-xs text-gray-500 mt-0.5">{content.length}/2000</div>
        </div>
        <button
          type="submit"
          disabled={sending || !title.trim() || !content.trim()}
          className="w-full py-2.5 rounded-lg font-semibold text-sm bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition"
        >
          {sending ? "Envoi en cours…" : "📤 Envoyer à tous les joueurs"}
        </button>
        {result && (
          <div className={`text-sm px-3 py-2 rounded-lg ${result.ok ? "bg-green-900/40 text-green-300 border border-green-700" : "bg-red-900/40 text-red-300 border border-red-700"}`}>
            {result.ok ? `✓ Annonce envoyée à ${result.recipientCount} joueurs` : `✕ ${result.error}`}
          </div>
        )}
      </form>

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Historique (50 dernières)</h2>
        {loading ? (
          <div className="text-gray-500 text-sm">Chargement…</div>
        ) : history.length === 0 ? (
          <div className="text-gray-600 text-sm italic">Aucune annonce envoyée.</div>
        ) : (
          <ul className="space-y-2">
            {history.map((log) => (
              <li key={log.id} className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-white text-sm">📢 {log.message}</span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
                {log.details?.content && (
                  <p className="text-gray-400 text-xs mt-1 line-clamp-2">{log.details.content}</p>
                )}
                {log.details?.recipientCount != null && (
                  <span className="text-xs text-amber-600 mt-1 block">{log.details.recipientCount} destinataires</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
