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
        <path className="steam-private-gem-shadow" d="M12 2 21 8 12 22 3 8Z" />
        <path className="steam-private-gem-face" d="M3 8 8 4h8l5 4-9 14Z" />
        <path className="steam-private-gem-facet" d="m8 4 4 4 4-4 5 4H3Z" />
        <path className="steam-private-gem-shine" d="m8 4 4 4-4 8-5-8Z" />
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
