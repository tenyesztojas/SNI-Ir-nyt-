"use client";

import { NEURODIVERGENCE_LABELS, SUPPORT_NEEDS_CATALOG, type VjWaitlistEntry } from "@/lib/vedett-jelzes/types";

interface Props {
  entries: VjWaitlistEntry[];
  type: "production" | "fulfillment";
  label: string;
}

function escapeCsv(val: string | null | undefined): string {
  const s = val ?? "";
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export default function CsvExportButton({ entries, type, label }: Props) {
  function handleExport() {
    let header: string;
    let rows: string[];

    if (type === "production") {
      // Gyártási CSV: jelzés adatok (a gyártó látja)
      header = "Sorszam,Nev_kartan,Erintettseg,Segitsegigenyek,QR_alap_szoveg";
      rows = entries.map((e, i) => {
        const s = e.signal_snapshot;
        const needLabels = (s?.support_needs ?? [])
          .map((id) => SUPPORT_NEEDS_CATALOG.find((n) => n.id === id)?.label ?? id)
          .join(" | ");
        return [
          String(i + 1),
          escapeCsv(s?.display_name),
          escapeCsv(s ? NEURODIVERGENCE_LABELS[s.neurodivergence_type] : ""),
          escapeCsv(needLabels),
          escapeCsv("vedettsarok.hu/vj/..."),
        ].join(",");
      });
    } else {
      // Szállítási CSV: szállítási adatok (a csomagküldőnek)
      header = "Sorszam,Teljes_nev,Email,Telefon,Iranyitoszam,Varos,Cim,Statusz,Feliratkozas_datuma";
      rows = entries.map((e, i) => {
        const f = e.fulfillment_snapshot;
        return [
          String(i + 1),
          escapeCsv(f?.full_name),
          escapeCsv(f?.email),
          escapeCsv(f?.phone),
          escapeCsv(f?.postal_code),
          escapeCsv(f?.city),
          escapeCsv(f?.address_line),
          escapeCsv(e.status),
          escapeCsv(new Date(e.created_at).toLocaleDateString("hu-HU")),
        ].join(",");
      });
    }

    const csvContent = [header, ...rows].join("\n");
    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vedett-jelzes-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleExport}
      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
    >
      ↓ {label}
    </button>
  );
}
