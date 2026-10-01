"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./CardZoomDialog.module.css";

export type CardZoomOrigin = { x: number; y: number };

const dialogStack: string[] = [];
let bodyLockCount = 0;
let previousBodyOverflow = "";

function lockBody() {
  if (bodyLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  bodyLockCount += 1;
}

function unlockBody() {
  bodyLockCount = Math.max(0, bodyLockCount - 1);
  if (bodyLockCount === 0) document.body.style.overflow = previousBodyOverflow;
}

export function originFromElement(element: Element): CardZoomOrigin {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function CardZoomDialog({
  open,
  onClose,
  origin,
  label,
  size = "card",
  children,
}: {
  open: boolean;
  onClose: () => void;
  origin?: CardZoomOrigin | null;
  label: string;
  size?: "card" | "wide" | "owned";
  children: ReactNode;
}) {
  const id = useId();
  const [closing, setClosing] = useState(false);
  const [layer] = useState(() => dialogStack.length);
  const closingRef = useRef(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const requestClose = useCallback(() => {
    if (closingRef.current || dialogStack.at(-1) !== id) return;
    closingRef.current = true;
    setClosing(true);
    closeTimerRef.current = setTimeout(() => onCloseRef.current(), 190);
  }, [id]);

  useEffect(() => {
    if (!open) return;
    closingRef.current = false;
    dialogStack.push(id);
    lockBody();
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dialogStack.at(-1) === id) requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      const position = dialogStack.lastIndexOf(id);
      if (position >= 0) dialogStack.splice(position, 1);
      unlockBody();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [id, open, requestClose]);

  if (!open || typeof document === "undefined") return null;
  const shiftX = (origin?.x ?? window.innerWidth / 2) - window.innerWidth / 2;
  const shiftY = (origin?.y ?? window.innerHeight / 2) - window.innerHeight / 2;
  const style = { "--zoom-shift-x": `${shiftX}px`, "--zoom-shift-y": `${shiftY}px`, zIndex: 100 + layer * 10 } as CSSProperties;

  return createPortal(
    <div
      className={`${styles.overlay} ${closing ? styles.closing : ""}`}
      style={style}
      role="presentation"
      onPointerDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}
    >
      <section className={`${styles.surface} ${styles[size]}`} role="dialog" aria-modal="true" aria-label={label} onPointerDown={(event) => event.stopPropagation()}>
        <button ref={closeButtonRef} type="button" className={styles.close} onClick={requestClose} aria-label={`Fermer ${label}`}>×</button>
        <div className={styles.content}>{children}</div>
      </section>
    </div>,
    document.body
  );
}
