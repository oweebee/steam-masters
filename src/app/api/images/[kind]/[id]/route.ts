import { NextResponse } from "next/server";
import { loadStoredImage, type StoredImageKind } from "@/lib/storedImages";

export async function GET(_request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await context.params;
  if ((kind !== "game" && kind !== "studio") || !id || id.length > 160) {
    return NextResponse.json({ error: "Image invalide" }, { status: 400 });
  }
  try {
    const image = await loadStoredImage(kind as StoredImageKind, id);
    if (!image) return NextResponse.json({ error: "Image introuvable" }, { status: 404 });
    const data = image.data;
    const mimeType = image.mimeType;
    if (!data || !mimeType) return NextResponse.json({ error: "Image incomplète" }, { status: 404 });
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(data.byteLength),
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image indisponible";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
