"use client";
import { useEffect, useMemo, useState } from "react";

type Studio = { id: string; name: string; gameCount: number; games: string[] };
type Group = { key: string; studios: Studio[] };

// Le studio le plus rempli est présumé être la bonne fiche (le plus de jeux déjà
// rattachés), mais reste modifiable via les radios avant de fusionner.
function bestId(group: Group) {
  return group.studios.reduce((best, s) => (s.gameCount > best.gameCount ? s : best), group.studios[0]).id;
}

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { error: `Réponse serveur invalide (HTTP ${res.status}) : ${text.slice(0, 200) || "vide"}` }; }
}

export function StudioDuplicatesPanel() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [merging, setMerging] = useState<string | null>(null);
  const [mergingAll, setMergingAll] = useState(false);
  const [allProgress, setAllProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [picked, setPicked] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin/studios/duplicates");
      const data = await parseJsonSafe(res);
      if (!res.ok) throw new Error(data.error ?? "Chargement impossible.");
      const nextGroups: Group[] = data.groups ?? [];
      setGroups(nextGroups);
      setPicked((prev) => {
        const next = { ...prev };
        for (const g of nextGroups) if (!next[g.key]) next[g.key] = bestId(g);
        return next;
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Chargement impossible."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function mergeGroup(group: Group): Promise<string | null> {
    const keepId = picked[group.key] ?? bestId(group);
    const mergeIds = group.studios.filter((s) => s.id !== keepId).map((s) => s.id);
    const res = await fetch("/api/admin/studios/merge", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepId, mergeIds }),
    });
    const data = await parseJsonSafe(res);
    if (!res.ok) return `${group.studios[0].name} : ${data.error ?? "échec"}`;
    return null;
  }

  async function merge(group: Group) {
    setMerging(group.key); setError("");
    try {
      const failure = await mergeGroup(group);
      if (failure) throw new Error(failure);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Fusion impossible."); }
    finally { setMerging(null); }
  }

  async function mergeAll() {
    setMergingAll(true); setError("");
    const failures: string[] = [];
    const total = groups.length;
    setAllProgress({ done: 0, total, failed: 0 });
    for (const group of groups) {
      const failure = await mergeGroup(group);
      if (failure) failures.push(failure);
      setAllProgress((p) => ({ done: p.done + 1, total, failed: failures.length }));
    }
    await load();
    if (failures.length) setError(`${failures.length}/${total} fusion(s) échouée(s) : ${failures.slice(0, 5).join(" · ")}${failures.length > 5 ? "…" : ""}`);
    setMergingAll(false);
  }

  const busy = useMemo(() => merging !== null || mergingAll, [merging, mergingAll]);

  if (loading) return <div className="rounded-xl border border-amber-900/60 bg-stone-950 p-4"><p className="text-xs text-gray-500">Recherche de doublons…</p></div>;

  return (
    <div className="rounded-xl border border-amber-900/60 bg-stone-950 p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="text-white font-semibold">Studios doublons ({groups.length})</h2>
        {groups.length > 0 && (
          <button
            type="button"
            onClick={() => void mergeAll()}
            disabled={busy}
            className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 shrink-0"
          >
            {mergingAll ? `Fusion… ${allProgress.done}/${allProgress.total}` : `Tout fusionner (${groups.length})`}
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-3">Même nom (accents/casse/espaces ignorés) réparti sur plusieurs fiches. La fiche avec le plus de jeux est cochée par défaut ; ses jeux, cartes possédées, enchères et suivis absorbent les autres, qui sont supprimées. Aucune carte joueur n&apos;est perdue.</p>
      {error && <p className="mb-2 text-sm text-red-300">{error}</p>}
      {groups.length === 0 && <p className="text-xs text-gray-500">Aucun doublon détecté.</p>}
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.key} className="rounded-lg border border-gray-800 bg-gray-900/60 p-3">
            <div className="space-y-1">
              {group.studios.map((studio) => (
                <label key={studio.id} className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="radio"
                    name={`ref-${group.key}`}
                    checked={(picked[group.key] ?? bestId(group)) === studio.id}
                    onChange={() => setPicked((prev) => ({ ...prev, [group.key]: studio.id }))}
                  />
                  <span className="text-white font-medium">{studio.name}</span>
                  <span className="text-gray-500 text-xs">· {studio.gameCount} jeu(x)</span>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void merge(group)}
              disabled={busy}
              className="mt-2 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {merging === group.key ? "Fusion…" : "Fusionner sur la fiche cochée"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
