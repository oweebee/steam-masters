"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LeaderboardEntry, LeaderboardRarity } from "@/lib/leaderboard";
import styles from "./leaderboard.module.css";

const RARITY_LABELS: Record<LeaderboardRarity, string> = { COMMON: "Commune", UNCOMMON: "Peu commune", RARE: "Rare", EPIC: "Épique", LEGENDARY: "Légendaire" };
const podiumOrder = [1, 0, 2];

const BONUS_OBJECTIVES: Record<string, string> = {
  "Progression multiplateforme": "Posséder la carte du même jeu sur au moins un tiers des plateformes disponibles.",
  "Multiplateforme complète": "Posséder la carte de ce jeu sur toutes les plateformes disponibles.",
  "Progression DLC": "Posséder le jeu principal et au moins un tiers de ses cartes DLC.",
  "Édition complète": "Posséder le jeu principal et toutes ses cartes DLC.",
  "Duo créateur": "Posséder la carte d’un jeu et celle du studio qui l’a développé.",
  "Collection ultime": "Réunir toutes les plateformes, tous les DLC et la carte du studio associé.",
  "Progression studio": "Collectionner au moins un tiers des jeux associés à ce studio.",
  "Maître du studio": "Posséder les cartes de tous les jeux associés à ce studio.",
  "Studio absolu": "Posséder tous les jeux associés au studio ainsi que sa carte Studio.",
  "Éventail des raretés": "Posséder au moins une carte dans 3, puis 4 et enfin les 5 raretés.",
  "Forge monochrome": "Réunir 5, puis 10 et enfin 20 cartes différentes de la même rareté.",
  "Bonus global": "Compléter 3, puis 5 et enfin 10 collections avancées pour multiplier tout le sous-total.",
};

function number(value: number) { return new Intl.NumberFormat("fr-FR").format(value); }

