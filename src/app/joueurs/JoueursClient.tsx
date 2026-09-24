"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Joueur = { id: string; username: string; isSelf: boolean; xp: number; cardCount: number; createdAt: string };
type LibraryCard = {
  id: string;
  label: string;
  headerImage: string | null;
  rarity: "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
  type: "GAME" | "STUDIO";
};

const RARITY_BORDER: Record<LibraryCard["rarity"], string> = {
  COMMON: "border-gray-300",
  UNCOMMON: "border-green-500",
  RARE: "border-blue-500",
  EPIC: "border-purple-500",
  LEGENDARY: "border-orange-500",
};

export function JoueursClient() {
  const [joueurs, setJoueurs] = useState<Joueur[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Joueur | null>(null);
  const [library, setLibrary] = useState<LibraryCard[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");

  useEffect(() => {
    fetch("/api/joueurs")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setJoueurs(data);
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedPlayer(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  async function openLibrary(player: Joueur) {
    setSelectedPlayer(player);
    setLibrary([]);
    setLibraryError("");
    setLibraryLoading(true);
    try {
      const response = await fetch(`/api/joueurs/${player.id}/collection`);
      if (!response.ok) throw new Error("Bibliothèque indisponible");
      const data = await response.json();
      setLibrary(Array.isArray(data) ? data : []);
    } catch {
      setLibraryError("Impossible de charger cette bibliothèque.");
    } finally {
      setLibraryLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Joueurs</h1>
      <p className="text-gray-500 text-sm mb-6">
        {loaded ? `${joueurs.length} joueur(s)` : "Chargement…"}
      </p>

      <div className="steam-player-registry border border-gray-800 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[690px] text-sm text-left">
          <thead className="bg-gray-900 text-gray-400">
            <tr>
              <th className="px-4 py-3">Joueur</th>
              <th className="px-4 py-3">XP</th>
              <th className="px-4 py-3">Cartes</th>
              <th className="px-4 py-3">Membre depuis</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {joueurs.map((j) => (
              <tr key={j.id} className="border-t border-gray-800 hover:bg-gray-900/50">
                <td className="px-4 py-3 text-white font-medium">
                  <span className="flex items-center gap-3">
                    <span className="steam-player-medallion" aria-hidden="true">
                      {j.username.slice(0, 1).toLocaleUpperCase("fr")}
                    </span>
                    {j.username}{j.isSelf && <small className="text-amber-400">(vous)</small>}
                  </span>
                </td>
                <td className="px-4 py-2 text-amber-400">{j.xp}</td>
                <td className="px-4 py-2 text-blue-400">{j.cardCount}</td>
                <td className="px-4 py-2 text-gray-500">{new Date(j.createdAt).toLocaleDateString("fr-FR")}</td>
                <td className="px-4 py-2 text-right">
                  {!j.isSelf && <Link href={`/messages?to=${encodeURIComponent(j.id)}`} className="mr-3 text-sm text-amber-400 hover:text-amber-200">Écrire</Link>}
                  <button type="button" onClick={() => openLibrary(j)} className="steam-library-button">
                    <span className="steam-library-wheel" aria-hidden="true"><span /></span>
                    <span>
                      <strong>Ouvrir</strong>
                      <small>{j.cardCount} carte{j.cardCount > 1 ? "s" : ""}</small>
                    </span>
                  </button>
                </td>
              </tr>
            ))}
            {loaded && joueurs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  Aucun joueur pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedPlayer && (
        <div
          className="steam-library-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Bibliothèque de ${selectedPlayer.username}`}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSelectedPlayer(null);
          }}
        >
          <section className="steam-library-vault">
            <header className="steam-library-header">
              <div className="flex items-center gap-3 min-w-0">
                <span className="steam-player-medallion steam-player-medallion-large" aria-hidden="true">
                  {selectedPlayer.username.slice(0, 1).toLocaleUpperCase("fr")}
                </span>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-[0.22em] text-amber-700">Bibliothèque</span>
                  <h2 className="text-xl text-white font-bold truncate">{selectedPlayer.username}</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlayer(null)}
                className="steam-library-close"
                aria-label="Fermer"
              >
                ×
              </button>
            </header>

            <div className="steam-library-counter">
              <span>{libraryLoading ? "Ouverture du coffre…" : `${library.length} carte${library.length > 1 ? "s" : ""}`}</span>
              <span aria-hidden="true">⚙</span>
            </div>

            <div className="steam-library-grid">
              {library.map((card) => (
                <article key={card.id} className={`steam-library-card border-2 ${RARITY_BORDER[card.rarity]}`}>
                  {card.headerImage ? (
                    <img src={card.headerImage} alt="" />
                  ) : (
                    <div className="steam-library-studio" aria-hidden="true">🏭</div>
                  )}
                  <div>
                    <strong title={card.label}>{card.label}</strong>
                    <small>{card.type === "GAME" ? "Jeu" : "Studio"}</small>
                  </div>
                </article>
              ))}
              {libraryLoading && <div className="steam-library-empty">Chargement des cartes…</div>}
              {!libraryLoading && libraryError && (
                <div className="steam-library-empty">
                  <p>{libraryError}</p>
                  <button type="button" onClick={() => openLibrary(selectedPlayer)}>Réessayer</button>
                </div>
              )}
              {!libraryLoading && !libraryError && library.length === 0 && (
                <div className="steam-library-empty">Cette bibliothèque est encore vide.</div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
