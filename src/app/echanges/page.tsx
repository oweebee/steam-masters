import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EchangesClient } from "./EchangesClient";

export default async function Page() {
  const session = await auth();
  if (!session) redirect("/login");
  const userId = (session.user as any).id as string;

  return (
    <AppShell>
      <EchangesClient myUserId={userId} />
    </AppShell>
  );
}
