import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureActiveShopRotation } from "@/lib/shop";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rotation = await ensureActiveShopRotation();
    const [offers, user] = await Promise.all([
      prisma.shopOffer.findMany({
        where: { rotationId: rotation.id },
        select: {
          id: true,
          rarity: true,
          atk: true,
          price: true,
          purchasedAt: true,
          game: true,
          studio: true,
        },
        orderBy: [{ purchasedAt: "asc" }, { price: "asc" }, { id: "asc" }],
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { coins: true } }),
    ]);
    return NextResponse.json({
      startsAt: rotation.startsAt,
      endsAt: rotation.endsAt,
      coins: user?.coins ?? 0,
      offers,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Magasin indisponible" }, { status: 503 });
  }
}
