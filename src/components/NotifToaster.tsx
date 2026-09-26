"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  read: boolean;
  createdAt: string;
};

type Toast = Notif & { visible: boolean };

const POLL_MS = 30_000;

export function NotifToaster() {
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: false } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 400);
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data: { notifications: Notif[] } = await res.json();
      const fresh: Notif[] = [];
      for (const n of data.notifications) {
        if (!seenIds.current.has(n.id)) {
          seenIds.current.add(n.id);
          if (!initialized.current) continue; // skip backlog on first load
          if (!n.read) fresh.push(n);
        }
      }
      initialized.current = true;
      if (fresh.length === 0) return;
      setToasts((prev) => [
        ...prev,
        ...fresh.map((n) => ({ ...n, visible: true })),
      ]);
      // auto-dismiss after 8s
      fresh.forEach((n) => {
        setTimeout(() => dismiss(n.id), 8_000);
      });
    } catch {
      // best-effort
    }
  }, [dismiss]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 bg-gray-900 border border-amber-700/60 rounded-xl shadow-2xl px-4 py-3 transition-all duration-300 ${
            t.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          }`}
        >
          <span className="text-xl shrink-0 mt-0.5">
            {t.type === "SYSTEM" ? "📢" : t.type === "MESSAGE" ? "💬" : t.type === "BATTLE" ? "⚔️" : "🔔"}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-300 truncate">{t.title}</p>
            {t.body && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{t.body}</p>}
            {t.link && (
              <Link href={t.link} className="text-xs text-amber-500 hover:text-amber-300 mt-1 inline-block" onClick={() => dismiss(t.id)}>
                Voir →
              </Link>
            )}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-gray-500 hover:text-white text-lg leading-none shrink-0 mt-0.5">×</button>
        </div>
      ))}
    </div>
  );
}
