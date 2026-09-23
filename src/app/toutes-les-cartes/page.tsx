import { AppShell } from "@/components/AppShell";
import { ToutesLesCartesClient } from "./ToutesLesCartesClient";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Page() {
  const session = await auth();
  if (!session) redirect("/login");
  if ((session.user as { role?: string })?.role !== "ADMIN") redirect("/dashboard");

  return (
    <AppShell>
      <ToutesLesCartesClient />
    </AppShell>
  );
}
