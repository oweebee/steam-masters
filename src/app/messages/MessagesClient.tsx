"use client";

import { useCallback, useEffect, useState } from "react";

type User = { id: string; username: string };
type Message = { id: string; fromUserId: string; toUserId: string; content: string; createdAt: string; read: boolean };
type Conversation = { userId: string; username: string; unread: number; last: { content: string; createdAt: string; fromUserId: string } | null };

async function readJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Chargement impossible");
  return data;
}

export function MessagesClient() {
  const [selfId, setSelfId] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
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
    setLoading(false);
  }, []);

  const loadThread = useCallback(async (userId: string, before?: string) => {
    const url = `/api/messages/${encodeURIComponent(userId)}${before ? `?before=${encodeURIComponent(before)}` : ""}`;
    const data = await readJson(await fetch(url, { cache: "no-store" }));
    setMessages((previous) => {
      if (before) return [...data.messages, ...previous];
      const byId = new Map<string, Message>(previous.map((message) => [message.id, message]));
      for (const message of data.messages as Message[]) byId.set(message.id, message);
      return [...byId.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id));
    });
    setNextCursor((current) => before || current === null ? data.nextCursor : current);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void loadOverview().then(() => {
        const to = new URLSearchParams(window.location.search).get("to");
        if (to) setSelectedId(to);
      }).catch((cause) => { setError(cause instanceof Error ? cause.message : "Chargement impossible"); setLoading(false); });
    }, 0);
    return () => window.clearTimeout(initial);
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedId) return;
    const initial = window.setTimeout(() => { void loadThread(selectedId).catch((cause) => setError(cause instanceof Error ? cause.message : "Conversation indisponible")); }, 0);
    return () => window.clearTimeout(initial);
  }, [selectedId, loadThread]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadOverview().catch(() => {});
      if (selectedId) void loadThread(selectedId).catch(() => {});
    }, 10000);
    return () => window.clearInterval(interval);
  }, [selectedId, loadOverview, loadThread]);

  function choose(userId: string) {
    if (userId === selectedId) return;
    setSelectedId(userId); setMessages([]); setNextCursor(null); setError("");
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId || !content.trim() || busy) return;
    setBusy(true); setError("");
    try {
      await readJson(await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId: selectedId, content }) }));
      setContent("");
      await Promise.all([loadThread(selectedId), loadOverview()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Envoi impossible"); }
    finally { setBusy(false); }
  }

  const selected = users.find((user) => user.id === selectedId) ?? conversations.find((conversation) => conversation.userId === selectedId);
  const visibleUsers = users.filter((user) => user.username.toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr")) && !conversations.some((conversation) => conversation.userId === user.id));
  return <div className="messages-page">
    <header className="messages-header"><span>✉ Correspondance privée</span><h1>Messages</h1><p>Échange des messages privés avec les autres joueurs.</p></header>
    {error && <p className="battle-alert" role="alert">{error}</p>}
    <div className="messages-layout">
      <aside className="messages-contacts">
        <label htmlFor="messages-search">Joueurs</label>
        <input id="messages-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Chercher un joueur…" />
        {loading && <p>Chargement…</p>}
        {conversations.filter((conversation) => conversation.username.toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr"))).map((conversation) =>
          <button type="button" key={conversation.userId} className={selectedId === conversation.userId ? "selected" : ""} onClick={() => choose(conversation.userId)}>
            <strong>{conversation.username}</strong>{conversation.unread > 0 && <b>{conversation.unread}</b>}
            <small>{conversation.last?.content ?? "Conversation"}</small>
          </button>
        )}
        {visibleUsers.length > 0 && <h2>Nouvelle conversation</h2>}
        {visibleUsers.map((user) => <button type="button" key={user.id} className={selectedId === user.id ? "selected" : ""} onClick={() => choose(user.id)}><strong>{user.username}</strong><small>Écrire un message</small></button>)}
      </aside>
      <section className="messages-thread">
        {!selected ? <p className="messages-empty">Choisis un joueur pour commencer une conversation.</p> : <>
          <h2>{selected.username}</h2>
          <div className="messages-scroll" role="log" aria-live="polite">
            {nextCursor && <button type="button" className="messages-more" onClick={() => void loadThread(selectedId, nextCursor).catch((cause) => setError(cause instanceof Error ? cause.message : "Chargement impossible"))}>Charger les anciens messages</button>}
            {messages.length === 0 && <p className="messages-empty">Aucun message pour le moment.</p>}
            {messages.map((message) => <article key={message.id} className={`messages-bubble ${message.fromUserId === selfId ? "mine" : "theirs"}`}>
              <p>{message.content}</p><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString("fr-FR")}</time>
            </article>)}
          </div>
          <form onSubmit={(event) => void send(event)} className="messages-compose">
            <textarea required maxLength={2000} value={content} onChange={(event) => setContent(event.target.value)} placeholder={`Message à ${selected.username}…`} rows={3} />
            <button type="submit" disabled={busy || !content.trim()}>{busy ? "Envoi…" : "Envoyer"}</button>
          </form>
        </>}
      </section>
    </div>
  </div>;
}
