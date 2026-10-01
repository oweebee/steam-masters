import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "./Sidebar";
import { NotifToaster } from "./NotifToaster";
import { PushLogoutLink } from "./PushLogoutLink";
import { sanitizeSidebarOrder } from "@/lib/sidebarOrder";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  const sessionUser = session.user as { id?: string; role?: string } | undefined;
  const userId = sessionUser?.id;
  const [user, unreadNotifs, unreadMsgs] = await Promise.all([
    userId ? prisma.user.findUnique({ where: { id: userId } }) : null,
    userId ? prisma.notification.count({ where: { userId, read: false } }) : 0,
    userId ? prisma.message.count({ where: { toUserId: userId, read: false, isAnnouncement: false } }) : 0,
  ]);
  const isAdmin = sessionUser?.role === "ADMIN";

  return (
    <div className="steam-app-shell min-h-screen bg-gray-950 flex">
      <Sidebar isAdmin={isAdmin} username={session.user?.name ?? ""} coins={user?.coins ?? 0} unreadNotifs={unreadNotifs} unreadMsgs={unreadMsgs} initialOrder={sanitizeSidebarOrder(user?.sidebarOrder)} />
      <main className="steam-main flex-1 p-8 flex flex-col">
        {/* Barre mobile : coins + déconnexion (sidebar masquée en dessous de sm) */}
        <div className="flex sm:hidden items-center justify-between pb-2 mb-2 border-b border-gray-800">
          <span className="text-amber-400 text-sm font-semibold">
            {user?.coins ?? 0} <span className="text-gray-600 font-normal">GP</span>
          </span>
          <span className="text-gray-500 text-sm truncate mx-3 min-w-0">{session.user?.name ?? ""}</span>
          <PushLogoutLink
            title="Déconnexion"
            className="text-gray-600 hover:text-white text-lg shrink-0"
          >
            ⏻
          </PushLogoutLink>
        </div>
        <div className="flex-1">{children}</div>
        <NotifToaster />
      </main>
    </div>
  );
}
