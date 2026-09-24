"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Accueil", icon: "🏠" },
  { href: "/admin/users", label: "Utilisateurs", icon: "👥" },
  { href: "/admin/cards", label: "Toutes les cartes", icon: "🃏" },
  { href: "/admin/games", label: "Import de jeux", icon: "📥" },
  { href: "/admin/logs", label: "Journal", icon: "📜" },
  { href: "/admin/settings", label: "Configuration", icon: "⚙️" },
];

const SHORTCUTS = [
  { href: "/dashboard", label: "Paquets", icon: "📦" },
  { href: "/collection", label: "Collection", icon: "🗂️" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <div className="steam-admin-tabs bg-gray-950 border-b border-gray-800 px-8 sticky top-0 z-20">
      <nav className="flex items-center justify-between gap-1 overflow-x-auto">
        <div className="flex gap-1">
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
                <span className="steam-tab-icon">{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </div>
        <div className="flex gap-1 shrink-0">
          {SHORTCUTS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              title={`Retour : ${s.label}`}
              className="flex items-center gap-1.5 px-3 py-1.5 my-2 text-xs rounded-lg bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800 whitespace-nowrap transition"
            >
              <span>{s.icon}</span>
              {s.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
