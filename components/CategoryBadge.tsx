import { Category } from "@/lib/types";

export default function CategoryBadge({ category }: { category?: Category | null }) {
  if (!category) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sni-brand-teal/15 px-3 py-1 text-xs font-bold text-sni-brand-navy">
      <span aria-hidden>{category.icon}</span>
      {category.name}
    </span>
  );
}
