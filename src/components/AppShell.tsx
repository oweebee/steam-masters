import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "./Sidebar";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  const userId = (session.user as any)?.id as string | undefined;
  const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  const isAdmin = (session.user as any)?.role === "ADMIN";

  return (
    <div className="steam-app-shell min-h-screen bg-gray-950 flex">
      <Sidebar isAdmin={isAdmin} username={session.user?.name ?? ""} coins={user?.coins ?? 0} />
      <main className="steam-main flex-1 p-8 flex flex-col">
        <div className="flex-1">{children}</div>
        <footer className="pt-8 text-right text-[10px] text-stone-600"><a href="/flame/README.md" className="hover:text-amber-400">Crédit de la flamme animée</a></footer>
      </main>
    </div>
  );
}
