"use client";
import { useEffect } from "react";

// Sans ceci, une PWA deja installee/ouverte continue de tourner sur l'ancien
// JS en memoire apres un deploiement : le nouveau service worker prend le
// controle (skipWaiting/clients.claim cote sw.js) mais rien ne rechargeait
// la page pour charger les nouveaux bundles. D'ou des bugs "corriges" qui
// persistent indefiniment tant que l'utilisateur ne force pas la fermeture
// complete de l'app.
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloaded = false;
    const reloadOnce = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    // Se declenche quand un nouveau SW (skipWaiting) prend le controle :
    // signe qu'un nouveau build est disponible, on recharge pour l'appliquer.
    navigator.serviceWorker.addEventListener("controllerchange", reloadOnce);

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      // Verifie s'il y a une MAJ a chaque retour au premier plan (l'utilisateur
      // rouvre l'app depuis l'ecran d'accueil / change d'onglet) : c'est le
      // moment le plus courant ou une nouvelle version a ete deployee entre-temps.
      const checkForUpdate = () => { void registration.update().catch(() => {}); };
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkForUpdate();
      });
      window.addEventListener("focus", checkForUpdate);
      checkForUpdate();
    }).catch(() => {});
  }, []);
  return null;
}
