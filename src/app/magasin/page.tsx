import { auth } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import { MagasinClient } from "./MagasinClient";

export default async function MagasinPage() {
  const session = await auth();
  if (!session) redirect("/login");
  return <AppShell><MagasinClient /></AppShell>;
}
