"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Wrapper unique pour toutes les cartes à effet flip 3D (GameCard, StudioCard...).
// Bug corrigé ici une fois pour toutes : backface-visibility seul est insuffisant
// sur certains moteurs de rendu (le contenu de la face avant, ex. badge de rareté,
// reste visible en miroir au dos). Fix : on bascule aussi `visibility` sur l'état
// React `flipped`, avec un délai calé sur la moitié de l'animation (rotation à 90°,
// carte vue par la tranche) — la face cachée est donc RÉELLEMENT retirée du rendu,
// indépendamment du support navigateur de backface-visibility.
// Délai FIXE (pas conditionné par le sens du flip) : la bascule visible<->hidden
// doit toujours se faire à la moitié de l'animation (250ms sur 500ms), qu'on aille
// avant->arrière ou arrière->avant. Un délai qui dépend de `flipped` cache la face
// de départ à t=0 (avant que la face d'arrivée ne s'affiche à t=250ms) => trou noir
// de 250ms au milieu du flip (carte qui "disparaît" avant de "réapparaître").
const faceBase: React.CSSProperties = {
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  transitionProperty: "visibility",
  transitionDuration: "0s",
  transitionDelay: "0.25s",
};

export function FlipCard({
  front,
  back,
  canFlip = true,
  onFlipChange,
}: {
  front: ReactNode;
  back: ReactNode;
  canFlip?: boolean;
  onFlipChange?: (flipped: boolean) => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!flipped) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const wrap = wrapRef.current;
      if (wrap?.contains(target)) return;
      // Dans la collection, le panneau d'actions fait partie de la carte ouverte.
      const frame = wrap?.closest(".steam-owned-frame");
      if (frame?.contains(target)) return;
      setFlipped(false);
      onFlipChange?.(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [flipped, onFlipChange]);

  return (
    <div
      ref={wrapRef}
      className="steam-card-wrap relative w-72 h-[26rem] [perspective:1200px]"
      onClick={() => {
        if (!canFlip) return;
        setFlipped(!flipped);
        onFlipChange?.(!flipped);
      }}
    >
      <div
        className={`relative w-full h-full transition-transform duration-500 ${
          flipped ? "[transform:rotateY(180deg)]" : ""
        } ${canFlip ? "cursor-pointer" : ""}`}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* FACE AVANT */}
        <div
          style={{
            ...faceBase,
            visibility: flipped ? "hidden" : "visible",
          }}
          className="absolute inset-0"
        >
          {front}
        </div>

        {/* FACE ARRIÈRE */}
        <div
          style={{
            ...faceBase,
            transform: "rotateY(180deg)",
            visibility: flipped ? "visible" : "hidden",
          }}
          className="absolute inset-0"
        >
          {back}
        </div>
      </div>
    </div>
  );
}
