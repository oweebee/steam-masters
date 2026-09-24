import type { Rarity } from "@/lib/rarityStyles";

export function FlameDial({ rarity }: { rarity: Rarity }) {
  const color = rarity === "LEGENDARY" ? "red" : rarity === "UNCOMMON" ? "green" : "blue";
  return <span className="steam-card-image-dial" data-rarity={rarity} aria-hidden="true">
    <img className="steam-card-flame-image" src={`/flame/${color}-flame.png`} alt="" />
  </span>;
}
