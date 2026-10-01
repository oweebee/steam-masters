"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SteamMenuIcon, type SteamMenuIconName } from "@/components/SteamMenuIcon";

const TABS: { href: string; label: string; icon: SteamMenuIconName }[] = [
  { href: "/admin", label: "Accueil", icon: "home" },
  { href: "/admin/users", label: "Utilisateurs", icon: "users" },
  { href: "/admin/cards", label: "Toutes les cartes", icon: "cards" },
  { href: "/admin/games", label: "Steam", icon: "import" },
  { href: "/admin/igdb", label: "IGDB", icon: "import" },
  { href: "/admin/repartition", label: "Répartition & délais", icon: "configuration" },
  { href: "/admin/magasin", label: "Magasin", icon: "shop" },
  { href: "/admin/logs", label: "Journal", icon: "logs" },
  { href: "/admin/bug-reports", label: "Bug Reports", icon: "bug" },
  { href: "/admin/settings", label: "Configuration", icon: "configuration" },
  { href: "/admin/annonces", label: "Annonces", icon: "annonces" },
  { href: "/admin/messagerie", label: "Messagerie", icon: "messages" },
];

const SHORTCUTS: { href: string; label: string; icon: SteamMenuIconName }[] = [
  { href: "/dashboard", label: "Paquets", icon: "packs" },
  { href: "/collection", label: "Collection", icon: "collection" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <div className="steam-admin-tabs bg-gray-950 border-b border-gray-800 px-2 sm:px-8 sticky top-0 z-20">
      <nav className="flex flex-col sm:flex-row sm:items-center gap-0 sm:gap-1 overflow-x-auto">
        <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto flex-1 min-w-0">
          {TABS.map((tab) => {
            const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border-b-2 whitespace-nowrap transition ${
                  active
                    ? "border-amber-600 text-white"
                    : "border-transparent text-gray-400 hover:text-white hover:border-gray-700"
                }`}
              >
                <SteamMenuIcon name={tab.icon} className="steam-tab-icon" />
                <span className="hidden sm:inline">{tab.label}</span>
              </Link>
            );
          })}
          <Link
            href="/dashboard"
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 my-1 sm:my-2 ml-auto text-xs rounded-lg border border-amber-800 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 hover:text-amber-100 whitespace-nowrap transition font-medium shrink-0"
          >
            ← <span className="hidden sm:inline">Quitter l&apos;admin</span>
          </Link>
          {SHORTCUTS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              title={`Retour : ${s.label}`}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 my-2 text-xs rounded-lg bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800 whitespace-nowrap transition"
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
