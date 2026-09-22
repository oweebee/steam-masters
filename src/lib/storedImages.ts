import { isIP } from "node:net";
import { prisma } from "@/lib/prisma";

export type StoredImageKind = "game" | "studio";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export function storedImageKey(kind: StoredImageKind, id: string) {
  return `${kind}:${id}`;
}

export function storedImageUrl(kind: StoredImageKind, id: string) {
  return `/api/images/${kind}/${encodeURIComponent(id)}`;
}

export function isStoredImageUrl(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith("/api/images/");
}

function assertSafeRemoteUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("L’image doit utiliser HTTPS");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) throw new Error("Hôte d’image interdit");
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    const octets = hostname.split(".").map(Number);
    if (octets[0] === 10 || octets[0] === 127 || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168)) throw new Error("Hôte d’image privé interdit");
  }
  if (ipVersion === 6 && (hostname === "::1" || hostname.startsWith("fe80:") || hostname.startsWith("fc") || hostname.startsWith("fd"))) {
    throw new Error("Hôte d’image privé interdit");
  }
  return url;
}

async function downloadImage(rawUrl: string, redirectsLeft = 3): Promise<{ data: Buffer; mimeType: string; finalUrl: string }> {
  const url = assertSafeRemoteUrl(rawUrl);
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "manual",
    headers: { "User-Agent": "SteamMasters/1.0 image-cache", Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
  });
  if (response.status >= 300 && response.status < 400) {
    if (redirectsLeft === 0) throw new Error("Trop de redirections pour l’image");
    const location = response.headers.get("location");
    if (!location) throw new Error("Redirection d’image invalide");
    return downloadImage(new URL(location, url).toString(), redirectsLeft - 1);
  }
  if (!response.ok) throw new Error(`Téléchargement image HTTP ${response.status}`);
  const mimeType = response.headers.get("content-type")?.split(";", 1)[0].toLowerCase() ?? "";
  if (!ALLOWED_MIME.has(mimeType)) throw new Error(`Format d’image refusé : ${mimeType || "inconnu"}`);
  const announcedSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(announcedSize) && announcedSize > MAX_IMAGE_BYTES) throw new Error("Image trop volumineuse");
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length === 0 || data.length > MAX_IMAGE_BYTES) throw new Error("Taille d’image invalide");
  return { data, mimeType, finalUrl: url.toString() };
}

export async function persistRemoteImage(kind: StoredImageKind, id: string, sourceUrl: string) {
  if (isStoredImageUrl(sourceUrl)) return sourceUrl;
  const key = storedImageKey(kind, id);
  const existing = await prisma.storedImage.findUnique({ where: { key }, select: { data: true, sourceUrl: true } });
  if (existing?.data && existing.sourceUrl === sourceUrl) return storedImageUrl(kind, id);
  const downloaded = await downloadImage(sourceUrl);
  await prisma.storedImage.upsert({
    where: { key },
    create: { key, data: downloaded.data, mimeType: downloaded.mimeType, sourceUrl: downloaded.finalUrl },
    update: { data: downloaded.data, mimeType: downloaded.mimeType, sourceUrl: downloaded.finalUrl },
  });
  return storedImageUrl(kind, id);
}

export async function loadStoredImage(kind: StoredImageKind, id: string) {
  const key = storedImageKey(kind, id);
  let stored = await prisma.storedImage.findUnique({ where: { key } });
  if (!stored) return null;
  if (!stored.data && stored.sourceUrl) {
    await persistRemoteImage(kind, id, stored.sourceUrl);
    stored = await prisma.storedImage.findUnique({ where: { key } });
  }
  if (!stored?.data || !stored.mimeType) return null;
  return stored;
}
