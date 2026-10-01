"use client";

import { useCallback, useEffect, useState } from "react";

type User = { id: string; username: string };
type Message = { id: string; fromUserId: string; toUserId: string; content: string; createdAt: string; read: boolean };
type Conversation = { userId: string; username: string; unread: number; last: { content: string; createdAt: string; fromUserId: string } | null };
type Announcement = { id: string; content: string; createdAt: string; read: boolean };

async function readJson(response: Response) {
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error("Réponse inattendue du serveur (non-JSON)");
  }
  if (!response.ok) throw new Error(data.error ?? "Chargement impossible");
  return data;
}

export function MessagesClient() {
  const [selfId, setSelfId] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedId, setSelectedId] = useState<string | "annonces">("annonces");
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    const data = await readJson(await fetch("/api/messages", { cache: "no-store" }));
    setSelfId(data.selfId);
    setUsers(data.users);
    setConversations(data.conversations);
    setAnnouncements(data.announcements ?? []);
    setLoading(false);
  }, []);

  const loadThread = useCallback(async (userId: string, before?: string) => {
    const url = `/api/messages/${encodeURIComponent(userId)}${before ? `?before=${encodeURIComponent(before)}` : ""}`;
    const data = await readJson(await fetch(url, { cache: "no-store" }));
    setMessages((prev) => {
      if (before) return [...data.messages, ...prev];
      const byId = new Map<string, Message>(prev.map((m) => [m.id, m]));
      for (const m of data.messages as Message[]) byId.set(m.id, m);
      return [...byId.values()].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id)
      );
    });
    setNextCursor((cur) => (before || cur === null ? data.nextCursor : cur));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadOverview()
        .then(() => {
          const to = new URLSearchParams(window.location.search).get("to");
          if (to) setSelectedId(to);
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : "Chargement impossible");
          setLoading(false);
        });
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedId || selectedId === "annonces") return;
    const t = window.setTimeout(() => {
      void loadThread(selectedId).catch((e) => setError(e instanceof Error ? e.message : "Conversation indisponible"));
    }, 0);
    return () => window.clearTimeout(t);
  }, [selectedId, loadThread]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadOverview().catch(() => {});
      if (selectedId && selectedId !== "annonces") void loadThread(selectedId).catch(() => {});
    }, 10000);
    return () => window.clearInterval(interval);
  }, [selectedId, loadOverview, loadThread]);

  function choose(userId: string | "annonces") {
    if (userId === selectedId) return;
    setSelectedId(userId);
    setMessages([]);
    setNextCursor(null);
    setError("");
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId || selectedId === "annonces" || !content.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await readJson(
        await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId: selectedId, content }),
        })
      );
      setContent("");
      await Promise.all([loadThread(selectedId), loadOverview()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setBusy(false);
    }
  }

  const selectedUser =
    users.find((u) => u.id === selectedId) ?? conversations.find((c) => c.userId === selectedId);

  const visibleUsers = users.filter(
    (u) =>
      u.username.toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr")) &&
      !conversations.some((c) => c.userId === u.id)
  );


  async function deleteMessage(msgId: string, recipientId: string) {
    if (!confirm("Supprimer ce message ?")) return;
    try {
      await readJson(
        await fetch(`/api/messages/${encodeURIComponent(recipientId)}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: msgId }),
        })
      );
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      void loadOverview();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible");
    }
  }

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  return (
    <div className="messages-page">
      <header className="messages-header">
        <span>✉ Correspondance privée</span>
        <h1>Messages</h1>
        <p>Échange des messages privés avec les autres joueurs.</p>
      </header>
      {error && (
        <p className="battle-alert" role="alert">
          {error}
        </p>
      )}
      <div className="messages-layout">
        <aside className="messages-contacts">
          <label htmlFor="messages-search">Joueurs</label>
          <input
            id="messages-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Chercher un joueur…"
          />
          {loading && <p>Chargement…</p>}

          {/* Annonces section */}
          <button
            type="button"
            className={selectedId === "annonces" ? "selected" : ""}
            onClick={() => choose("annonces")}
          >
            <strong>📢 Annonces Admin</strong>
            <small>{announcements.length > 0 ? `${announcements.length} annonce(s)` : "Aucune annonce"}</small>
          </button>

          {/* Private conversations */}
          {conversations
            .filter((c) =>
              c.username.toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr"))
            )
            .map((c) => (
              <button
                type="button"
                key={c.userId}
                className={selectedId === c.userId ? "selected" : ""}
                onClick={() => choose(c.userId)}
              >
                <strong>{c.username}</strong>
                {c.unread > 0 && <b>{c.unread}</b>}
                <small>{c.last?.content ?? "Conversation"}</small>
              </button>
            ))}

          {/* New conversation */}
          {visibleUsers.length > 0 && <h2>Nouvelle conversation</h2>}
          {visibleUsers.map((u) => (
            <button
              type="button"
              key={u.id}
              className={selectedId === u.id ? "selected" : ""}
              onClick={() => choose(u.id)}
            >
              <strong>{u.username}</strong>
              <small>Écrire un message</small>
            </button>
          ))}
        </aside>

        <section className="messages-thread">
          {selectedId === "annonces" ? (
            <>
              <h2>📢 Annonces Admin</h2>
              <div className="messages-scroll" role="log" aria-live="polite">
                {announcements.length === 0 ? (
                  <p className="messages-empty">Aucune annonce pour le moment.</p>
                ) : (
                  announcements.map((a) => (
                    <article key={a.id} className="messages-bubble theirs announcement">
                      <p style={{ whiteSpace: "pre-wrap" }}>{a.content}</p>
                      <time dateTime={a.createdAt}>{new Date(a.createdAt).toLocaleString("fr-FR")}</time>
                    </article>
                  ))
                )}
              </div>
            </>
          ) : !selectedUser ? (
            <p className="messages-empty">Choisis un joueur pour commencer une conversation.</p>
          ) : (
            <>
              <h2>{selectedUser.username}</h2>
              <div className="messages-scroll" role="log" aria-live="polite">
                {nextCursor && (
                  <button
                    type="button"
                    className="messages-more"
                    onClick={() =>
                      void loadThread(selectedId as string, nextCursor).catch((e) =>
                        setError(e instanceof Error ? e.message : "Chargement impossible")
                      )
                    }
                  >
                    Charger les anciens messages
                  </button>
                )}
                {messages.length === 0 && (
                  <p className="messages-empty">Aucun message pour le moment.</p>
                )}
                {messages.map((m) => (
                  <article
                    key={m.id}
                    className={`messages-bubble ${m.fromUserId === selfId ? "mine" : "theirs"}`}
                  >
                    <p>{m.content}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
                      <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleString("fr-FR")}</time>
                      {m.fromUserId === selfId && (
                        <button
                          type="button"
                          onClick={() => void deleteMessage(m.id, selectedId as string)}
                          title="Supprimer"
                          style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: "11px", padding: "0 2px", opacity: 0.5, transition: "opacity 0.15s" }}
                          onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; (e.target as HTMLElement).style.color = "#e74c3c"; }}
                          onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.5"; (e.target as HTMLElement).style.color = "#666"; }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              <form onSubmit={(e) => void send(e)} className="messages-compose">
                <textarea
                  required
                  maxLength={2000}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={`Message à ${selectedUser.username}…`}
                  rows={3}
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
