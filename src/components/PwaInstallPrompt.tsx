"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import styles from "./PwaInstallPrompt.module.css";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type InstallMode = "native" | "ios" | "manual";

const DISMISSED_KEY = "sm_pwa_install_dismissed_at";
const DISMISS_DELAY = 7 * 24 * 60 * 60 * 1000;

function dismissedAt() { try { return Number(localStorage.getItem(DISMISSED_KEY) ?? 0); } catch { return 0; } }
function rememberDismissal() { try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch {} }
function forgetDismissal() { try { localStorage.removeItem(DISMISSED_KEY); } catch {} }

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function PwaInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<InstallMode>("manual");
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isInstalled()) return;
    const lastDismissal = dismissedAt();
    if (lastDismissal && Date.now() - lastDismissal < DISMISS_DELAY) return;
    const mobile = window.matchMedia("(max-width: 820px) and (pointer: coarse)").matches
      || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!mobile) return;
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    let fallbackTimer = 0;
    const showFallback = window.setTimeout(() => {
      setMode(ios ? "ios" : "manual");
      setVisible(true);
    }, 1800);
    fallbackTimer = showFallback;
    const beforeInstall = (rawEvent: Event) => {
      const event = rawEvent as InstallEvent;
      event.preventDefault();
      window.clearTimeout(fallbackTimer);
      setInstallEvent(event); setMode("native"); setVisible(true);
    };
    const installed = () => { forgetDismissal(); setVisible(false); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  function dismiss() {
    rememberDismissal();
    setVisible(false);
  }

  async function install() {
    if (!installEvent) return;
    setInstalling(true);
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "dismissed") rememberDismissal();
    setInstallEvent(null); setVisible(false); setInstalling(false);
  }

  if (!visible) return null;
  return <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
      <button type="button" className={styles.close} onClick={dismiss} aria-label="Fermer">×</button>
      <Image className={styles.device} src="/images/pwa/install-device.png" alt="Téléphone mécanique proposant l’installation" width={1024} height={1536} priority />
      <div className={styles.content}>
        <p className={styles.eyebrow}>Accès rapide sur ton téléphone</p>
        <h2 id="pwa-install-title">Installer Steam Masters</h2>
        <p>Ajoute le jeu à ton écran d’accueil pour le lancer comme une application, en plein écran.</p>
        {mode === "ios" && <ol><li>Touche le bouton <strong>Partager</strong> du navigateur.</li><li>Choisis <strong>Sur l’écran d’accueil</strong>, puis Ajouter.</li></ol>}
        {mode === "manual" && <ol><li>Ouvre le menu de ton navigateur.</li><li>Choisis <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.</li></ol>}
        <div className={styles.actions}>
          {mode === "native" ? <button type="button" className={styles.install} disabled={installing} onClick={() => void install()}>{installing ? "Installation…" : "Installer le jeu"}</button> : <button type="button" className={styles.install} onClick={dismiss}>J’ai compris</button>}
          <button type="button" className={styles.later} onClick={dismiss}>Plus tard</button>
        </div>
        <small>Si tu choisis « Plus tard », cette proposition reviendra dans 7 jours.</small>
      </div>
    </section>
  </div>;
}
