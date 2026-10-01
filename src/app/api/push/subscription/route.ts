import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireUserId() {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

function validPushEndpoint(value: unknown) {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    const allowed = host === "fcm.googleapis.com"
      || host === "web.push.apple.com"
      || host.endsWith(".push.services.mozilla.com")
      || host.endsWith(".notify.windows.com");
    return allowed ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  if (!await requireUserId()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
  return NextResponse.json({ configured: Boolean(publicKey && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT), publicKey });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const endpoint = validPushEndpoint(body?.endpoint);
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const authKey = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (!endpoint || !p256dh || !authKey || p256dh.length > 512 || authKey.length > 512) {
    return NextResponse.json({ error: "Abonnement Push invalide" }, { status: 400 });
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId, p256dh, auth: authKey },
    create: { userId, endpoint, p256dh, auth: authKey },
  });
  return NextResponse.json({ subscribed: true });
}

export async function DELETE(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (endpoint) await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  return NextResponse.json({ subscribed: false });
}
