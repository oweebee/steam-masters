"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./DetailWindows.module.css";

type Target = { gameId: string } | { studioId: string };
type Watch = { gameId: string | null; studioId: string | null };
const keyOf = (target: Target) => "gameId" in target ? `game:${target.gameId}` : `studio:${target.studioId}`;
const WatchContext = createContext<{ ids: Set<string>; ready: boolean; error: string; busy: Set<string>; toggle: (target: Target) => Promise<void>; reload: () => void } | null>(null);

export function CardWatchScope({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState(new Set<string>());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(new Set<string>());
  const [retry, setRetry] = useState(0);
  const pending = useRef(new Set<string>());
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/card-watch", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) }).then(async response => {
      if (!response.ok) throw new Error("Impossible de charger le suivi.");
      const watches: Watch[] = await response.json();
      if (!Array.isArray(watches)) throw new Error("Réponse de suivi invalide.");
      if (controller.signal.aborted) return;
      setIds(new Set(watches.flatMap(w => w.gameId ? [`game:${w.gameId}`] : w.studioId ? [`studio:${w.studioId}`] : [])));
      setReady(true); setError("");
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [retry]);
  async function toggle(target: Target) {
    const key = keyOf(target);
    if (!ready || pending.current.has(key)) return;
    pending.current.add(key); setBusy(new Set(pending.current)); setError("");
    try {
      const response = await fetch("/api/card-watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok || typeof data.watching !== "boolean") throw new Error(data.error || "Suivi non enregistré.");
      setIds(previous => { const next = new Set(previous); if (data.watching) next.add(key); else next.delete(key); return next; });
    } catch (error) { setError(error instanceof Error ? error.message : "Suivi non enregistré."); }
    finally { pending.current.delete(key); setBusy(new Set(pending.current)); }
  }
  return <WatchContext.Provider value={{ ids, ready, error, busy, toggle, reload: () => setRetry(n => n + 1) }}>{children}</WatchContext.Provider>;
}

export function CardWatchButton({ target, name }: { target: Target; name: string }) {
  const context = useContext(WatchContext);
  if (!context) return null;
  const key = keyOf(target), watching = context.ids.has(key), busy = context.busy.has(key);
  return <div className={styles.watch} onClick={event => event.stopPropagation()}>
    <button type="button" className={styles.watchButton} aria-pressed={watching} aria-label={`${watching ? "Ne plus suivre" : "Suivre"} ${name}`} disabled={!context.ready || busy} onClick={() => void context.toggle(target)}>{busy ? "Enregistrement…" : !context.ready ? "Chargement du suivi…" : watching ? "★ Suivie · ne plus suivre" : "☆ Suivre cette carte"}</button>
    {context.error && <p role="alert">{context.error} {!context.ready && <button type="button" onClick={context.reload}>Réessayer</button>}</p>}
  </div>;
}

function StudioWatchTarget({ name }: { name: string }) {
  const [id, setId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/studios/info?name=${encodeURIComponent(name)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Studio indisponible pour le suivi.");
      const studio = await response.json();
      if (typeof studio.id !== "string") throw new Error("Identifiant du studio indisponible.");
      if (!controller.signal.aborted) { setId(studio.id); setError(""); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [name, retry]);
  if (error) return <p role="alert" className={styles.watch}>{error} <button type="button" onClick={event => { event.stopPropagation(); setRetry(n => n + 1); }}>Réessayer</button></p>;
  return id ? <CardWatchButton target={{ studioId: id }} name={name} /> : <p className={styles.watch}>Chargement du suivi…</p>;
}

/** Mount only for an opened card: no per-card requests while browsing a grid. */
export function CardWatchOnOpen({ active, gameId, name }: { active: boolean; gameId?: string; name: string }) {
  const context = useContext(WatchContext);
  if (!active) return null;
  const control = gameId ? <CardWatchButton target={{ gameId }} name={name} /> : <StudioWatchTarget key={name} name={name} />;
  return context ? control : <CardWatchScope>{control}</CardWatchScope>;
}