export function LeaderboardClient({ entries, selfId, claimedRewardKeys }: { entries: LeaderboardEntry[]; selfId: string; claimedRewardKeys: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null);
  const [helpLabel, setHelpLabel] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(() => new Set(claimedRewardKeys));
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimError, setClaimError] = useState("");
  const [rewardFocus, setRewardFocus] = useState(false);
  const selfEntry = entries.find((entry) => entry.id === selfId) ?? null;
  const availableRewards = selfEntry?.rewards.filter((reward) => !claimed.has(reward.key)) ?? [];
  const availableGp = availableRewards.reduce((total, reward) => total + reward.coins, 0);
  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (helpLabel) setHelpLabel(null);
      else setSelected(null);
    };
    document.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", close); document.body.style.overflow = ""; };
  }, [selected, helpLabel]);
  useEffect(() => {
    if (!selected || !rewardFocus) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById("leaderboard-rewards")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setRewardFocus(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, rewardFocus]);

  function closeDetails() { setHelpLabel(null); setRewardFocus(false); setSelected(null); }
  function openPlayer(entry: LeaderboardEntry) { setRewardFocus(false); setSelected(entry); }
  function openRewards() { if (selfEntry) { setRewardFocus(true); setSelected(selfEntry); } }

  async function claimReward(rewardKey: string) {
    if (claiming || claimed.has(rewardKey)) return;
    setClaiming(rewardKey); setClaimError("");
    try {
      const response = await fetch("/api/classement/rewards/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rewardKey }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Récompense indisponible");
      setClaimed(current => new Set(current).add(rewardKey));
      window.dispatchEvent(new Event("sm-rewards-updated"));
      router.refresh();
    } catch (reason) { setClaimError(reason instanceof Error ? reason.message : "Récompense indisponible"); }
    finally { setClaiming(null); }
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Panthéon des collectionneurs</p>
          <h1>Classement Steam Masters</h1>
          <p>Chaque carte rapporte des points. Complète progressivement plateformes, DLC et studios pour déclencher des multiplicateurs.</p>
        </div>
        <Image className={styles.trophy} src="/images/leaderboard/trophy-podium.webp" alt="Trophée mécanique du classement" width={800} height={533} priority />
      </header>

      {selfEntry && <section className={styles.rewardHub} aria-labelledby="reward-hub-title">
        <div className={styles.rewardHubIcon} aria-hidden="true">⚡</div>
        <div>
          <p className={styles.eyebrow}>Tes gains de progression</p>
          <h2 id="reward-hub-title">Mes récompenses</h2>
          <p>{availableRewards.length ? `${availableRewards.length} récompense${availableRewards.length > 1 ? "s" : ""} à récupérer · ${number(availableGp)} GP` : "Aucune récompense en attente pour le moment."}</p>
        </div>
        <button type="button" onClick={openRewards}>Voir et récupérer</button>
      </section>}

      {entries.length === 0 ? <div className={styles.empty}>Aucun joueur actif à classer.</div> : (
        <>
          <div className={styles.podium} aria-label="Podium">
            {podiumOrder.map((index) => {
              const entry = entries[index];
              if (!entry) return <div key={index} />;
              return (
                <button key={entry.id} className={`${styles.podiumCard} ${styles[`place${entry.rank}`] ?? ""}`} onClick={() => openPlayer(entry)}>
                  <span className={styles.medal}>{entry.rank === 1 ? "♛" : entry.rank}</span>
                  <strong>{entry.username}</strong>
                  <span>{number(entry.score)} pts</span>
                  <small>{entry.cardCount} cartes</small>
                </button>
              );
            })}
          </div>

          <div className={styles.board}>
            <div className={styles.boardHead}><span>Rang</span><span>Collectionneur</span><span>Cartes</span><span>Score</span></div>
            {entries.map((entry) => (
              <button key={entry.id} className={styles.row} onClick={() => openPlayer(entry)}>
                <span className={styles.rank}>{entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : `#${entry.rank}`}</span>
                <span className={styles.player}><span className={styles.avatar}>{entry.username.slice(0, 1).toUpperCase()}</span><span><strong>{entry.username}</strong><small>{entry.bonuses.length} bonus actifs</small></span></span>
                <span>{entry.cardCount}</span>
                <span className={styles.score}>{number(entry.score)} <small>pts</small></span>
              </button>
            ))}
          </div>
        </>
      )}

      {selected && (
        <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetails(); }}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="leaderboard-dialog-title">
            <button className={styles.close} onClick={closeDetails} aria-label="Fermer">×</button>
            <p className={styles.eyebrow}>Rang #{selected.rank}</p>
            <h2 id="leaderboard-dialog-title">Score de {selected.username}</h2>
            <div className={styles.total}>{number(selected.score)} <small>points</small></div>

            <div className={styles.summary}>
              <div><span>Cartes</span><strong>{number(selected.baseScore)}</strong></div>
              <div><span>Collections</span><strong>+{number(selected.comboScore)}</strong></div>
              <div><span>Bonus global</span><strong>{selected.globalMultiplier > 1 ? `×${selected.globalMultiplier.toFixed(2)}` : "—"}</strong><button className={`${styles.infoButton} ${styles.infoButtonSmall}`} onClick={() => setHelpLabel("Bonus global")} aria-label="Comment obtenir le bonus global" /></div>
            </div>

            <h3>Valeur des cartes</h3>
            <div className={styles.rarities}>
              {selected.rarity.map((row) => <div key={row.rarity} className={styles.rarity} data-rarity={row.rarity}><span>{RARITY_LABELS[row.rarity]}</span><small>{row.count} × carte</small><strong>{number(row.points)} pts</strong></div>)}
            </div>

            <h3>Bonus et progression</h3>
            {selected.bonuses.length ? <div className={styles.bonuses}>{selected.bonuses.map((bonus, index) => (
              <article key={`${bonus.label}-${bonus.detail}-${index}`}>
                <div className={styles.bonusTop}><div className={styles.bonusInfo}><strong>{bonus.label}</strong><small>{bonus.detail}</small></div><div className={styles.bonusActions}><button className={styles.infoButton} onClick={() => setHelpLabel(bonus.label)} aria-label={`Comment obtenir : ${bonus.label}`} /><span className={styles.gain}>{bonus.multiplier ? `×${bonus.multiplier.toFixed(2)}` : "Bonus"}<strong>+{number(bonus.points)}</strong></span></div></div>
                {bonus.progress && <><div className={styles.progress}><span style={{ width: `${Math.min(100, bonus.progress.current / bonus.progress.total * 100)}%` }} /></div><small className={styles.next}>{bonus.progress.next ? `Prochain palier : ${bonus.progress.next}/${bonus.progress.total}` : "Palier maximum atteint"}</small></>}
              </article>
            ))}</div> : <p className={styles.noBonus}>Encore aucun bonus : les premiers paliers démarrent dès un tiers de collection.</p>}

            {selected.id === selfId && <div id="leaderboard-rewards" className={styles.rewardSection}>
              <h3>Récompenses débloquées</h3>
              <p className={styles.rewardIntro}>Chaque palier donne ses propres gigapuissances. Les objectifs simples commencent à 20 GP ; les plus exigeants montent jusqu’à 5 000 GP.</p>
              <div className={styles.rewards}>{selected.rewards.map((reward) => {
                const done = claimed.has(reward.key);
                return <article key={reward.key}><div><strong>{reward.label}</strong><small>{reward.detail}</small></div><button type="button" disabled={done || !!claiming} onClick={() => void claimReward(reward.key)}>{done ? "Récupérée ✓" : claiming === reward.key ? "Attribution…" : `Récupérer +${number(reward.coins)} GP`}</button></article>;
              })}</div>
              {selected.rewards.length === 0 && <p className={styles.noBonus}>Aucun palier monétaire débloqué pour le moment.</p>}
              {claimError && <p className={styles.claimError} role="alert">{claimError}</p>}
            </div>}
          </div>
          {helpLabel && <div className={styles.helpBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpLabel(null); }}>
            <div className={styles.helpDialog} role="dialog" aria-modal="true" aria-labelledby="leaderboard-help-title">
              <button className={styles.helpClose} onClick={() => setHelpLabel(null)} aria-label="Fermer l’explication">×</button>
              <Image src="/images/leaderboard/info-medallion.webp" alt="" width={192} height={192} />
              <div><p className={styles.eyebrow}>Comment l’obtenir ?</p><h4 id="leaderboard-help-title">{helpLabel}</h4><p>{BONUS_OBJECTIVES[helpLabel] ?? "Faire progresser cette collection pour augmenter le bonus."}</p></div>
            </div>
          </div>}
        </div>
      )}
    </section>
  );
}
