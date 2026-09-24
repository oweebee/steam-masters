import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as { role?: string } | undefined)?.role !== "ADMIN")
    throw new Error("Unauthorized");
}

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const users = await prisma.user.findMany({
    select: { id: true, username: true, email: true, role: true, status: true, createdAt: true },
    orderBy: { username: "asc" },
  });
  users.sort((a, b) => a.username.localeCompare(b.username, "fr", { sensitivity: "base" }) || a.id.localeCompare(b.id));
  return NextResponse.json(users);
}

export async function PATCH(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const { id, status, role } = await req.json();
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const data: Record<string, string> = {};
  if (status) data.status = status;
  if (role)   data.role   = role;

  const user = await prisma.user.update({ where: { id }, data });
  return NextResponse.json({ ok: true, user });
}
