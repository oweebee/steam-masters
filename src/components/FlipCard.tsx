"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const faceBase: React.CSSProperties = {
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  transitionProperty: "visibility",
  transitionDuration: "0s",
  transitionDelay: "0.25s",
};

export function FlipCard({ front, back, canFlip = true, onFlipChange, forceClosed = false }: {
  front: ReactNode;
  back: ReactNode;
  canFlip?: boolean;
  onFlipChange?: (flipped: boolean) => void;
  forceClosed?: boolean;
}) {
  const [flipped, setFlipped] = useState(false);
  const [animating, setAnimating] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!forceClosed || !flipped) return;
    const timer = window.setTimeout(() => {
      setFlipped(false);
      setAnimating(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [forceClosed, flipped]);

  useEffect(() => {
    if (!flipped) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target instanceof Element && target.closest(".battle-preview-overlay")) return;
      const wrap = wrapRef.current;
      if (wrap?.contains(target)) return;
      const frame = wrap?.closest(".steam-owned-frame");
      if (frame?.contains(target)) return;
      setFlipped(false);
      setAnimating(true);
      onFlipChange?.(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [flipped, onFlipChange]);

  return <div
    ref={wrapRef}
    className={`steam-card-wrap relative w-full max-w-72 mx-auto h-[22rem] sm:h-[26rem] [perspective:1200px] ${flipped ? "is-flipped z-[49]" : ""} ${flipped && !animating ? "is-settled" : ""}`}
    onClick={(event) => {
      if (!canFlip) return;
      if (event.target instanceof Element && event.target.closest("a,button,input,select,textarea")) return;
      event.stopPropagation();
      setFlipped(!flipped);
      setAnimating(true);
      onFlipChange?.(!flipped);
    }}
  >
    <div
      className={`relative w-full h-full transition-transform duration-500 ${flipped ? "[transform:rotateY(180deg)]" : ""} ${canFlip ? "cursor-pointer" : ""}`}
      style={{ transformStyle: "preserve-3d" }}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "transform") setAnimating(false);
      }}
    >
      <div style={{ ...faceBase, visibility: flipped ? "hidden" : "visible" }} className="absolute inset-0">{front}</div>
      <div style={{ ...faceBase, transform: "rotateY(180deg)", visibility: flipped ? "visible" : "hidden" }} className="absolute inset-0">{back}</div>
    </div>
    {flipped && typeof document !== "undefined" && createPortal(<div className="fixed inset-0 z-[48] pointer-events-none" aria-hidden="true" />, document.body)}
  </div>;
}
