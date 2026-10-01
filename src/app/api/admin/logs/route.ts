import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const category = req.nextUrl.searchParams.get("category")?.trim().toUpperCase();
  const level = req.nextUrl.searchParams.get("level")?.trim().toUpperCase();
  const take = Math.min(500, Math.max(25, Number(req.nextUrl.searchParams.get("take")) || 200));
  const logs = await prisma.appLog.findMany({
    where: {
      ...(category && category !== "ALL" ? { category } : {}),
      ...(level && level !== "ALL" ? { level } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  return NextResponse.json({ logs, serverTime: new Date().toISOString() });
}
