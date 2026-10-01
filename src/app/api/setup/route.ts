import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const schema = z.object({
  username: z.string().min(3).max(30),
  email:    z.string().email(),
  password: z.string().min(8),
});

export async function GET() {
  const adminExists = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  return NextResponse.json({ setupDone: !!adminExists });
}

export async function POST(req: NextRequest) {
  const adminExists = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (adminExists) return NextResponse.json({ error: "Setup déjà effectué" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides" }, { status: 400 });

  const { username, email, password } = parsed.data;
  const hash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: { username, email, password: hash, role: "ADMIN", status: "ACTIVE" },
  });

  return NextResponse.json({ ok: true });
}
