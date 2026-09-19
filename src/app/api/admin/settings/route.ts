import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as any)?.role !== "ADMIN") throw new Error("Unauthorized");
}

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const settings = await prisma.appSetting.findMany();
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  return NextResponse.json(map);
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const body = await req.json();
  for (const [key, value] of Object.entries(body)) {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value: value as string },
      create: { key, value: value as string },
    });
  }
  return NextResponse.json({ ok: true });
}
