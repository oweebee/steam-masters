"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { LeaderboardRewardObjective } from "@/lib/leaderboard";
import styles from "./rewards.module.css";

type Claim = { rewardKey: string; coins: number; claimedAt: string };
const number = (value: number) => new Intl.NumberFormat("fr-FR").format(value);

function objectiveExplanation(reward: LeaderboardRewardObjective) {
  if (reward.key.startsWith("platform:")) return "Possède les versions du même jeu sur le nombre de plateformes indiqué.";
  if (reward.key.startsWith("dlc:")) return "Possède le jeu principal ainsi que le nombre de DLC indiqué.";
  if (reward.key.startsWith("ultimate:")) return "Réunis toutes les plateformes, tous les DLC et la carte du studio associé.";
  if (reward.key.startsWith("studio-card:")) return "Possède tous les jeux du studio ainsi que sa carte Studio.";
  if (reward.key.startsWith("studio:")) return "Collectionne le nombre demandé de jeux différents développés par ce studio.";
  if (reward.key.startsWith("duos:")) return "Forme des duos en possédant à la fois une carte de jeu et la carte du studio qui l’a développé.";
  if (reward.key.startsWith("rarities:")) return "Possède au moins une carte dans le nombre demandé de raretés différentes.";
  if (reward.key.startsWith("monochrome:")) return "Possède le nombre demandé de cartes différentes dans cette même rareté.";
  return "Débloque le nombre demandé de collections bénéficiant déjà d’un bonus de classement.";
}

