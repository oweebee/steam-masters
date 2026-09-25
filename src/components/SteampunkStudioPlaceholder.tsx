export function SteampunkStudioPlaceholder({ className = "w-full h-full" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 112" className={className} role="img" aria-label="Studio sans visuel">
      <defs>
        <radialGradient id="ssp-lamp" cx="25%" cy="80%" r="55%">
          <stop offset="0%" stopColor="#b45309" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#b45309" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ssp-screen" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.1" />
        </radialGradient>
      </defs>

      {/* Background – dark oak room */}
      <rect width="320" height="112" fill="#0c0805" />
      {/* Wall panelling */}
      <rect x="0" y="0" width="320" height="78" fill="#130d07" />
      <rect x="0" y="78" width="320" height="34" fill="#1e1008" />
      <rect x="0" y="78" width="320" height="2" fill="#3d1f0a" />
      {/* Wall seams */}
      <line x1="0" y1="22" x2="320" y2="22" stroke="#1f1208" strokeWidth="1" />
      <line x1="80" y1="0" x2="80" y2="78" stroke="#1a0d06" strokeWidth="1" />
      <line x1="160" y1="0" x2="160" y2="78" stroke="#1a0d06" strokeWidth="1" />
      <line x1="240" y1="0" x2="240" y2="78" stroke="#1a0d06" strokeWidth="1" />

      {/* Ambient lamp glow (left) */}
      <ellipse cx="40" cy="90" rx="80" ry="50" fill="url(#ssp-lamp)" />

      {/* Brass desk lamp (left) */}
      <rect x="26" y="68" width="4" height="12" fill="#92400e" rx="1" />
      <rect x="22" y="78" width="12" height="3" fill="#92400e" rx="1" />
      <path d="M28 68 Q18 58 22 50" stroke="#b45309" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="20" cy="49" rx="8" ry="4" fill="#d97706" opacity="0.9" />
      <ellipse cx="20" cy="50" rx="6" ry="3" fill="#fbbf24" opacity="0.5" />

      {/* CRT Monitor – centre */}
      <rect x="116" y="8" width="88" height="66" rx="6" fill="#1c1008" stroke="#78350f" strokeWidth="2" />
      <rect x="120" y="12" width="80" height="52" rx="3" fill="#050a18" />
      {/* Screen glow */}
      <rect x="120" y="12" width="80" height="52" rx="3" fill="url(#ssp-screen)" />
      {/* Terminal lines */}
      <line x1="126" y1="24" x2="178" y2="24" stroke="#3b82f6" strokeWidth="1" strokeOpacity="0.7" />
      <line x1="126" y1="32" x2="162" y2="32" stroke="#3b82f6" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="126" y1="40" x2="172" y2="40" stroke="#10b981" strokeWidth="1" strokeOpacity="0.7" />
      <line x1="126" y1="48" x2="148" y2="48" stroke="#10b981" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="126" y1="56" x2="166" y2="56" stroke="#3b82f6" strokeWidth="1" strokeOpacity="0.4" />
      {/* Cursor blink */}
      <rect x="150" y="48" width="5" height="7" fill="#10b981" opacity="0.8" />
      {/* Monitor base */}
      <rect x="150" y="74" width="20" height="5" rx="2" fill="#78350f" />
      <rect x="144" y="79" width="32" height="3" rx="1" fill="#92400e" />

      {/* Gear – top left */}
      <g transform="translate(12,12)">
        <circle cx="0" cy="0" r="10" fill="none" stroke="#78350f" strokeWidth="2" />
        <circle cx="0" cy="0" r="4" fill="#451a03" stroke="#78350f" strokeWidth="1.5" />
        {[0,45,90,135,180,225,270,315].map((a,i) => (
          <rect key={i} x="-2" y="-13" width="4" height="5" rx="1" fill="#78350f"
            transform={`rotate(${a})`} />
        ))}
      </g>

      {/* Gear – top right */}
      <g transform="translate(308,14)">
        <circle cx="0" cy="0" r="8" fill="none" stroke="#78350f" strokeWidth="1.5" />
        <circle cx="0" cy="0" r="3" fill="#451a03" stroke="#78350f" strokeWidth="1" />
        {[0,60,120,180,240,300].map((a,i) => (
          <rect key={i} x="-1.5" y="-11" width="3" height="4" rx="1" fill="#78350f"
            transform={`rotate(${a})`} />
        ))}
      </g>

      {/* Steam pipes – left wall */}
      <rect x="0" y="30" width="8" height="30" fill="#451a03" />
      <rect x="0" y="28" width="10" height="4" rx="1" fill="#78350f" />
      <rect x="0" y="58" width="10" height="4" rx="1" fill="#78350f" />
      {/* Pipe joint circle */}
      <circle cx="5" cy="44" r="4" fill="#92400e" stroke="#b45309" strokeWidth="1" />

      {/* Steam pipes – right wall */}
      <rect x="312" y="25" width="8" height="40" fill="#451a03" />
      <rect x="310" y="23" width="10" height="4" rx="1" fill="#78350f" />
      <rect x="310" y="61" width="10" height="4" rx="1" fill="#78350f" />
      <circle cx="316" cy="43" r="4" fill="#92400e" stroke="#b45309" strokeWidth="1" />

      {/* Bookshelf – right side */}
      <rect x="256" y="30" width="56" height="48" fill="#1a0e06" />
      <rect x="256" y="30" width="56" height="3" fill="#3d1f0a" />
      <rect x="256" y="54" width="56" height="2" fill="#2d1608" />
      <rect x="256" y="76" width="56" height="2" fill="#2d1608" />
      {/* Books on shelf */}
      <rect x="258" y="33" width="7" height="20" rx="1" fill="#7f1d1d" />
      <rect x="266" y="35" width="5" height="18" rx="1" fill="#1e3a5f" />
      <rect x="272" y="33" width="8" height="20" rx="1" fill="#14532d" />
      <rect x="281" y="36" width="6" height="17" rx="1" fill="#713f12" />
      <rect x="288" y="33" width="9" height="20" rx="1" fill="#4c1d95" />
      <rect x="298" y="35" width="6" height="18" rx="1" fill="#881337" />
      <rect x="305" y="33" width="6" height="20" rx="1" fill="#1c1917" />
      {/* Books on lower shelf */}
      <rect x="258" y="57" width="9" height="18" rx="1" fill="#1e3a5f" />
      <rect x="268" y="59" width="6" height="16" rx="1" fill="#7f1d1d" />
      <rect x="275" y="57" width="7" height="18" rx="1" fill="#14532d" />
      <rect x="283" y="58" width="5" height="17" rx="1" fill="#451a03" />
      <rect x="289" y="57" width="8" height="18" rx="1" fill="#4c1d95" />
      <rect x="298" y="59" width="6" height="16" rx="1" fill="#713f12" />
      <rect x="305" y="57" width="6" height="18" rx="1" fill="#881337" />

      {/* Pressure gauge – above pipe left */}
      <circle cx="60" cy="18" r="10" fill="#1a0e06" stroke="#78350f" strokeWidth="2" />
      <circle cx="60" cy="18" r="7" fill="#0d0805" stroke="#451a03" strokeWidth="1" />
      {/* Gauge needle */}
      <line x1="60" y1="18" x2="65" y2="13" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="60" cy="18" r="2" fill="#78350f" />

      {/* Keyboard on desk */}
      <rect x="100" y="83" width="120" height="14" rx="2" fill="#1c1008" stroke="#3d1f0a" strokeWidth="1" />
      {[0,1,2,3,4,5,6,7,8,9,10,11].map((i) => (
        <rect key={i} x={104+i*9} y="86" width="7" height="5" rx="1" fill="#2d1608" />
      ))}
      {[0,1,2,3,4,5,6,7,8,9].map((i) => (
        <rect key={i} x={108+i*9} y="93" width="7" height="3" rx="1" fill="#2d1608" />
      ))}

      {/* Steam wisps from pipes */}
      <path d="M5 28 Q8 22 4 16 Q8 10 5 4" stroke="#d97706" strokeWidth="1" fill="none" strokeOpacity="0.25" />
      <path d="M316 23 Q320 17 315 11 Q319 5 316 0" stroke="#d97706" strokeWidth="1" fill="none" strokeOpacity="0.2" />
    </svg>
  );
}
