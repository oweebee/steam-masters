"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// active:false = page stub ("À venir"), voir CONTEXT.md § mécaniques pas encore implémentées.
// Affichées barrées dans le menu tant qu'elles ne sont pas développées.
const NAV = [
  { href: "/dashboard", label: "Paquets", icon: "📦", active: true },
  { href: "/collection", label: "Collection", icon: "🗂️", active: true },
  { href: "/echanges", label: "Échanges", icon: "🔁", active: true },
  { href: "/marche", label: "Marché", icon: "💰", active: true },
  { href: "/profil", label: "Profil", icon: "👤", active: false },
  { href: "/toutes-les-cartes", label: "Toutes les cartes", icon: "🃏", active: true, adminOnly: true },
  { href: "/guilde", label: "Guilde", icon: "🏰", active: false },
  { href: "/joueurs", label: "Joueurs", icon: "🧑‍🤝‍🧑", active: true },
  { href: "/messages", label: "Messages", icon: "💬", active: false },
  { href: "/bataille", label: "Bataille", icon: "⚔️", active: true },
  { href: "/succes", label: "Succès", icon: "🏆", active: false },
  { href: "/classement", label: "Classement", icon: "📊", active: false },
  { href: "/parametres", label: "Paramètres", icon: "⚙️", active: false },
];

const STORAGE_KEY = "sm_sidebar_collapsed";

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
    <aside
      className={`steam-sidebar shrink-0 bg-gray-900 border-r border-gray-800 min-h-screen p-3 flex flex-col sticky top-0 transition-all duration-200 ${
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

      <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
        {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => {
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
              <span className="steam-nav-icon shrink-0">{item.icon}</span>
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
            <span className="steam-nav-icon shrink-0">🛡️</span>
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
  );
}
