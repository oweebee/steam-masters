import { auth } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import { MarcheClient } from "./MarcheClient";

export default async function Page() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  return <AppShell><MarcheClient userId={userId} /></AppShell>;
}
