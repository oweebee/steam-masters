"use client";
import { useCallback, useEffect, useState } from "react";

export type PlatformInfo = { name: string; logo: string | null };

// Chargé UNE fois pour toute l'app (des milliers de cartes l'utilisent).
let cache: Record<string, PlatformInfo> | null = null;
let pending: Promise<Record<string, PlatformInfo>> | null = null;
function load(): Promise<Record<string, PlatformInfo>> {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch("/api/platform-names")
    .then((r) => (r.ok ? r.json() : {}))
    .then((d: Record<string, PlatformInfo>) => (cache = d))
    .catch(() => (cache = {}));
  return pending;
}

export function usePlatformInfo() {
  const [info, setInfo] = useState<Record<string, PlatformInfo>>(cache ?? {});
  useEffect(() => {
    if (!cache) void load().then(setInfo);
  }, []);
  return info;
}

// Nom complet d'une plateforme (fallback : valeur brute).
export function usePlatformNames() {
  const info = usePlatformInfo();
  return useCallback((value: string) => info[value]?.name ?? value, [info]);
}
