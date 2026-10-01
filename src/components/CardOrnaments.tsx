// platformLogo : remplace la roue crantée bas-gauche, en miroir du losange de rareté.
export function CardOrnaments({ platformLogo }: { platformLogo?: string | null } = {}) {
  return (
    <div className="steam-card-rig" aria-hidden="true">
      <span className="steam-card-pipe steam-card-pipe-top" />
      <span className="steam-card-pipe steam-card-pipe-side" />
      {platformLogo
        ? <span className="steam-card-platform-badge"><img src={platformLogo} alt="" className="steam-card-platform-logo" loading="lazy" /></span>
        : <span className="steam-card-cog steam-card-cog-left">⚙</span>}
      <span className="steam-card-cog steam-card-cog-right">⚙</span>
      <span className="steam-card-rarity-gem" />
      <span className="steam-card-clamp steam-card-clamp-left" />
      <span className="steam-card-clamp steam-card-clamp-right" />
    </div>
  );
}
