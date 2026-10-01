"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./BattlePresentation.module.css";

/** All ornamental artwork is generated with ImageGen; labels stay accessible HTML. */
export function BattlePlaque({ children }: { children: ReactNode }) {
  return <div className={styles.plaque}>{children}</div>;
}

export function CoinToss() {
  return <div className={styles.coin} aria-hidden="true" />;
}

export function BattleResultDialog({ children, className, onAcknowledge }: { children: ReactNode; className: string; onAcknowledge: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className={`${className} ${styles.resultDialog}`} aria-label="Résultat de la bataille" onCancel={event => { event.preventDefault(); onAcknowledge(); }}>{children}</dialog>;
}

export function TurnAnnouncement({ mine, phase }: { mine: boolean; phase: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 1700);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return <div className={styles.turn} role="status">
    <BattlePlaque><strong>{mine ? "À toi de jouer" : "Tour adverse"}</strong><small>{phase === "REPLY" ? "Répondre au bouclier" : phase === "RELAY" ? "Nouvel assaut" : "Poser un bouclier"}</small></BattlePlaque>
  </div>;
}

export { styles as battlePresentation };
