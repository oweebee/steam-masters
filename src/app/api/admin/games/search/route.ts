import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as any)?.role !== "ADMIN") throw new Error("Unauthorized");
}

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const term = req.nextUrl.searchParams.get("q")?.trim();
  if (!term || term.length < 2) return NextResponse.json([]);

  // Recherche officielle Steam (catalogue global, pas la bibliothèque de l'user).
  const res = await fetch(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=french&cc=FR`,
    { cache: "no-store" }
  );
  if (!res.ok) return NextResponse.json({ error: "Recherche Steam indisponible" }, { status: 502 });

  const json = await res.json();
  const items = (json.items ?? [])
    .filter((it: any) => it.type === "app")
    .slice(0, 10)
    .map((it: any) => ({ appid: it.id, name: it.name, tinyImage: it.tiny_image }));

  return NextResponse.json(items);
}
