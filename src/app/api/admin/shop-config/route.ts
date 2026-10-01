import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAppLog } from "@/lib/appLog";
import { DEFAULT_SHOP_ROTATION_HOURS, parseShopPriceRanges, parseShopRotationHours, SHOP_PRICE_RANGES_KEY, SHOP_ROTATION_HOURS_KEY } from "@/lib/shopConfig";
import { rotateShopNow } from "@/lib/shop";

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as { role?: string })?.role !== "ADMIN") throw new Error("Unauthorized");
}

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const [settings, rotation] = await Promise.all([
    prisma.appSetting.findMany({ where: { key: { in: [SHOP_PRICE_RANGES_KEY, SHOP_ROTATION_HOURS_KEY] } }, select: { key: true, value: true } }),
    prisma.shopRotation.findFirst({ where: { endsAt: { gt: new Date() } }, orderBy: { startsAt: "desc" }, select: { startsAt: true, endsAt: true, _count: { select: { offers: true } } } }),
  ]);
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));
  return NextResponse.json({ ranges: parseShopPriceRanges(values.get(SHOP_PRICE_RANGES_KEY)), rotationHours: parseShopRotationHours(values.get(SHOP_ROTATION_HOURS_KEY)) ?? DEFAULT_SHOP_ROTATION_HOURS, rotation });
}

export async function PUT(request: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const body = await request.json().catch(() => null);
  const ranges = parseShopPriceRanges(body?.ranges ? JSON.stringify(body.ranges) : null);
  if (!ranges) return NextResponse.json({ error: "Chaque fourchette doit contenir deux entiers entre 1 et 1 000 000, avec un minimum inférieur ou égal au maximum." }, { status: 400 });
  const rotationHours = parseShopRotationHours(body?.rotationHours);
  if (!rotationHours) return NextResponse.json({ error: "La durée d’une rotation doit être comprise entre 1 et 24 heures." }, { status: 400 });

  await prisma.$transaction([
    prisma.appSetting.upsert({ where: { key: SHOP_PRICE_RANGES_KEY }, update: { value: JSON.stringify(ranges) }, create: { key: SHOP_PRICE_RANGES_KEY, value: JSON.stringify(ranges) } }),
    prisma.appSetting.upsert({ where: { key: SHOP_ROTATION_HOURS_KEY }, update: { value: String(rotationHours) }, create: { key: SHOP_ROTATION_HOURS_KEY, value: String(rotationHours) } }),
  ]);
  await writeAppLog({ category: "ADMIN", level: "WARNING", message: "Réglages du magasin modifiés", details: { ranges, rotationHours } });
  return NextResponse.json({ ranges, rotationHours });
}

export async function POST() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  try {
    const rotation = await rotateShopNow();
    await writeAppLog({ category: "ADMIN", level: "WARNING", message: "Rotation du magasin relancée manuellement", details: { rotationId: rotation.id, startsAt: rotation.startsAt, endsAt: rotation.endsAt } });
    const result = await prisma.shopRotation.findUniqueOrThrow({ where: { id: rotation.id }, select: { startsAt: true, endsAt: true, _count: { select: { offers: true } } } });
    return NextResponse.json({ rotation: result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Relance impossible" }, { status: 400 });
  }
}
