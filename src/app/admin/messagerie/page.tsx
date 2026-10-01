"use client";

import { useCallback, useEffect, useState } from "react";

type Conversation = {
  userId: string;
  username: string;
  unread: number;
  last: { content: string; createdAt: string; fromUserId: string } | null;
};
type Message = { id: string; fromUserId: string; content: string; createdAt: string; read: boolean };

async function fetchJson(url: string, opts?: RequestInit) {
  const r = await fetch(url, { cache: "no-store", ...opts });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "Erreur");
  return d;
}

export default function AdminMessageriePage() {
  const [adminId, setAdminId] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadConversations = useCallback(async () => {
    const data = await fetchJson("/api/admin/messagerie");
    setAdminId(data.adminId);
    setConversations(data.conversations);
    setLoading(false);
  }, []);

  const loadThread = useCallback(async (userId: string, before?: string) => {
    const url = `/api/messages/${encodeURIComponent(userId)}${before ? `?before=${encodeURIComponent(before)}` : ""}`;
    const data = await fetchJson(url);
    setMessages((prev) => {
      if (before) return [...data.messages, ...prev];
      const byId = new Map<string, Message>(prev.map((m) => [m.id, m]));
      for (const m of data.messages) byId.set(m.id, m);
      return [...byId.values()].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    });
    setNextCursor((cur) => (before || cur === null ? data.nextCursor : cur));
    // Mark read
    await loadConversations();
  }, [loadConversations]);

  useEffect(() => { void loadConversations().catch((e) => { setError(String(e)); setLoading(false); }); }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) return;
    void loadThread(selectedId).catch((e) => setError(String(e)));
  }, [selectedId, loadThread]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadConversations().catch(() => {});
      if (selectedId) void loadThread(selectedId).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [selectedId, loadConversations, loadThread]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !content.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await fetchJson("/api/admin/messagerie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: selectedId, content }),
      });
      setContent("");
      await loadThread(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setBusy(false);
    }
  }

  const selected = conversations.find((c) => c.userId === selectedId);
  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

  return (
    <div style={{ padding: "1rem", maxWidth: "900px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "0.5rem" }}>
        ✉ Messagerie Admin{totalUnread > 0 && <span style={{ marginLeft: "0.5rem", background: "var(--color-accent)", color: "#fff", borderRadius: "999px", padding: "0 0.5rem", fontSize: "0.8rem" }}>{totalUnread}</span>}
      </h1>
      <p style={{ color: "var(--color-muted)", marginBottom: "1rem" }}>
        Messages privés des joueurs. Les annonces sont dans /admin/annonces.
      </p>
      {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}
      <div style={{ display: "flex", gap: "1rem", minHeight: "500px", border: "1px solid var(--color-border)", borderRadius: "8px", overflow: "hidden" }}>
        <aside style={{ width: "240px", borderRight: "1px solid var(--color-border)", overflowY: "auto", flexShrink: 0 }}>
          {loading && <p style={{ padding: "1rem", color: "var(--color-muted)" }}>Chargement…</p>}
          {!loading && conversations.length === 0 && (
            <p style={{ padding: "1rem", color: "var(--color-muted)" }}>Aucun message privé.</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.userId}
              type="button"
              onClick={() => { setSelectedId(c.userId); setMessages([]); setNextCursor(null); }}
              style={{
                display: "block",
                width: "100%",
                padding: "0.75rem 1rem",
                textAlign: "left",
                border: "none",
                borderBottom: "1px solid var(--color-border)",
                background: selectedId === c.userId ? "var(--color-accent-muted, rgba(200,135,74,0.15))" : "transparent",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{c.username}</strong>
                {c.unread > 0 && (
                  <span style={{ background: "var(--color-accent)", color: "#fff", borderRadius: "999px", padding: "0 6px", fontSize: "0.75rem" }}>
                    {c.unread}
                  </span>
                )}
              </div>
              <small style={{ color: "var(--color-muted)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.last?.content ?? "…"}
              </small>
            </button>
          ))}
        </aside>

        <section style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {!selected ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-muted)" }}>
              Sélectionne une conversation.
            </div>
          ) : (
            <>
              <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border)", fontWeight: "bold" }}>
                {selected.username}
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {nextCursor && (
                  <button type="button" onClick={() => void loadThread(selectedId, nextCursor).catch((e) => setError(String(e)))} style={{ alignSelf: "center", marginBottom: "0.5rem" }}>
                    Charger plus
                  </button>
                )}
                {messages.map((m) => {
                  const isAdmin = m.fromUserId === adminId;
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: isAdmin ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "70%",
                        background: isAdmin ? "var(--color-accent)" : "var(--color-surface)",
                        color: isAdmin ? "#fff" : "inherit",
                        borderRadius: "8px",
                        padding: "0.5rem 0.75rem",
                      }}>
                        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.content}</p>
                        <time style={{ fontSize: "0.7rem", opacity: 0.7 }}>
                          {new Date(m.createdAt).toLocaleString("fr-FR")}
                        </time>
                      </div>
                    </div>
                  );
                })}
              </div>
              <form onSubmit={(e) => void send(e)} style={{ display: "flex", gap: "0.5rem", padding: "0.75rem", borderTop: "1px solid var(--color-border)" }}>
                <textarea
                  required
                  maxLength={2000}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={`Répondre à ${selected.username}…`}
                  rows={2}
                  style={{ flex: 1, resize: "none" }}
                />
                <button type="submit" disabled={busy || !content.trim()}>
                  {busy ? "Envoi…" : "Envoyer"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
