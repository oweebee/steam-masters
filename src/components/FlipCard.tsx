"use client";
import { useState, type ReactNode } from "react";

// Wrapper unique pour toutes les cartes à effet flip 3D (GameCard, StudioCard...).
// Bug corrigé ici une fois pour toutes : backface-visibility seul est insuffisant
// sur certains moteurs de rendu (le contenu de la face avant, ex. badge de rareté,
// reste visible en miroir au dos). Fix : on bascule aussi `visibility` sur l'état
// React `flipped`, avec un délai calé sur la moitié de l'animation (rotation à 90°,
// carte vue par la tranche) — la face cachée est donc RÉELLEMENT retirée du rendu,
// indépendamment du support navigateur de backface-visibility.
const faceBase: React.CSSProperties = {
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  transitionProperty: "visibility",
  transitionDuration: "0s",
};

export function FlipCard({
  front,
  back,
  canFlip = true,
}: {
  front: ReactNode;
  back: ReactNode;
  canFlip?: boolean;
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className="relative w-72 h-[26rem] [perspective:1200px]"
      onClick={() => canFlip && setFlipped((f) => !f)}
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
            transitionDelay: flipped ? "0s" : "0.25s",
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
            transitionDelay: flipped ? "0.25s" : "0s",
          }}
          className="absolute inset-0"
        >
          {back}
        </div>
      </div>
    </div>
  );
}
