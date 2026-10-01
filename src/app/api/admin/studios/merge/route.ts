import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { mergeStudios } from "@/lib/studioMerge";

export async function POST(req: Request) {
  const session = await auth();
  if (!session || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const keepId = typeof body?.keepId === "string" ? body.keepId : null;
  const mergeIds = Array.isArray(body?.mergeIds) ? body.mergeIds.filter((id: unknown): id is string => typeof id === "string") : null;
  if (!keepId || !mergeIds || mergeIds.length === 0) {
    return NextResponse.json({ error: "keepId et mergeIds (non vide) requis." }, { status: 400 });
  }
  try {
    const result = await mergeStudios(keepId, mergeIds);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[studios/merge]", keepId, mergeIds, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Fusion impossible" }, { status: 500 });
  }
}
