"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/dashboard", label: "Paquets", icon: "📦" },
  { href: "/collection", label: "Collection", icon: "🗂️" },
  { href: "/echanges", label: "Échanges", icon: "🔁" },
  { href: "/marche", label: "Marché", icon: "💰" },
  { href: "/profil", label: "Profil", icon: "👤" },
  { href: "/toutes-les-cartes", label: "Toutes les cartes", icon: "🃏" },
  { href: "/guilde", label: "Guilde", icon: "🏰" },
  { href: "/joueurs", label: "Joueurs", icon: "🧑‍🤝‍🧑" },
  { href: "/messages", label: "Messages", icon: "💬" },
  { href: "/bataille", label: "Bataille", icon: "⚔️" },
  { href: "/succes", label: "Succès", icon: "🏆" },
  { href: "/classement", label: "Classement", icon: "📊" },
  { href: "/parametres", label: "Paramètres", icon: "⚙️" },
];

const STORAGE_KEY = "sm_sidebar_collapsed";

export function Sidebar({ isAdmin, username, coins }: { isAdmin: boolean; username: string; coins: number }) {
  const pathname = usePathname();
  // Replié par défaut (avant lecture localStorage, pour éviter un flash déplié).
  const [collapsed, setCollapsed] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // Pas de préférence enregistrée => reste replié (comportement par défaut demandé).
      if (stored !== null) setCollapsed(stored === "1");
    } catch {}
    setLoaded(true);
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
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition ${
                collapsed ? "justify-center" : ""
              } ${active ? "bg-blue-600 text-white border-red-500/60" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
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
            <span className="shrink-0">🛡️</span>
            {!collapsed && <span className="truncate">Console Admin</span>}
          </Link>
        )}
      </nav>

      <div className={`border-t border-gray-800 pt-3 px-1 flex items-center ${collapsed ? "flex-col gap-2" : "justify-between"}`}>
        {!collapsed && <span className="text-gray-400 text-sm truncate">{username}</span>}
        <a
          href="/api/auth/signout"
          title="Déconnexion"
          className="text-gray-500 hover:text-white text-sm shrink-0"
        >
          {collapsed ? "⏻" : "Déconnexion"}
        </a>
      </div>
    </aside>
  );
}
