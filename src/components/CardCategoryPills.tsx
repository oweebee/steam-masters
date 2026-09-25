"use client";
import type { CSSProperties } from "react";

export type PrivateCardCategory = { id: string; name: string; color: string };

export function CardCategoryPills({ categories = [], studio = false }: {
  categories?: PrivateCardCategory[];
  studio?: boolean;
}) {
  if (!categories.length) return null;
  return <div className={`steam-private-card-tags ${studio ? "is-studio" : ""}`} aria-label="Catégories privées">
    {categories.map((category, index) => {
      const side = index % 2 === 0 ? "left" : "right";
      const offset = Math.min(Math.floor(index / 2) * 8, 40);
      return <span
        key={category.id}
        className={`steam-private-card-tag is-${side}`}
        style={{
          "--gem-color": category.color,
          left: side === "left" ? `calc(50% - 6.25rem - ${offset}px)` : undefined,
          right: side === "right" ? `calc(50% - 6.25rem - ${offset}px)` : undefined,
          zIndex: categories.length - index,
        } as CSSProperties}
        title={category.name}
        aria-label={category.name}
      ><svg viewBox="0 0 24 24" aria-hidden="true">
        <path className="steam-private-gem-shadow" d="M12 2 22 7 18 16 12 22 6 16 2 7Z" />
        <path className="steam-private-gem-face" d="M3 7 7 3h10l4 4-3 8-6 6-6-6Z" />
        <path className="steam-private-gem-crown" d="M3 7 7 3l3 4H3Zm7 0 2-4 2 4Zm4 0 3-4 4 4Z" />
        <path className="steam-private-gem-facet" d="m3 7 7 0 2 14Zm7 0h4l-2 14Zm4 0h7l-9 14Z" />
        <path className="steam-private-gem-shine" d="M7.3 4 9 6h-3Z" />
        <path className="steam-private-gem-edge" d="M3 7h18M7 3h10" />
      </svg></span>;
    })}
  </div>;
}

export function PrivateCategoryLabels({ categories = [] }: { categories?: PrivateCardCategory[] }) {
  if (!categories.length) return null;
  return <div className="steam-private-category-labels" aria-label="Catégories privées">
    {categories.map((category) => <span key={category.id} style={{ borderColor: category.color, color: category.color }} title={category.name}>{category.name}</span>)}
  </div>;
}
