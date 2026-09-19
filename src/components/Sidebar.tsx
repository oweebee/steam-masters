"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Paquets" },
  { href: "/collection", label: "Collection" },
  { href: "/echanges", label: "Échanges" },
  { href: "/marche", label: "Marché" },
  { href: "/profil", label: "Profil" },
  { href: "/toutes-les-cartes", label: "Toutes les cartes" },
  { href: "/guilde", label: "Guilde" },
  { href: "/amis", label: "Amis" },
  { href: "/messages", label: "Messages" },
  { href: "/bataille", label: "Bataille" },
  { href: "/succes", label: "Succès" },
  { href: "/classement", label: "Classement" },
  { href: "/parametres", label: "Paramètres" },
];

export function Sidebar({ isAdmin, username, coins }: { isAdmin: boolean; username: string; coins: number }) {
  const pathname = usePathname();
  return (
    <aside className="w-64 shrink-0 bg-gray-900 border-r border-gray-800 min-h-screen p-4 flex flex-col sticky top-0">
      <div className="text-xl font-bold text-white mb-2 px-2">Steam Masters</div>
      <div className="text-amber-400 text-xs px-2 mb-6">{coins} pièces</div>
      <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 rounded-lg text-sm transition ${
                active ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            href="/admin/games"
            className={`px-3 py-2 rounded-lg text-sm mt-4 ${
              pathname === "/admin/games" ? "bg-purple-600 text-white" : "text-purple-400 hover:bg-gray-800"
            }`}
          >
            Console Admin
          </Link>
        )}
      </nav>
      <div className="border-t border-gray-800 pt-4 px-2 flex items-center justify-between">
        <span className="text-gray-400 text-sm truncate">{username}</span>
        <a href="/api/auth/signout" className="text-gray-500 hover:text-white text-sm shrink-0 ml-2">Déconnexion</a>
      </div>
    </aside>
  );
}
