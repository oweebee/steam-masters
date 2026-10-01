import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { findDuplicateStudioGroups } from "@/lib/studioMerge";

export async function GET() {
  const session = await auth();
  if (!session || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const groups = await findDuplicateStudioGroups();
  return NextResponse.json({ groups });
}
