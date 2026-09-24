import type { Rarity } from "@/lib/rarityStyles";

export function FlameDial({ rarity }: { rarity: Rarity }) {
  return <span className="steam-card-image-dial" data-rarity={rarity} aria-hidden="true">
    <img className="steam-card-flame-gif" src="/flame/pixel-flame.gif" alt="" />
  </span>;
}
