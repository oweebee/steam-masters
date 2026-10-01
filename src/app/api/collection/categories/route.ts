import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function currentUserId() {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const categories = await prisma.cardCategory.findMany({
    where: { userId }, orderBy: { name: "asc" },
    include: { _count: { select: { cards: true } } },
  });
  return NextResponse.json(categories.map(({ _count, ...category }) => ({ ...category, cardCount: _count.cards })));
}

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const action = body?.action;

  if (action === "create") {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 24) : "";
    const color = typeof body.color === "string" ? body.color : "";
    if (!name || !/^#[0-9a-fA-F]{6}$/.test(color)) return NextResponse.json({ error: "Nom ou couleur invalide." }, { status: 400 });
    try {
      const category = await prisma.cardCategory.create({ data: { userId, name, color } });
      return NextResponse.json(category, { status: 201 });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        return NextResponse.json({ error: "Une catégorie porte déjà ce nom." }, { status: 409 });
      }
      throw error;
    }
  }

  if (action === "assign") {
    const categoryId = typeof body.categoryId === "string" ? body.categoryId : "";
    const cardIds: string[] = Array.isArray(body.cardIds) ? Array.from(new Set<string>(body.cardIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0))) : [];
    if (!categoryId || cardIds.length === 0 || cardIds.length > 100) return NextResponse.json({ error: "Sélection invalide." }, { status: 400 });
    const [category, owned] = await Promise.all([
      prisma.cardCategory.findFirst({ where: { id: categoryId, userId }, select: { id: true } }),
      prisma.card.findMany({ where: { id: { in: cardIds }, userId }, select: { id: true } }),
    ]);
    if (!category) return NextResponse.json({ error: "Catégorie introuvable." }, { status: 404 });
    if (owned.length !== cardIds.length) return NextResponse.json({ error: "Une carte ne t’appartient plus." }, { status: 400 });
    await prisma.cardCategoryAssignment.createMany({ data: cardIds.map((cardId: string) => ({ cardId, categoryId })), skipDuplicates: true });
    return NextResponse.json({ assigned: cardIds.length });
  }

  if (action === "unassign") {
    const categoryId = typeof body.categoryId === "string" ? body.categoryId : "";
    const cardIds: string[] = Array.isArray(body.cardIds) ? Array.from(new Set<string>(body.cardIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0))) : [];
    if (!categoryId || cardIds.length === 0 || cardIds.length > 100) return NextResponse.json({ error: "Sélection invalide." }, { status: 400 });
    const category = await prisma.cardCategory.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
    if (!category) return NextResponse.json({ error: "Catégorie introuvable." }, { status: 404 });
    await prisma.cardCategoryAssignment.deleteMany({ where: { categoryId, cardId: { in: cardIds }, card: { userId } } });
    return NextResponse.json({ removed: cardIds.length });
  }

  return NextResponse.json({ error: "Action invalide." }, { status: 400 });
}

export async function PATCH(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Catégorie invalide." }, { status: 400 });
  if (body.action === "delete") {
    const deleted = await prisma.cardCategory.deleteMany({ where: { id, userId } });
    return deleted.count ? NextResponse.json({ deleted: true }) : NextResponse.json({ error: "Catégorie introuvable." }, { status: 404 });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 24) : "";
  const color = typeof body.color === "string" ? body.color : "";
  if (!name || !/^#[0-9a-fA-F]{6}$/.test(color)) return NextResponse.json({ error: "Nom ou couleur invalide." }, { status: 400 });
  const result = await prisma.cardCategory.updateMany({ where: { id, userId }, data: { name, color } });
  if (!result.count) return NextResponse.json({ error: "Catégorie introuvable." }, { status: 404 });
  return NextResponse.json({ updated: true });
}
