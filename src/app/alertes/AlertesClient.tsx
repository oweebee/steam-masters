"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

const TYPE_ICON: Record<string, string> = {
  MESSAGE: "✉️",
  BATTLE: "⚔️",
  TRADE: "🔄",
  AUCTION: "🔨",
  SYSTEM: "⚙️",
  BUG: "🐛",
};

function timeAgo(date: string) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return `il y a ${Math.floor(diff / 86400)} j`;
}

export function AlertesClient({ notifications }: { notifications: Notif[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [localNotifs, setLocalNotifs] = useState(notifications);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    setLocalNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setLocalNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    startTransition(() => router.refresh());
  }

  const unread = localNotifs.filter((n) => !n.read).length;

  return (
    <main className="steam-main max-w-2xl mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[#c8a96b]">
          🏮 Alertes {unread > 0 && <span className="ml-2 text-sm bg-[#c8a96b] text-[#18130f] rounded-full px-2 py-0.5">{unread}</span>}
        </h1>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs text-[#4fc3e0] hover:text-white transition"
          >
            Tout marquer comme lu
          </button>
        )}
      </div>

      {localNotifs.length === 0 ? (
        <p className="text-gray-500 text-center py-12">Aucune alerte pour l&apos;instant.</p>
      ) : (
        <ul className="space-y-2">
          {localNotifs.map((n) => {
            const inner = (
              <div
                className={`rounded-lg border p-3 transition cursor-pointer ${
                  n.read
                    ? "border-[#2a2a3a] bg-[#1a1a2e]/40"
                    : "border-[#4fc3e0]/50 bg-[#1a2a3a]/60"
                }`}
                onClick={() => { if (!n.read) markRead(n.id); }}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg mt-0.5 shrink-0">{TYPE_ICON[n.type] ?? "🔔"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold text-sm truncate ${n.read ? "text-gray-300" : "text-white"}`}>
                        {n.title}
                      </span>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-[#4fc3e0] shrink-0" />}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                    <p className="text-[10px] text-gray-600 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              </div>
            );

            return (
              <li key={n.id}>
                {n.link ? <Link href={n.link} className="block" onClick={() => { if (!n.read) markRead(n.id); }}>{inner}</Link> : inner}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
