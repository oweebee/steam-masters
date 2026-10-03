import Link from "next/link";

export function BattleModeNav({ active }: { active: "escalade" | "dice" }) {
  return <nav className="battle-mode-nav" aria-label="Modes de bataille">
    <Link href="/bataille/des-tueurs" aria-current={active === "dice" ? "page" : undefined} className={active === "dice" ? "is-active" : ""}>
      <span aria-hidden="true">⚄</span><b>Combat de dés</b><small>Le Killer · tour par tour</small>
    </Link>
    <Link href="/bataille/escalade" aria-current={active === "escalade" ? "page" : undefined} className={active === "escalade" ? "is-active" : ""}>
      <span aria-hidden="true">⚔</span><b>L’Escalade</b><small>Cartes tactiques</small>
    </Link>
  </nav>;
}
