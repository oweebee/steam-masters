type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

const RARITY_STYLES: Record<Rarity, { border: string; glow: string; label: string; text: string }> = {
  COMMON:    { border: "border-gray-500",   glow: "",                             label: "bg-gray-600",   text: "Commune" },
  UNCOMMON:  { border: "border-green-500",  glow: "shadow-[0_0_12px_rgba(34,197,94,0.4)]",  label: "bg-green-600",  text: "Peu commune" },
  RARE:      { border: "border-blue-500",   glow: "shadow-[0_0_14px_rgba(59,130,246,0.5)]", label: "bg-blue-600",   text: "Rare" },
  EPIC:      { border: "border-purple-500", glow: "shadow-[0_0_16px_rgba(168,85,247,0.6)]", label: "bg-purple-600", text: "Épique" },
  LEGENDARY: { border: "border-amber-400",  glow: "shadow-[0_0_20px_rgba(251,191,36,0.7)]", label: "bg-amber-500",  text: "Légendaire" },
};

export function GameCard({
  name,
  headerImage,
  description,
  atk,
  def,
  rarity,
  tags,
}: {
  name: string;
  headerImage: string;
  description: string;
  atk: number;
  def: number;
  rarity: Rarity;
  tags: string[];
}) {
  const style = RARITY_STYLES[rarity];

  return (
    <div
      className={`relative w-72 rounded-2xl border-2 ${style.border} ${style.glow} bg-gray-900 overflow-hidden flex flex-col`}
    >
      <span
        className={`absolute top-2 right-2 z-10 ${style.label} text-white text-xs font-bold px-2 py-1 rounded-full`}
      >
        {style.text}
      </span>

      <img src={headerImage} alt={name} className="w-full h-36 object-cover" />

      <div className="p-4 flex flex-col gap-2 flex-1">
        <h3 className="text-white font-bold text-lg leading-tight">{name}</h3>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((t) => (
              <span key={t} className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                {t}
              </span>
            ))}
          </div>
        )}

        <p className="text-gray-400 text-xs leading-snug line-clamp-4 flex-1">{description}</p>

        <div className="flex justify-between items-center pt-2 border-t border-gray-800 mt-2">
          <div className="flex items-center gap-1 text-red-400 font-bold">
            <span className="text-xs">ATK</span>
            <span>{atk}</span>
          </div>
          <div className="flex items-center gap-1 text-blue-400 font-bold">
            <span className="text-xs">DEF</span>
            <span>{def}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
