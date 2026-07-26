"use client";

import { Download } from "lucide-react";
import { Place, Category } from "@/lib/types";

function esc(v: string | undefined | null): string {
  const s = (v ?? "").replace(/"/g, '""');
  return `"${s}"`;
}

export default function CsvExportButton({
  places,
  categories,
}: {
  places: Place[];
  categories: Category[];
}) {
  const catName = new Map(categories.map((c) => [c.slug, c.name]));

  function download() {
    const header = [
      "Név", "Kategória", "Státusz", "Város", "Irányítószám",
      "Cím", "Telefon", "Weboldal", "Leírás", "Miért barát?", "Slug",
    ];

    const rows = places.map((p) => [
      esc(p.name),
      esc(catName.get(p.category) ?? p.category),
      esc(p.status),
      esc(p.city),
      esc(p.postalCode),
      esc(p.address),
      esc(p.phone),
      esc(p.website),
      esc(p.description),
      esc(p.whyFriendly),
      esc(p.slug),
    ]);

    const csv = [header.map((h) => `"${h}"`).join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vedettsarok-helyek-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="btn-secondary inline-flex items-center gap-2 text-sm"
    >
      <Download size={15} />
      CSV letöltése ({places.length})
    </button>
  );
}
