export const SZELLEMI_KATEGORIAK = [
  "Irodai munka",
  "Adatrögzítés",
  "Segítség más embereknek",
  "Számítógépes munka",
  "Kreatív munka",
  "Marketing és kommunikáció",
  "Pénzügyi és könyvelési munka",
  "Személyügyi és asszisztens munka",
  "Oktatás és más emberek segítése",
  "Fordítás és szövegírás",
  "Otthonról végezhető munka",
];

export const FIZIKAI_KATEGORIAK = [
  "Csomagolás",
  "Raktáros munka",
  "Könnyű tárgyak emelése, sok séta",
  "Álló munka",
  "Tárgyak készítése",
  "Gyárban gépekkel való munka",
  "Konyhai kisegítő munka",
  "Takarítás",
  "Kertészeti munka",
  "Karbantartás",
  "Bolti munka",
  "Árupakolás",
  "Autóvezetés",
  "Varrás",
  "Címkézés",
  "Szerelés",
];

export const ALL_KATEGORIAK = [...SZELLEMI_KATEGORIAK, ...FIZIKAI_KATEGORIAK];

export const HUNGARIAN_COUNTIES = [
  "Bács-Kiskun",
  "Baranya",
  "Békés",
  "Borsod-Abaúj-Zemplén",
  "Csongrád-Csanád",
  "Fejér",
  "Győr-Moson-Sopron",
  "Hajdú-Bihar",
  "Heves",
  "Jász-Nagykun-Szolnok",
  "Komárom-Esztergom",
  "Nógrád",
  "Pest",
  "Somogy",
  "Szabolcs-Szatmár-Bereg",
  "Tolna",
  "Vas",
  "Veszprém",
  "Zala",
  "Budapest",
];

// Szűrők az álláslista oldalhoz
export interface JobFilters {
  work_type?: "szellemi" | "fizikai" | "";
  city?: string;
  county?: string;
  work_location?: string; // munkahelyen | otthonrol | hibrid
  part_time?: boolean;
  flexible_schedule?: boolean;
  open_to_neurodivergent?: boolean;
  open_to_disabled?: boolean;
  open_to_parents?: boolean;
  mentor?: boolean;
  written_instructions?: boolean;
  quiet_environment?: boolean;
  low_verbal?: boolean;
  category?: string;
  q?: string; // szabad keresés
}

export const FILTER_LABELS: Record<string, string> = {
  part_time: "Részmunkaidő",
  flexible_schedule: "Rugalmas munkaidő",
  open_to_neurodivergent: "Neurodivergens jelentkezőknek is",
  open_to_disabled: "Megváltozott munkaképességűeknek is",
  open_to_parents: "Szülőknek is alkalmas",
  mentor: "Mentor van",
  written_instructions: "Írásban is kaphatók a feladatok",
  quiet_environment: "Csendesebb munkakörnyezet",
  low_verbal: "Kevés beszélgetés emberekkel",
};
