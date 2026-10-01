import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getIgdbPlatforms } from "@/lib/igdb";

export async function GET() {
  const session = await auth();
  if (!session || (session.user as { role?: string }).role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    // PC inclus : la règle "sortie PC avant 2005" est appliquée à la découverte et à l'import.
    return NextResponse.json(await getIgdbPlatforms());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Plateformes IGDB indisponibles" }, { status: 502 });
  }
}
