"use client";

import { createContext, useContext } from "react";
import type { CardZoomOrigin } from "./CardZoomDialog";

export type OpenStudioOverlay = (name: string, origin?: CardZoomOrigin | null) => void;
export const CardOverlayContext = createContext<OpenStudioOverlay | null>(null);

export function useCardOverlay() {
  return useContext(CardOverlayContext);
}
