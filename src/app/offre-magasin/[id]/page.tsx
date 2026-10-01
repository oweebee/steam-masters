import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { prisma } from "@/lib/prisma";
import { ShopOfferPopup } from "./ShopOfferPopup";

export const dynamic = "force-dynamic";

export default async function ShopOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");
  const { id } = await params;
  const [offer, user] = await Promise.all([
    prisma.shopOffer.findUnique({
      where: { id },
      select: {
        id: true, rarity: true, atk: true, price: true, purchasedAt: true,
        rotation: { select: { endsAt: true } },
        game: true,
        studio: true,
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { coins: true } }),
  ]);
  if (!offer || (!offer.game && !offer.studio)) notFound();

  return <AppShell><ShopOfferPopup
    offer={{
      ...offer,
      purchasedAt: offer.purchasedAt?.toISOString() ?? null,
      endsAt: offer.rotation.endsAt.toISOString(),
    }}
    initialCoins={user?.coins ?? 0}
  /></AppShell>;
}
