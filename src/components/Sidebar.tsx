"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SteamMenuIcon, type SteamMenuIconName } from "@/components/SteamMenuIcon";
import { PushLogoutLink } from "@/components/PushLogoutLink";

// active:false = page stub ("À venir"), voir CONTEXT.md § mécaniques pas encore implémentées.
// Affichées barrées dans le menu tant qu'elles ne sont pas développées.
const NAV: { href: string; label: string; icon: SteamMenuIconName; active: boolean }[] = [
  { href: "/dashboard", label: "Paquets", icon: "packs", active: true },
  { href: "/informations", label: "Informations", icon: "information", active: true },
  { href: "/collection", label: "Mes collections", icon: "collection", active: true },
  { href: "/toutes-les-cartes", label: "Toutes les cartes", icon: "cards", active: true },
  { href: "/echanges", label: "Échanges", icon: "exchange", active: true },
  { href: "/marche", label: "Marché", icon: "market", active: true },
  { href: "/magasin", label: "Magasin", icon: "shop", active: true },
  { href: "/profil", label: "Profil", icon: "profile", active: false },
  { href: "/joueurs", label: "Joueurs", icon: "players", active: true },
  { href: "/classement", label: "Classement", icon: "ranking", active: true },
  { href: "/recompenses", label: "Mes récompenses", icon: "achievements", active: true },
  { href: "/messages", label: "Messages", icon: "messages", active: true },
  { href: "/ajouter-jeu", label: "Ajouter un jeu", icon: "submit", active: true },
  { href: "/bataille", label: "Bataille", icon: "battle", active: true },
  { href: "/parametres", label: "Paramètres", icon: "settings", active: false },
  { href: "/alertes", label: "Notifications", icon: "alertes", active: true },
  { href: "/bug-report", label: "Bug Report", icon: "bug", active: true },
  { href: "/aide", label: "Aide", icon: "aide", active: true },
];

const STORAGE_KEY = "sm_sidebar_collapsed";

function orderedItems(order: string[]) {
  const byHref = new Map(NAV.map((item) => [item.href, item]));
  const result = order.flatMap((href) => byHref.get(href) ?? []);
  for (const item of NAV) {
    if (result.some((current) => current.href === item.href)) continue;
    let insertion = result.length;
    for (let index = NAV.indexOf(item) - 1; index >= 0; index -= 1) {
      const previous = result.findIndex((current) => current.href === NAV[index].href);
      if (previous >= 0) { insertion = previous + 1; break; }
    }
    result.splice(insertion, 0, item);
  }
  return result;
}