export function RewardsClient({ objectives, claims }: { objectives: LeaderboardRewardObjective[]; claims: Claim[] }) {
  const router = useRouter();
  const [claimed, setClaimed] = useState(() => new Set(claims.map((claim) => claim.rewardKey)));
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [collectedGp, setCollectedGp] = useState(() => claims.reduce((total, claim) => total + claim.coins, 0));
  const [info, setInfo] = useState<LeaderboardRewardObjective | null>(null);
  const [showAllUntouched, setShowAllUntouched] = useState(false);
  const pending = useMemo(() => objectives.filter((reward) => reward.unlocked && !claimed.has(reward.key)), [objectives, claimed]);
  const recovered = useMemo(() => objectives.filter((reward) => reward.unlocked && claimed.has(reward.key)), [objectives, claimed]);
  const progressing = useMemo(() => objectives.filter((reward) => !reward.unlocked && reward.current > 0), [objectives]);
  const untouched = useMemo(() => objectives.filter((reward) => !reward.unlocked && reward.current === 0), [objectives]);
  const pendingGp = pending.reduce((total, reward) => total + reward.coins, 0);
  useEffect(() => {
    if (!info) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setInfo(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [info]);

  async function claim(reward: LeaderboardRewardObjective) {
    if (claiming || claimed.has(reward.key)) return;
    setClaiming(reward.key); setError("");
    try {
      const response = await fetch("/api/classement/rewards/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rewardKey: reward.key }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Récompense indisponible");
      setClaimed((current) => new Set(current).add(reward.key));
      setCollectedGp((current) => current + result.awarded);
      window.dispatchEvent(new Event("sm-rewards-updated"));
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Récompense indisponible"); }
    finally { setClaiming(null); }
  }

  return <section className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.heroCopy}><p className={styles.eyebrow}>Progression longue durée</p><h1>Mes récompenses</h1><p>Complète les objectifs exigeants du classement, puis récupère ici les gigapuissances gagnées.</p></div>
      <Image className={styles.vault} src="/images/rewards/reward-vault.png" alt="Coffre mécanique de récompenses" width={1536} height={1152} priority />
    </header>

    <div className={styles.stats}>
      <article><span>À récupérer</span><strong>{pending.length}</strong><small>récompense{pending.length > 1 ? "s" : ""}</small></article>
      <article><span>Gain disponible</span><strong>{number(pendingGp)}</strong><small>gigapuissances</small></article>
      <article><span>Déjà récupéré</span><strong>{number(collectedGp)}</strong><small>gigapuissances au total</small></article>
    </div>

    <section className={styles.panel}>
      <div className={styles.panelTitle}><div><p className={styles.eyebrow}>Prêtes à être encaissées</p><h2>Récompenses débloquées</h2></div><span>{pending.length}</span></div>
      {pending.length ? <div className={styles.grid}>{pending.map((reward) => <article className={styles.reward} key={reward.key}>
        <div className={styles.rewardValue}><span>+</span>{number(reward.coins)}<small>GP</small></div>
        <div className={styles.rewardCopy}><h3>{reward.label}</h3><p>{reward.detail}</p><div className={styles.progress}><span style={{ width: `${Math.min(100, reward.current / reward.target * 100)}%` }} /></div><small>Objectif atteint · {reward.current}/{reward.target}</small></div>
        <div className={styles.rewardActions}><button type="button" className={styles.infoButton} onClick={() => setInfo(reward)} aria-label={`Détail de la récompense ${reward.label}`} /><button type="button" className={styles.claimButton} disabled={Boolean(claiming)} onClick={() => void claim(reward)}>{claiming === reward.key ? "Récupération…" : "Récupérer"}</button></div>
      </article>)}</div> : <div className={styles.empty}><strong>Aucune récompense en attente</strong><p>Les prochains gains demandent des collections plus profondes. Continue à compléter plateformes, DLC, studios et séries de rareté.</p></div>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>

    {progressing.length > 0 && <section className={`${styles.panel} ${styles.lockedPanel}`}>
      <div className={styles.panelTitle}><div><p className={styles.eyebrow}>Déjà commencés</p><h2>Objectifs en progression</h2></div><span>{progressing.length}</span></div>
      <div className={styles.grid}>{progressing.map((reward) => <article className={`${styles.reward} ${styles.locked}`} key={reward.key}>
        <div className={styles.rewardValue}><span>+</span>{number(reward.coins)}<small>GP</small></div>
        <div className={styles.rewardCopy}><h3>{reward.label}</h3><p>{reward.detail}</p><div className={styles.progress}><span style={{ width: `${Math.min(100, reward.current / reward.target * 100)}%` }} /></div><small>{reward.current}/{reward.target} · encore {Math.max(0, reward.target - reward.current)}</small></div>
        <div className={styles.rewardActions}><button type="button" className={styles.infoButton} onClick={() => setInfo(reward)} aria-label={`Détail de l’objectif ${reward.label}`} /><button type="button" className={styles.claimButton} disabled>Verrouillée</button></div>
      </article>)}</div>
    </section>}

    {untouched.length > 0 && <section className={`${styles.panel} ${styles.lockedPanel}`}>
      <div className={styles.panelTitle}><div><p className={styles.eyebrow}>À découvrir</p><h2>Objectifs pas encore commencés</h2></div><span>{untouched.length}</span></div>
      <div className={styles.grid}>{untouched.slice(0, showAllUntouched ? untouched.length : 30).map((reward) => <article className={`${styles.reward} ${styles.locked}`} key={reward.key}>
        <div className={styles.rewardValue}><span>+</span>{number(reward.coins)}<small>GP</small></div>
        <div className={styles.rewardCopy}><h3>{reward.label}</h3><p>{reward.detail}</p><div className={styles.progress}><span style={{ width: "0%" }} /></div><small>0/{reward.target} · pas encore commencé</small></div>
        <div className={styles.rewardActions}><button type="button" className={styles.infoButton} onClick={() => setInfo(reward)} aria-label={`Détail de l’objectif ${reward.label}`} /><button type="button" className={styles.claimButton} disabled>Verrouillée</button></div>
      </article>)}</div>
      {!showAllUntouched && untouched.length > 30 && <button type="button" className={styles.showMore} onClick={() => setShowAllUntouched(true)}>Afficher les {untouched.length} objectifs</button>}
    </section>}

    {recovered.length > 0 && <details className={styles.history}><summary>Récompenses déjà récupérées ({recovered.length})</summary><div>{recovered.map((reward) => <article key={reward.key}><span>✓</span><div><strong>{reward.label}</strong><small>{reward.detail}</small></div><b>+{number(reward.coins)} gigapuissances</b></article>)}</div></details>}

    {info && <div className={styles.infoBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setInfo(null); }}>
      <div className={styles.infoDialog} role="dialog" aria-modal="true" aria-labelledby="reward-info-title">
        <button type="button" className={styles.infoClose} onClick={() => setInfo(null)} aria-label="Fermer">×</button>
        <Image src="/images/leaderboard/info-medallion.webp" alt="" width={192} height={192} />
        <div><p className={styles.eyebrow}>Comment l’obtenir ?</p><h2 id="reward-info-title">{info.label}</h2><p>{objectiveExplanation(info)}</p><dl><div><dt>Progression</dt><dd>{info.current}/{info.target}</dd></div><div><dt>Il manque</dt><dd>{Math.max(0, info.target - info.current)}</dd></div><div><dt>Récompense</dt><dd>{number(info.coins)} gigapuissances</dd></div></dl></div>
      </div>
    </div>}
  </section>;
}
