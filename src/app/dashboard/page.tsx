import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-white">Steam Masters</h1>
        <div className="flex items-center gap-4">
          {(session.user as any)?.role === "ADMIN" && (
            <Link href="/admin" className="text-purple-400 hover:text-purple-300 text-sm">Console Admin</Link>
          )}
          <span className="text-gray-400 text-sm">{session.user?.name}</span>
          <a href="/api/auth/signout" className="text-gray-500 hover:text-white text-sm">Déconnexion</a>
        </div>
      </div>
      <p className="text-gray-400">Dashboard — à venir.</p>
    </div>
  );
}
