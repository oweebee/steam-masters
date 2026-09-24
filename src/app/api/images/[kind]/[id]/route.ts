import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadStoredImage, storedImageKey, type StoredImageKind } from "@/lib/storedImages";

const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

export async function GET(request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await context.params;
  if ((kind !== "game" && kind !== "studio") || !id || id.length > 160) {
    return NextResponse.json({ error: "Image invalide" }, { status: 400 });
  }
  try {
    // Revalidation navigateur : on compare l'ETag avec une lecture légère
    // (updatedAt seul) sans charger le binaire (jusqu'à 3 Mo) depuis PostgreSQL.
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch) {
      const meta = await prisma.storedImage.findUnique({
        where: { key: storedImageKey(kind as StoredImageKind, id) },
        select: { updatedAt: true },
      });
      if (meta && ifNoneMatch === `"${meta.updatedAt.getTime()}"`) {
        return new Response(null, { status: 304, headers: { ETag: ifNoneMatch, "Cache-Control": CACHE_CONTROL } });
      }
    }
    const image = await loadStoredImage(kind as StoredImageKind, id);
    if (!image) return NextResponse.json({ error: "Image introuvable" }, { status: 404 });
    const data = image.data;
    const mimeType = image.mimeType;
    if (!data || !mimeType) return NextResponse.json({ error: "Image incomplète" }, { status: 404 });
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(data.byteLength),
        "Cache-Control": CACHE_CONTROL,
        ETag: `"${image.updatedAt.getTime()}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image indisponible";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
