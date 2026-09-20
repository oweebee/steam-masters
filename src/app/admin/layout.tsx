import { AdminTabs } from "@/components/AdminTabs";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950">
      <AdminTabs />
      {children}
    </div>
  );
}