function BottomNav({ isAdmin, unreadNotifs, unreadMsgs, unclaimedRewards, order }: { isAdmin: boolean; unreadNotifs: number; unreadMsgs: number; unclaimedRewards: number; order: string[] }) {
  const pathname = usePathname();
  const activeItems = orderedItems(order).filter((item) => item.active);
  return (
    <nav className="steam-bottom-nav sm:hidden fixed bottom-0 inset-x-0 z-50 flex items-stretch justify-around">
      {activeItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition ${
            pathname === item.href || (item.href === "/bataille" && pathname.startsWith("/bataille/")) ? "text-white" : "text-gray-500"
          }`}
        >
          <span className="relative inline-flex">
            <SteamMenuIcon name={item.icon} className="steam-nav-icon" />
            {item.href === "/alertes" && unreadNotifs > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-[#c8a96b] text-[#18130f] text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                {unreadNotifs > 9 ? "9+" : unreadNotifs}
              </span>
            )}
            {item.href === "/messages" && unreadMsgs > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                {unreadMsgs > 9 ? "9+" : unreadMsgs}
              </span>
            )}
            {item.href === "/recompenses" && unclaimedRewards > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-amber-400 text-[#18130f] text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                {unclaimedRewards > 9 ? "9+" : unclaimedRewards}
              </span>
            )}
          </span>
          <span className="text-[10px] tracking-tight leading-none text-center w-full">{item.label}</span>
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
          <span className="text-[10px] tracking-tight leading-none text-center w-full">Admin</span>
        </Link>
      )}
    </nav>
  );
}

export function Sidebar({ isAdmin, username, coins, unreadNotifs = 0, unreadMsgs = 0, initialOrder = [] }: { isAdmin: boolean; username: string; coins: number; unreadNotifs?: number; unreadMsgs?: number; initialOrder?: string[] }) {
  const pathname = usePathname();
  // Replié par défaut (avant lecture localStorage, pour éviter un flash déplié).
  const [collapsed, setCollapsed] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [order, setOrder] = useState(initialOrder);
  const [organizing, setOrganizing] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [unclaimedRewards, setUnclaimedRewards] = useState(0);
  const items = useMemo(() => orderedItems(order), [order]);

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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/recompenses/count", { cache: "no-store" });
        const data = await response.json();
        if (!cancelled && response.ok && Number.isInteger(data.count)) setUnclaimedRewards(Math.max(0, data.count));
      } catch {}
    };
    void load();
    window.addEventListener("sm-rewards-updated", load);
    return () => { cancelled = true; window.removeEventListener("sm-rewards-updated", load); };
  }, [pathname]);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  async function move(href: string, direction: -1 | 1) {
    const hrefs = items.map((item) => item.href);
    const from = hrefs.indexOf(href);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= hrefs.length) return;
    [hrefs[from], hrefs[to]] = [hrefs[to], hrefs[from]];
    const previous = order;
    setOrder(hrefs);
    setOrderError("");
    try {
      const response = await fetch("/api/sidebar-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: hrefs }) });
      if (!response.ok) throw new Error();
    } catch {
      setOrder(previous);
      setOrderError("Ordre non enregistré.");
    }
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

        {!collapsed && (
          <div className="px-2 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-amber-400 text-xs">{coins} GP</span>
              <Link href="/alertes" className="relative flex items-center gap-1 text-[#c8a96b] hover:text-amber-300 transition" title={unreadNotifs > 0 ? "Notifications non lues" : "Notifications"} aria-label={unreadNotifs > 0 ? `${unreadNotifs} notification${unreadNotifs > 1 ? "s" : ""} non lue${unreadNotifs > 1 ? "s" : ""}` : "Notifications"}>
                <SteamMenuIcon name="alertes" className="steam-nav-icon !w-[20px] !h-[20px]" />
                {unreadNotifs > 0 && <span className="min-w-[17px] h-[17px] bg-[#c8a96b] text-[#18130f] text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none">{unreadNotifs > 99 ? "99+" : unreadNotifs}</span>}
              </Link>
            </div>
            {orderError && <small className="text-red-400">{orderError}</small>}
          </div>
        )}

        <nav className="flex min-h-0 flex-col gap-1 flex-1 overflow-y-auto overscroll-contain">
          {items.map((item, index) => {
            const active = pathname === item.href || (item.href === "/bataille" && pathname.startsWith("/bataille/"));
            return (
              <div key={item.href} className="flex items-center gap-1">
              <Link
                href={item.href}
                title={collapsed ? `${item.label}${item.active ? "" : " (bientôt)"}` : undefined}
                className={`flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition ${
                  collapsed ? "justify-center" : ""
                } ${!item.active ? "opacity-40" : ""} ${
                  active ? "bg-blue-600 text-white border-red-500/60" : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <span className="relative inline-flex shrink-0">
                  <SteamMenuIcon name={item.icon} className="steam-nav-icon" />
                  {item.href === "/alertes" && unreadNotifs > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-[#c8a96b] text-[#18130f] text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                      {unreadNotifs > 9 ? "9+" : unreadNotifs}
                    </span>
                  )}
                  {item.href === "/messages" && unreadMsgs > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                      {unreadMsgs > 9 ? "9+" : unreadMsgs}
                    </span>
                  )}
                  {item.href === "/recompenses" && unclaimedRewards > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-amber-400 text-[#18130f] text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                      {unclaimedRewards > 99 ? "99+" : unclaimedRewards}
                    </span>
                  )}
                </span>
                {!collapsed && (
                  <span className={`truncate ${!item.active ? "line-through" : ""}`}>{item.label}</span>
                )}
              </Link>
              {!collapsed && organizing && <span className="flex shrink-0 flex-col">
                <button type="button" disabled={index === 0} onClick={() => void move(item.href, -1)} className="h-4 px-1 text-[10px] leading-none text-amber-300 disabled:opacity-20" aria-label={`Monter ${item.label}`}>▲</button>
                <button type="button" disabled={index === items.length - 1} onClick={() => void move(item.href, 1)} className="h-4 px-1 text-[10px] leading-none text-amber-300 disabled:opacity-20" aria-label={`Descendre ${item.label}`}>▼</button>
              </span>}
              </div>
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

        {!collapsed && <button
          type="button"
          className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-800/70 bg-amber-950/25 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:border-amber-500 hover:bg-amber-900/35 hover:text-white"
          aria-pressed={organizing}
          onClick={() => setOrganizing(value => !value)}
        >
          <span aria-hidden="true">↕</span>{organizing ? "Terminer l’organisation" : "Organiser le menu"}
        </button>}

        <div className={`border-t border-gray-800 pt-3 px-1 flex items-center ${collapsed ? "flex-col gap-2" : "justify-between"}`}>
          {!collapsed && <span className="text-gray-400 text-sm truncate">{username}</span>}
          <PushLogoutLink
            title="Déconnexion"
            className="text-gray-500 hover:text-white text-sm shrink-0"
          >
            {collapsed ? "⏻" : "Déconnexion"}
          </PushLogoutLink>
        </div>
      </aside>
      <BottomNav isAdmin={isAdmin} unreadNotifs={unreadNotifs} unreadMsgs={unreadMsgs} unclaimedRewards={unclaimedRewards} order={order} />
    </>
  );
}
