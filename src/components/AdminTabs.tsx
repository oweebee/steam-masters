"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SteamMenuIcon, type SteamMenuIconName } from "@/components/SteamMenuIcon";

const TABS: { href: string; label: string; icon: SteamMenuIconName }[] = [
  { href: "/admin", label: "Accueil", icon: "home" },
  { href: "/admin/users", label: "Utilisateurs", icon: "users" },
  { href: "/admin/cards", label: "Toutes les cartes", icon: "cards" },
  { href: "/admin/games", label: "Import de jeux", icon: "import" },
  { href: "/admin/logs", label: "Journal", icon: "logs" },
  { href: "/admin/bug-reports", label: "Bug Reports", icon: "bug" },
  { href: "/admin/settings", label: "Configuration", icon: "configuration" },
];

const SHORTCUTS: { href: string; label: string; icon: SteamMenuIconName }[] = [
  { href: "/dashboard", label: "Paquets", icon: "packs" },
  { href: "/collection", label: "Collection", icon: "collection" },
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
                <SteamMenuIcon name={tab.icon} className="steam-tab-icon" />
                {tab.label}
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 px-3 py-1.5 my-2 text-xs rounded-lg border border-amber-800 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 hover:text-amber-100 whitespace-nowrap transition font-medium"
          >
            ← Quitter l&apos;admin
          </Link>
          {SHORTCUTS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              title={`Retour : ${s.label}`}
              className="flex items-center gap-1.5 px-3 py-1.5 my-2 text-xs rounded-lg bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800 whitespace-nowrap transition"
            >
              <SteamMenuIcon name={s.icon} className="steam-tab-icon" />
              {s.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
