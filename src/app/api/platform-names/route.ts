import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getIgdbPlatforms } from "@/lib/igdb";
import { compactPlatformName } from "@/lib/platforms";

// Correspondance valeur stockée/affichée (abréviation IGDB, nom compact) -> nom complet
// + logo IGDB, pour les filtres plateforme et le pied des cartes.
// Noms d'affichage raccourcis (le nom IGDB complet est trop long pour un tag).
function displayName(name: string): string {
  if (/^super nintendo entertainment system/i.test(name)) return "Super Nintendo";
  if (/^super famicom/i.test(name)) return "Super Famicom";
  return name;
}

// Logo Windows (drapeau 4 panneaux) pour PC, à la place du logo IGDB.
const WINDOWS_LOGO = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88"><path fill="#0078D4" d="M0 12.402l35.687-4.86.016 34.423-35.67.203zm35.67 33.529l.028 34.453L.028 75.48.026 45.7zm4.326-39.025L87.314 0v41.527l-47.318.376zm47.329 39.349l-.011 41.34-47.318-6.678-.066-34.739z"/></svg>'
);

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const names: Record<string, { name: string; logo: string | null }> = {};
    for (const p of await getIgdbPlatforms()) {
      for (const key of [p.name, p.abbreviation, compactPlatformName(p.name), p.abbreviation ? compactPlatformName(p.abbreviation) : null]) {
        if (key && !(key in names)) names[key] = { name: displayName(p.name), logo: /windows/i.test(p.name) ? WINDOWS_LOGO : p.logo };
      }
    }
    return NextResponse.json(names, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch {
    return NextResponse.json({});
  }
}
