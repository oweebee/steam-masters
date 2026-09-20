"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/dashboard", label: "Paquets", icon: "📦" },
  { href: "/collection", label: "Collection", icon: "🗃️" },
  { href: "/echanges", label: "Échanges", icon: "🔄" },
  { href: "/marche", label: "Marché", icon: "🏪" },
  { href: "/profil", label: "Profil", icon: "👤" },
  { href: "/toutes-les-cartes", label: "Toutes les cartes", icon: "🗂️" },
  { href: "/guilde", label: "Guilde", icon: "🛡️" },
  { href: "/amis", label: "Amis", icon: "🧑‍🤝‍🧑" },
  { href: "/messages", label: "Messages", icon: "💬" },
  { href: "/bataille", label: "Bataille", icon: "⚔️" },
  { href: "/succes", label: "Succès", icon: "🏆" },
  { href: "/classement", label: "Classement", icon: "📊" },
  { href: "/parametres", label: "Paramètres", icon: "⚙️" },
];

const STORAGE_KEY = "sm_sidebar_collapsed";

export function Sidebar({ isAdmin, username, coins }: { isAdmin: boolean; username: string; coins: number }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {}
    setReady(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }

  return (
    <aside
      className={`shrink-0 bg-gray-900 border-r border-gray-800 min-h-screen flex flex-col sticky top-0 transition-all duration-200 ${
        collapsed ? "w-16 p-2" : "w-64 p-4"
      } ${ready ? "" : "invisible"}`}
    >
      <div className={`flex items-center mb-2 ${collapsed ? "justify-center" : "justify-between px-2"}`}>
        {!collapsed && <div className="text-xl font-bold text-white truncate">Steam Masters</div>}
        <button
          onClick={toggle}
          title={collapsed ? "Déplier le menu" : "Replier le menu"}
          className="text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg p-2 shrink-0"
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>
      {!collapsed && <div className="text-amber-400 text-xs px-2 mb-6">{coins} pièces</div>}

      <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`px-3 py-2 rounded-lg text-sm transition flex items-center gap-2 ${
                collapsed ? "justify-center" : ""
              } ${active ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}
            >
              <span>{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            href="/admin"
            title={collapsed ? "Console Admin" : undefined}
            className={`px-3 py-2 rounded-lg text-sm mt-4 flex items-center gap-2 ${collapsed ? "justify-center" : ""} ${
              pathname.startsWith("/admin") ? "bg-purple-600 text-white" : "text-purple-400 hover:bg-gray-800"
            }`}
          >
            <span>🛠️</span>
            {!collapsed && <span className="truncate">Console Admin</span>}
          </Link>
        )}
      </nav>

      <div className={`border-t border-gray-800 pt-4 flex items-center ${collapsed ? "justify-center" : "justify-between px-2"}`}>
        {!collapsed && <span className="text-gray-400 text-sm truncate">{username}</span>}
        <a
          href="/api/auth/signout"
          title="Déconnexion"
          className="text-gray-500 hover:text-white text-sm shrink-0 ml-2"
        >
          {collapsed ? "⏻" : "Déconnexion"}
        </a>
      </div>
    </aside>
  );
}
