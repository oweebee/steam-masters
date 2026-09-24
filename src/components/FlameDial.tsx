import type { Rarity } from "@/lib/rarityStyles";

export function FlameDial({ rarity }: { rarity: Rarity }) {
  return <span className="steam-card-image-dial" data-rarity={rarity} aria-hidden="true">
    <img className="steam-card-flame-gif" src="/flame/triple-flames.gif" alt="" />
  </span>;
}
