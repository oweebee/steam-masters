"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type LogEntry = {
  id: string;
  runId: string | null;
  category: string;
  level: string;
  message: string;
  details: unknown;
  createdAt: string;
};

const levelStyle: Record<string, string> = {
  INFO: "border-sky-800/60 bg-sky-950/25 text-sky-300",
  SUCCESS: "border-emerald-800/60 bg-emerald-950/25 text-emerald-300",
  WARNING: "border-amber-800/60 bg-amber-950/25 text-amber-300",
  ERROR: "border-red-800/70 bg-red-950/30 text-red-300",
};

export function AdminLogsClient() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [category, setCategory] = useState("ALL");
  const [level, setLevel] = useState("ALL");
  const [query, setQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ take: "300", category, level });
      const response = await fetch(`/api/admin/logs?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setLastRefresh(new Date());
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, [category, level]);

  useEffect(() => {
    const firstLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(firstLoad);
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(() => void load(true), 3000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, load]);

  const visibleLogs = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr-FR");
    if (!normalized) return logs;
    return logs.filter((log) => `${log.message} ${log.runId ?? ""} ${JSON.stringify(log.details ?? "")}`.toLocaleLowerCase("fr-FR").includes(normalized));
  }, [logs, query]);

  const latest = logs[0];
  return (
    <main className="min-h-screen bg-gray-950 p-4 text-white md:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Journal de l’application</h1>
          <p className="mt-1 text-sm text-gray-400">Imports, découvertes Steam, synchronisations et réparations, conservés 30 jours dans PostgreSQL.</p>
        </div>
        <div className="text-right text-xs text-gray-500">
          <div>{autoRefresh ? "Actualisation automatique : 3 s" : "Actualisation automatique coupée"}</div>
          <div>{lastRefresh ? `Dernière lecture : ${lastRefresh.toLocaleTimeString("fr-FR")}` : "Pas encore chargé"}</div>
        </div>
      </div>

      <section className="mb-4 grid gap-3 rounded-xl border border-amber-900/60 bg-[#17120e] p-4 md:grid-cols-[1fr_auto_auto_auto]">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un jeu, studio, AppID, erreur…" className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm outline-none focus:border-amber-600" />
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm">
          <option value="ALL">Toutes les opérations</option><option value="IMPORT">Imports</option><option value="SYNC">Synchronisations</option><option value="DISCOVERY">Découvertes</option><option value="REPAIR">Réparations</option><option value="IMAGE">Images</option><option value="APP">Application</option>
        </select>
        <select value={level} onChange={(event) => setLevel(event.target.value)} className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm">
          <option value="ALL">Tous les niveaux</option><option value="INFO">Information</option><option value="SUCCESS">Succès</option><option value="WARNING">Avertissement</option><option value="ERROR">Erreur</option>
        </select>
        <div className="flex gap-2">
          <button onClick={() => setAutoRefresh((value) => !value)} className={`rounded-lg border px-3 py-2 text-sm ${autoRefresh ? "border-emerald-700 text-emerald-300" : "border-gray-700 text-gray-400"}`}>{autoRefresh ? "● Direct" : "○ Pause"}</button>
          <button onClick={() => void load()} className="rounded-lg border border-amber-800 px-3 py-2 text-sm text-amber-300 hover:bg-amber-950/40">Actualiser</button>
        </div>
      </section>

      {latest && <div className="mb-4 rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-3 text-sm"><span className="text-gray-500">Dernière activité :</span> <span className="text-gray-200">{latest.message}</span> <span className="ml-2 text-xs text-gray-600">{new Date(latest.createdAt).toLocaleString("fr-FR")}</span></div>}
      {error && <p className="mb-4 rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">Journal indisponible : {error}</p>}

      <div className="space-y-2">
        {loading && logs.length === 0 && <p className="text-sm text-gray-500">Chargement du journal…</p>}
        {!loading && visibleLogs.length === 0 && <p className="rounded-xl border border-gray-800 p-8 text-center text-gray-500">Aucune entrée pour ces filtres.</p>}
        {visibleLogs.map((log) => (
          <article key={log.id} className={`rounded-xl border p-3 ${levelStyle[log.level] ?? "border-gray-800 bg-gray-900/40 text-gray-300"}`}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <time className="font-mono text-gray-500">{new Date(log.createdAt).toLocaleString("fr-FR")}</time>
              <span className="rounded border border-current/30 px-1.5 py-0.5 font-semibold">{log.level}</span>
              <span className="rounded bg-black/25 px-1.5 py-0.5 text-gray-400">{log.category}</span>
              {log.runId && <span className="font-mono text-gray-600" title={log.runId}>#{log.runId.slice(0, 8)}</span>}
            </div>
            <p className="mt-2 text-sm font-medium text-gray-100">{log.message}</p>
            {log.details != null && <details className="mt-2 text-xs text-gray-500"><summary className="cursor-pointer">Détails techniques</summary><pre className="mt-2 overflow-x-auto rounded bg-black/30 p-2">{JSON.stringify(log.details, null, 2)}</pre></details>}
          </article>
        ))}
      </div>
    </main>
  );
}
