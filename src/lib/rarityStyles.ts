export type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

// Palier de couleur du tirage (loot table), partagé par GameCard/StudioCard/admin.
// COMMON=Blanc, UNCOMMON=Vert, RARE=Bleu, EPIC=Violet, LEGENDARY=Orange.
export const RARITY_STYLES: Record<Rarity, { border: string; glow: string; label: string; text: string }> = {
  COMMON:    { border: "border-gray-300",   glow: "",                                          label: "bg-gray-400",   text: "Blanc" },
  UNCOMMON:  { border: "border-green-500",  glow: "shadow-[0_0_12px_rgba(34,197,94,0.4)]",      label: "bg-green-600",  text: "Vert" },
  RARE:      { border: "border-blue-500",   glow: "shadow-[0_0_14px_rgba(59,130,246,0.5)]",     label: "bg-blue-600",   text: "Bleu" },
  EPIC:      { border: "border-purple-500", glow: "shadow-[0_0_16px_rgba(168,85,247,0.6)]",     label: "bg-purple-600", text: "Violet" },
  LEGENDARY: { border: "border-orange-500", glow: "shadow-[0_0_20px_rgba(249,115,22,0.7)]",     label: "bg-orange-500", text: "Orange" },
};

export const RARITY_ORDER: Record<Rarity, number> = {
  LEGENDARY: 0,
  EPIC: 1,
  RARE: 2,
  UNCOMMON: 3,
  COMMON: 4,
};
