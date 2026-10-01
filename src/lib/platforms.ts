const COMPACT_NAMES: Record<string, string> = {
  "pc (windows)": "PC", windows: "PC", pc: "PC",
  "nintendo entertainment system": "NES", nes: "NES",
  "super nintendo entertainment system": "SNES", snes: "SNES",
  "game boy": "GB", "game boy color": "GBC", "game boy advance": "GBA",
  "neo geo cd": "Neo Geo CD", "neo geo": "Neo Geo",
  "playstation": "PS1", "playstation 1": "PS1", "playstation 2": "PS2", "playstation 3": "PS3", "playstation 4": "PS4", "playstation 5": "PS5",
  "mega drive / genesis": "Mega Drive", "sega mega drive/genesis": "Mega Drive", "sega mega drive": "Mega Drive",
  "nintendo gamecube": "NGC", gamecube: "NGC", "nintendo switch": "Switch",
  "xbox 360": "Xbox 360", "xbox one": "Xbox One", "xbox series x|s": "Xbox Series",
};

export function compactPlatformName(value: string) {
  return COMPACT_NAMES[value.trim().toLocaleLowerCase("fr")] ?? value;
}

export function platformsForGame(platforms: string[] | undefined, source?: "STEAM" | "IGDB") {
  return platforms?.length ? platforms.map(compactPlatformName) : source === "STEAM" ? ["PC"] : [];
}

export function matchesPlatform(platforms: string[] | undefined, source: "STEAM" | "IGDB" | undefined, selected: string) {
  return selected === "ALL" || platformsForGame(platforms, source).includes(selected);
}

export function platformOptions(games: Array<{ platforms?: string[]; source?: "STEAM" | "IGDB" }>) {
  return Array.from(new Set(games.flatMap((game) => platformsForGame(game.platforms, game.source)))).sort((a, b) => a.localeCompare(b, "fr"));
}
