"use client";

import { useEffect, useState } from "react";

type PushState = "loading" | "unsupported" | "unconfigured" | "blocked" | "disabled" | "enabled" | "busy";

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function saveSubscription(subscription: PushSubscription) {
  const response = await fetch("/api/push/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? "Enregistrement impossible");
  }
}

export function PushNotificationSettings() {
  const [state, setState] = useState<PushState>("loading");
  const [publicKey, setPublicKey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const initialize = async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }
      const response = await fetch("/api/push/subscription", { cache: "no-store" });
      if (!response.ok) throw new Error("Configuration Push inaccessible");
      const config = await response.json();
      if (!config.configured || !config.publicKey) {
        setState("unconfigured");
        return;
      }
      setPublicKey(config.publicKey);
      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await saveSubscription(subscription);
        setState("enabled");
      } else {
        setState("disabled");
      }
    };
    const initial = window.setTimeout(() => void initialize().catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Initialisation impossible");
      setState("disabled");
    }), 0);
    return () => window.clearTimeout(initial);
  }, []);

  async function enable() {
    setState("busy"); setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "disabled");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
      await saveSubscription(subscription);
      setState("enabled");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Activation impossible");
      setState("disabled");
    }
  }

  async function disable() {
    setState("busy"); setError("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscription", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setState("disabled");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Désactivation impossible");
      setState("enabled");
    }
  }

  const label = state === "enabled" ? "Notifications activées" : state === "busy" ? "Mise à jour…" : "Activer les notifications";
  return <section className="push-settings-panel">
    <div className="push-settings-icon" aria-hidden="true">🔔</div>
    <div className="push-settings-copy">
      <small>ALERTES PAR APPAREIL</small>
      <h2>Notifications navigateur</h2>
      <p>Reçois les alertes Steam Masters sur ta PWA mobile et sur ton navigateur PC, même quand le site est fermé.</p>
      {state === "blocked" && <p className="push-settings-warning">Autorisation bloquée : réactive les notifications dans les réglages du navigateur.</p>}
      {state === "unsupported" && <p className="push-settings-warning">Ce navigateur ne prend pas en charge les notifications Web Push.</p>}
      {state === "unconfigured" && <p className="push-settings-warning">Le serveur Web Push attend ses clés VAPID.</p>}
      {error && <p className="push-settings-warning">{error}</p>}
    </div>
    <button type="button" className={`push-settings-toggle${state === "enabled" ? " is-enabled" : ""}`} disabled={["loading", "busy", "blocked", "unsupported", "unconfigured"].includes(state)} onClick={() => void (state === "enabled" ? disable() : enable())}>
      <i aria-hidden="true" /><span>{state === "enabled" ? "Désactiver" : label}</span>
    </button>
  </section>;
}
