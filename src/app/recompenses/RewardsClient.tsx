"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { LeaderboardReward } from "@/lib/leaderboard";
import styles from "./rewards.module.css";

type Claim = { rewardKey: string; coins: number; claimedAt: string };
const number = (value: number) => new Intl.NumberFormat("fr-FR").format(value);

export function RewardsClient({ rewards, claims }: { rewards: LeaderboardReward[]; claims: Claim[] }) {
  const router = useRouter();
  const [claimed, setClaimed] = useState(() => new Set(claims.map((claim) => claim.rewardKey)));
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [collectedGp, setCollectedGp] = useState(() => claims.reduce((total, claim) => total + claim.coins, 0));
  const pending = useMemo(() => rewards.filter((reward) => !claimed.has(reward.key)), [rewards, claimed]);
  const recovered = useMemo(() => rewards.filter((reward) => claimed.has(reward.key)), [rewards, claimed]);
  const pendingGp = pending.reduce((total, reward) => total + reward.coins, 0);

  async function claim(reward: LeaderboardReward) {
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
      <article><span>Gain disponible</span><strong>{number(pendingGp)}</strong><small>GP</small></article>
      <article><span>Déjà récupéré</span><strong>{number(collectedGp)}</strong><small>GP au total</small></article>
    </div>

    <section className={styles.panel}>
      <div className={styles.panelTitle}><div><p className={styles.eyebrow}>Prêtes à être encaissées</p><h2>Récompenses débloquées</h2></div><span>{pending.length}</span></div>
      {pending.length ? <div className={styles.grid}>{pending.map((reward) => <article className={styles.reward} key={reward.key}>
        <div className={styles.rewardValue}><span>+</span>{number(reward.coins)}<small>GP</small></div>
        <div className={styles.rewardCopy}><h3>{reward.label}</h3><p>{reward.detail}</p><div className={styles.progress}><span style={{ width: `${Math.min(100, reward.current / reward.target * 100)}%` }} /></div><small>Objectif atteint · {reward.current}/{reward.target}</small></div>
        <button type="button" disabled={Boolean(claiming)} onClick={() => void claim(reward)}>{claiming === reward.key ? "Récupération…" : "Récupérer"}</button>
      </article>)}</div> : <div className={styles.empty}><strong>Aucune récompense en attente</strong><p>Les prochains gains demandent des collections plus profondes. Continue à compléter plateformes, DLC, studios et séries de rareté.</p></div>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>

    {recovered.length > 0 && <details className={styles.history}><summary>Récompenses déjà récupérées ({recovered.length})</summary><div>{recovered.map((reward) => <article key={reward.key}><span>✓</span><div><strong>{reward.label}</strong><small>{reward.detail}</small></div><b>+{number(reward.coins)} GP</b></article>)}</div></details>}
  </section>;
}
