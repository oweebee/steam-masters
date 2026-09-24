import { AdminTabs } from "@/components/AdminTabs";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if ((session.user as { role?: string })?.role !== "ADMIN") redirect("/dashboard");
  return (
    <div className="min-h-screen bg-gray-950">
      <AdminTabs />
      {children}
    </div>
  );
}
