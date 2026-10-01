import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeSidebarOrder } from "@/lib/sidebarOrder";

export async function POST(request: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const order = sanitizeSidebarOrder(body?.order);
  if (!order.length) return NextResponse.json({ error: "Ordre invalide" }, { status: 400 });
  await prisma.user.update({ where: { id: userId }, data: { sidebarOrder: order } });
  return NextResponse.json({ order });
}
