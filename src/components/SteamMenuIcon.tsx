export type SteamMenuIconName =
  | "packs" | "collection" | "exchange" | "market" | "profile" | "guild"
  | "players" | "messages" | "battle" | "achievements" | "ranking" | "settings"
  | "admin" | "home" | "users" | "cards" | "import" | "logs" | "configuration" | "submit";

export function SteamMenuIcon({ name, className = "" }: { name: SteamMenuIconName; className?: string }) {
  return (
    <span aria-hidden="true" className={`steam-menu-icon ${className}`}>
      <svg viewBox="0 0 32 32" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9.5 16 5l10 4.5v13L16 27 6 22.5z" fill="#171512" stroke="#9b7044" strokeWidth="1.3" />
        <path d="m6 9.5 10 5 10-5M16 14.5V27" stroke="#d5a365" strokeWidth="1.2" />
        <path d="M9 11v9.5l7 3.5 7-3.5V11" stroke="#596064" strokeWidth=".8" />
        {name === "packs" && <><path d="m12 13 4-2 4 2-4 2zM16 15v5" fill="#bd3d2e" stroke="#e9a34f" strokeWidth="1.2"/><circle cx="16" cy="18" r="1.2" fill="#ffd27e" stroke="none"/></>}
        {name === "collection" && <><path d="M10 11h10v12H10zM13 8h10v12M16 5h10v12" stroke="#e3b578" strokeWidth="1.2"/><path d="M12.5 14h5M12.5 17h5" stroke="#83b5ca" strokeWidth="1"/></>}
        {name === "exchange" && <><path d="M9 13h13l-3-3m4 9H10l3 3" stroke="#e4bd80" strokeWidth="1.8"/><circle cx="8" cy="13" r="1.2" fill="#69c5d6" stroke="none"/><circle cx="24" cy="19" r="1.2" fill="#e35942" stroke="none"/></>}
        {name === "market" && <><path d="M9 11h14l-1.5 5h-11zM11 16l-2 7m12-7 2 7M10 23h14M16 9V7m-3 0h6" stroke="#e8c47f" strokeWidth="1.3"/><path d="M13 13h6" stroke="#cf4937" strokeWidth="1.2"/></>}
        {name === "profile" && <><circle cx="16" cy="12" r="3" fill="#71838a" stroke="#e7c28c" strokeWidth="1.2"/><path d="M10 23c.7-4 2.7-6 6-6s5.3 2 6 6" fill="#444d50" stroke="#d49a5a" strokeWidth="1.4"/></>}
        {name === "guild" && <><path d="M9 22V12l7-5 7 5v10M12 22v-6h8v6M16 7V4m-1 1h2" stroke="#deb16e" strokeWidth="1.3"/><path d="M13.5 13h5" stroke="#e86042" strokeWidth="1.2"/></>}
        {name === "players" && <><circle cx="12" cy="12" r="2.5" fill="#79868a" stroke="#e3bb82"/><circle cx="20" cy="12" r="2.5" fill="#79868a" stroke="#e3bb82"/><path d="M7.5 22c.4-3.2 1.9-5 4.5-5s4.1 1.8 4.5 5m0 0c.4-3.2 1.9-5 4.5-5s4.1 1.8 4.5 5" stroke="#d7a15e" strokeWidth="1.3"/></>}
        {name === "messages" && <><path d="M8 10h14v9h-8l-4 3v-3H8z" fill="#414b4e" stroke="#e0b476" strokeWidth="1.2"/><path d="M13 8h11v8h-2" stroke="#74bed0" strokeWidth="1.1"/><circle cx="12" cy="14.5" r=".8" fill="#ffd17d" stroke="none"/><circle cx="16" cy="14.5" r=".8" fill="#ffd17d" stroke="none"/><circle cx="20" cy="14.5" r=".8" fill="#ffd17d" stroke="none"/></>}
        {name === "battle" && <><path d="m10 10 12 12m0-12L10 22M8 8l4 1-3 3zM24 8l-4 1 3 3z" stroke="#e0c083" strokeWidth="1.5"/><path d="m14 14 4 4" stroke="#e44b39" strokeWidth="2"/></>}
        {name === "achievements" && <><path d="m16 8 2.2 4.4 4.8.7-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8-3.5-3.4 4.8-.7z" fill="#bd853f" stroke="#f0ca85" strokeWidth="1.2"/><path d="m13 21-1 4 4-2 4 2-1-4" stroke="#c5d9df" strokeWidth="1"/></>}
        {name === "ranking" && <><path d="M9 22v-6h4v6m2 0V10h4v12m2 0V6h3v16z" fill="#607278" stroke="#e2bd80" strokeWidth="1.1"/><path d="M8 24h17" stroke="#d74b38" strokeWidth="1.4"/></>}
        {name === "settings" && <><circle cx="16" cy="16" r="6" fill="#475257" stroke="#e1b776" strokeWidth="1.4"/><circle cx="16" cy="16" r="2" fill="#d8533d" stroke="#f4cc83"/><path d="M16 7v3m0 12v3m9-9h-3M10 16H7m15.4-6.4-2 2m-8.8 8.8-2 2m12.8 0-2-2m-8.8-8.8-2-2" stroke="#e2bd80" strokeWidth="1.5"/></>}
        {name === "admin" && <><path d="m16 7 7 2v6c0 4.5-3 7-7 9-4-2-7-4.5-7-9V9z" fill="#35474c" stroke="#e5b96f" strokeWidth="1.4"/><path d="m13 15 2 2 4-4" stroke="#e8d7af" strokeWidth="1.6"/></>}
        {name === "home" && <><path d="m8 15 8-7 8 7v8h-6v-6h-4v6H8z" fill="#465258" stroke="#dfb574" strokeWidth="1.3"/><path d="M14 11h4" stroke="#e75038" strokeWidth="1.2"/></>}
        {name === "users" && <><circle cx="12" cy="12" r="2.4" stroke="#f0c785"/><circle cx="20" cy="12" r="2.4" stroke="#f0c785"/><path d="M8 22c.3-3.3 1.6-5 4-5 1.6 0 2.8.7 3.5 2m1 3c.3-3.3 1.6-5 4-5 2.4 0 3.7 1.7 4 5" stroke="#d59a59" strokeWidth="1.3"/></>}
        {name === "cards" && <><path d="M10 11h10v13H10zM13 8h10v13M16 5h9v13" fill="#4e5c60" stroke="#e4bd80" strokeWidth="1.1"/><path d="M12 15h5m-5 3h5" stroke="#c94b37" strokeWidth="1"/></>}
        {name === "import" && <><path d="M9 20h14v4H9zM16 7v11m-4-4 4 4 4-4" stroke="#e5c182" strokeWidth="1.5"/><path d="M11 10V7h10v3" stroke="#d6503b" strokeWidth="1.2"/></>}
        {name === "submit" && <><circle cx="15" cy="15" r="6" stroke="#e5c182" strokeWidth="1.5"/><path d="m19.5 19.5 5 5M15 11v8m-4-4h8" stroke="#d6503b" strokeWidth="1.7"/><path d="M11 8h10V6H11z" fill="#566267" stroke="#9b7044" strokeWidth=".8"/></>}
        {name === "logs" && <><path d="M10 8h13v16H10zM8 6h13" stroke="#e6bd7e" strokeWidth="1.2"/><path d="M13 12h7m-7 3h7m-7 3h5" stroke="#85bac4" strokeWidth="1.1"/><circle cx="8" cy="9" r="1" fill="#e65b3d" stroke="none"/></>}
        {name === "configuration" && <><circle cx="16" cy="16" r="5.5" stroke="#e1b775" strokeWidth="1.4"/><circle cx="16" cy="16" r="2" fill="#d6533d" stroke="#f2cc83"/><path d="M16 8V6m0 20v-2m8-8h2M6 16H4m17.7-5.7 1.4-1.4M8.9 23.1l1.4-1.4m11.4 1.4-1.4-1.4M8.9 8.9l1.4 1.4" stroke="#e5c082" strokeWidth="1.4"/></>}
        <circle cx="6.5" cy="9.5" r=".8" fill="#f4c16c" stroke="none" />
        <circle cx="25.5" cy="22.5" r=".8" fill="#f4c16c" stroke="none" />
      </svg>
    </span>
  );
}
