"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SteamMenuIcon, type SteamMenuIconName } from "@/components/SteamMenuIcon";

// active:false = page stub ("À venir"), voir CONTEXT.md § mécaniques pas encore implémentées.
// Affichées barrées dans le menu tant qu'elles ne sont pas développées.
const NAV: { href: string; label: string; icon: SteamMenuIconName; active: boolean }[] = [
  { href: "/dashboard", label: "Paquets", icon: "packs", active: true },
  { href: "/collection", label: "Mes collections", icon: "collection", active: true },
  { href: "/echanges", label: "Échanges", icon: "exchange", active: true },
  { href: "/marche", label: "Marché", icon: "market", active: true },
  { href: "/profil", label: "Profil", icon: "profile", active: false },
  { href: "/guilde", label: "Guilde", icon: "guild", active: false },
  { href: "/joueurs", label: "Joueurs", icon: "players", active: true },
  { href: "/messages", label: "Messages", icon: "messages", active: true },
  { href: "/ajouter-jeu", label: "Ajouter un jeu", icon: "submit", active: true },
  { href: "/bataille", label: "Bataille", icon: "battle", active: true },
  { href: "/succes", label: "Succès", icon: "achievements", active: false },
  { href: "/classement", label: "Classement", icon: "ranking", active: false },
  { href: "/parametres", label: "Paramètres", icon: "settings", active: false },
  { href: "/bug-report", label: "Bug Report", icon: "bug", active: true },
];

const STORAGE_KEY = "sm_sidebar_collapsed";

function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const activeItems = NAV.filter((item) => item.active);
  return (
    <nav className="steam-bottom-nav sm:hidden fixed bottom-0 inset-x-0 z-50 flex items-stretch justify-around">
      {activeItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition ${
            pathname === item.href ? "text-white" : "text-gray-500"
          }`}
        >
          <SteamMenuIcon name={item.icon} className="steam-nav-icon" />
          <span className="text-[8px] tracking-tight leading-none text-center w-full">{item.label}</span>
        </Link>
      ))}
      {isAdmin && (
        <Link
          href="/admin/games"
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition ${
            pathname === "/admin/games" ? "text-white" : "text-purple-500"
          }`}
        >
          <SteamMenuIcon name="admin" className="steam-nav-icon" />
          <span className="text-[8px] tracking-tight leading-none text-center w-full">Admin</span>
        </Link>
      )}
    </nav>
  );
}

export function Sidebar({ isAdmin, username, coins }: { isAdmin: boolean; username: string; coins: number }) {
  const pathname = usePathname();
  // Replié par défaut (avant lecture localStorage, pour éviter un flash déplié).
  const [collapsed, setCollapsed] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const initialize = window.setTimeout(() => {
      try {
        const standalone = window.matchMedia("(display-mode: standalone)").matches
          || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
        if (standalone) {
          // Une nouvelle ouverture de la PWA commence toujours avec le rail
          // compact, quelle que soit la préférence laissée à la session passée.
          setCollapsed(true);
          localStorage.setItem(STORAGE_KEY, "1");
        } else {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored !== null) setCollapsed(stored === "1");
        }
      } catch {}
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(initialize);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  return (
    <>
      <div
        className={`steam-sidebar-spacer hidden sm:block shrink-0 transition-[width] duration-200 ${collapsed ? "w-16" : "w-64"}`}
        aria-hidden="true"
      />
      <aside
        className={`steam-sidebar fixed left-0 top-0 z-40 bg-gray-900 border-r border-gray-800 h-screen p-3 hidden sm:flex flex-col transition-all duration-200 ${
          collapsed ? "w-16" : "w-64"
        } ${loaded ? "" : "invisible"}`}
      >
        <div className={`flex mb-2 px-1 ${collapsed ? "flex-col items-center gap-1" : "items-center justify-between"}`}>
          <Link href="/dashboard" title="Steam Masters" className="flex items-center gap-2 min-w-0">
            <img src="/icons/icon-192.png" alt="" className="w-8 h-8 shrink-0" />
            {!collapsed && <span className="text-lg font-bold text-white truncate">Steam Masters</span>}
          </Link>
          <button
            onClick={toggle}
            title={collapsed ? "Déplier le menu" : "Replier le menu"}
            className="text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg p-1.5 shrink-0"
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>

        {!collapsed && <div className="text-amber-400 text-xs px-2 mb-4">{coins} pièces</div>}

        <nav className="flex min-h-0 flex-col gap-1 flex-1 overflow-y-auto overscroll-contain">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? `${item.label}${item.active ? "" : " (bientôt)"}` : undefined}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition ${
                  collapsed ? "justify-center" : ""
                } ${!item.active ? "opacity-40" : ""} ${
                  active ? "bg-blue-600 text-white border-red-500/60" : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <SteamMenuIcon name={item.icon} className="steam-nav-icon shrink-0" />
                {!collapsed && (
                  <span className={`truncate ${!item.active ? "line-through" : ""}`}>{item.label}</span>
                )}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin/games"
              title={collapsed ? "Console Admin" : undefined}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm mt-4 ${
                collapsed ? "justify-center" : ""
              } ${pathname === "/admin/games" ? "bg-purple-600 text-white" : "text-purple-400 hover:bg-gray-800"}`}
            >
              <SteamMenuIcon name="admin" className="steam-nav-icon shrink-0" />
              {!collapsed && <span className="truncate">Console Admin</span>}
            </Link>
          )}
        </nav>

        <div className={`border-t border-gray-800 pt-3 px-1 flex items-center ${collapsed ? "flex-col gap-2" : "justify-between"}`}>
          {!collapsed && <span className="text-gray-400 text-sm truncate">{username}</span>}
          <Link
            href="/api/auth/signout"
            title="Déconnexion"
            className="text-gray-500 hover:text-white text-sm shrink-0"
          >
            {collapsed ? "⏻" : "Déconnexion"}
          </Link>
        </div>
      </aside>
      <BottomNav isAdmin={isAdmin} />
    </>
  );
}
