"use client";
import { useEffect, useState } from "react";

type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

type Joueur = { id: string; username: string };
type CardOption = { id: string; label: string; headerImage: string | null; rarity: Rarity | null; type: "GAME" | "STUDIO" };

type TradeCard = {
  side: "OFFER" | "WANT";
  card: {
    game: { name: string; rarity: Rarity } | null;
    studio: { name: string; rarity: Rarity } | null;
  };
};

type Trade = {
  id: string;
  fromUserId: string;
  toUserId: string;
  offerCoins: number;
  wantCoins: number;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
  createdAt: string;
  fromUser: { id: string; username: string };
  toUser: { id: string; username: string };
  cards: TradeCard[];
};

function cardLabel(tc: TradeCard) {
  return tc.card.game?.name ?? tc.card.studio?.name ?? "?";
}

export function EchangesClient({ myUserId }: { myUserId: string }) {
  const [joueurs, setJoueurs] = useState<Joueur[]>([]);
  const [myCollection, setMyCollection] = useState<CardOption[]>([]);
  const [targetId, setTargetId] = useState("");
  const [targetCollection, setTargetCollection] = useState<CardOption[]>([]);
  const [offerCardIds, setOfferCardIds] = useState<string[]>([]);
  const [wantCardIds, setWantCardIds] = useState<string[]>([]);
  const [offerCoins, setOfferCoins] = useState(0);
  const [wantCoins, setWantCoins] = useState(0);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  function loadTrades() {
    fetch("/api/echanges").then((r) => (r.ok ? r.json() : [])).then(setTrades);
  }

  useEffect(() => {
    fetch("/api/joueurs").then((r) => (r.ok ? r.json() : [])).then(setJoueurs);
    fetch("/api/collection")
      .then((r) => (r.ok ? r.json() : []))
      .then((cards: any[]) =>
        setMyCollection(
          cards.map((c) => ({
            id: c.id,
            label: c.game?.name ?? c.studio?.name ?? "?",
            headerImage: c.game?.headerImage ?? null,
            rarity: c.game?.rarity ?? c.studio?.rarity ?? null,
            type: c.game ? "GAME" : "STUDIO",
          }))
        )
      );
    loadTrades();
  }, []);

  useEffect(() => {
    if (!targetId) {
      setTargetCollection([]);
      return;
    }
    fetch(`/api/joueurs/${targetId}/collection`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setTargetCollection);
    setWantCardIds([]);
  }, [targetId]);

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function proposeTrade() {
    setError("");
    if (!targetId) { setError("Choisis un joueur"); return; }
    setSending(true);
    const res = await fetch("/api/echanges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: targetId, offerCardIds, wantCardIds, offerCoins, wantCoins }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) { setError(data.error ?? "Erreur"); return; }
    setOfferCardIds([]);
    setWantCardIds([]);
    setOfferCoins(0);
    setWantCoins(0);
    loadTrades();
  }

  async function act(id: string, action: "accept" | "decline") {
    setActingId(id);
    const res = await fetch(`/api/echanges/${id}/${action}`, { method: "POST" });
    const data = await res.json();
    setActingId(null);
    if (!res.ok) { setError(data.error ?? "Erreur"); return; }
    loadTrades();
  }

  const incoming = trades.filter((t) => t.status === "PENDING" && t.toUserId === myUserId);
  const outgoing = trades.filter((t) => t.status === "PENDING" && t.fromUserId === myUserId);
  const history = trades.filter((t) => t.status !== "PENDING");

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-white">Échanges</h1>

      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-4">
        <h2 className="text-white font-semibold">Proposer un échange</h2>

        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none max-w-xs"
        >
          <option value="">Choisir un joueur…</option>
          {joueurs.map((j) => (
            <option key={j.id} value={j.id}>{j.username}</option>
          ))}
        </select>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-gray-400 text-xs uppercase mb-2">Tu offres (tes cartes)</p>
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto bg-gray-800 rounded-lg p-2">
              {myCollection.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={offerCardIds.includes(c.id)}
                    onChange={() => toggle(offerCardIds, setOfferCardIds, c.id)}
                  />
                  {c.label}
                </label>
              ))}
              {myCollection.length === 0 && <p className="text-gray-600 text-xs">Aucune carte.</p>}
            </div>
            <label className="text-gray-400 text-xs uppercase mt-2 block">+ jetons offerts</label>
            <input
              type="number"
              min={0}
              value={offerCoins}
              onChange={(e) => setOfferCoins(Math.max(0, parseInt(e.target.value) || 0))}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm w-32 mt-1"
            />
          </div>

          <div>
            <p className="text-gray-400 text-xs uppercase mb-2">Tu demandes (ses cartes)</p>
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto bg-gray-800 rounded-lg p-2">
              {targetCollection.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={wantCardIds.includes(c.id)}
                    onChange={() => toggle(wantCardIds, setWantCardIds, c.id)}
                  />
                  {c.label}
                </label>
              ))}
              {!targetId && <p className="text-gray-600 text-xs">Choisis d'abord un joueur.</p>}
              {targetId && targetCollection.length === 0 && <p className="text-gray-600 text-xs">Aucune carte.</p>}
            </div>
            <label className="text-gray-400 text-xs uppercase mt-2 block">+ jetons demandés</label>
            <input
              type="number"
              min={0}
              value={wantCoins}
              onChange={(e) => setWantCoins(Math.max(0, parseInt(e.target.value) || 0))}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm w-32 mt-1"
            />
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={proposeTrade}
          disabled={sending}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg px-4 py-2 self-start disabled:opacity-50"
        >
          {sending ? "…" : "Proposer l'échange"}
        </button>
      </section>

      <section>
        <h2 className="text-white font-semibold mb-2">Propositions reçues ({incoming.length})</h2>
        <div className="flex flex-col gap-2">
          {incoming.map((t) => (
            <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center justify-between gap-4">
              <div className="text-sm text-gray-300">
                <span className="text-white font-medium">{t.fromUser.username}</span> t'offre{" "}
                {t.cards.filter((c) => c.side === "OFFER").map(cardLabel).join(", ") || "rien"}
                {t.offerCoins > 0 && ` + ${t.offerCoins} jetons`} contre{" "}
                {t.cards.filter((c) => c.side === "WANT").map(cardLabel).join(", ") || "rien"}
                {t.wantCoins > 0 && ` + ${t.wantCoins} jetons`}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => act(t.id, "accept")}
                  disabled={actingId === t.id}
                  className="bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  Accepter
                </button>
                <button
                  onClick={() => act(t.id, "decline")}
                  disabled={actingId === t.id}
                  className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  Refuser
                </button>
              </div>
            </div>
          ))}
          {incoming.length === 0 && <p className="text-gray-600 text-sm">Aucune proposition reçue.</p>}
        </div>
      </section>

      <section>
        <h2 className="text-white font-semibold mb-2">Propositions envoyées ({outgoing.length})</h2>
        <div className="flex flex-col gap-2">
          {outgoing.map((t) => (
            <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center justify-between gap-4">
              <div className="text-sm text-gray-300">
                Tu offres{" "}
                {t.cards.filter((c) => c.side === "OFFER").map(cardLabel).join(", ") || "rien"}
                {t.offerCoins > 0 && ` + ${t.offerCoins} jetons`} à{" "}
                <span className="text-white font-medium">{t.toUser.username}</span> contre{" "}
                {t.cards.filter((c) => c.side === "WANT").map(cardLabel).join(", ") || "rien"}
                {t.wantCoins > 0 && ` + ${t.wantCoins} jetons`}
              </div>
              <button
                onClick={() => act(t.id, "decline")}
                disabled={actingId === t.id}
                className="bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50 shrink-0"
              >
                Annuler
              </button>
            </div>
          ))}
          {outgoing.length === 0 && <p className="text-gray-600 text-sm">Aucune proposition envoyée.</p>}
        </div>
      </section>

      <section>
        <h2 className="text-white font-semibold mb-2">Historique ({history.length})</h2>
        <div className="flex flex-col gap-1">
          {history.map((t) => (
            <div key={t.id} className="text-xs text-gray-500 border-t border-gray-800 py-2">
              {t.fromUser.username} → {t.toUser.username} :{" "}
              <span className={t.status === "ACCEPTED" ? "text-green-500" : "text-red-500"}>{t.status}</span>
            </div>
          ))}
          {history.length === 0 && <p className="text-gray-600 text-sm">Aucun historique.</p>}
        </div>
      </section>
    </div>
  );
}
