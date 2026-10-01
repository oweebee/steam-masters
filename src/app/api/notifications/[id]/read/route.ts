import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = (await auth())?.user?.id;
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { id } = await params;
  await prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
  return NextResponse.json({ ok: true });
}
