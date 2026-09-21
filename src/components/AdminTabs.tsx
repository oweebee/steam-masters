"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Accueil", icon: "🏠" },
  { href: "/admin/users", label: "Utilisateurs", icon: "👥" },
  { href: "/admin/cards", label: "Toutes les cartes", icon: "🃏" },
  { href: "/admin/games", label: "Import de jeux", icon: "📥" },
  { href: "/admin/settings", label: "Configuration", icon: "⚙️" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <div className="steam-admin-tabs bg-gray-950 border-b border-gray-800 px-8 sticky top-0 z-20">
      <nav className="flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 whitespace-nowrap transition ${
                active
                  ? "border-amber-600 text-white"
                  : "border-transparent text-gray-400 hover:text-white hover:border-gray-700"
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
