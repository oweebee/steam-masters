import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const schema = z.object({
  username: z.string().min(3).max(30),
  email:    z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides" }, { status: 400 });

  const { username, email, password } = parsed.data;

  const exists = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (exists) return NextResponse.json({ error: "Email ou username déjà utilisé" }, { status: 409 });

  const hash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { username, email, password: hash, role: "USER", status: "PENDING" },
  });

  return NextResponse.json({ ok: true });
}
