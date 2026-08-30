export interface KategoriaItem {
  value: string;
  label: string;
  description: string;
}

export const SZELLEMI_KATEGORIAK: KategoriaItem[] = [
  {
    value: "Irodai munka",
    label: "Irodai munka",
    description: "papírok rendezése, írás, e-mail írás, telefonálás, számítógép használata",
  },
  {
    value: "Adatrögzítés",
    label: "Adatrögzítés",
    description: "információk írása számítógépbe",
  },
  {
    value: "Segítség más embereknek",
    label: "Segítség más embereknek",
    description: "kérdések megválaszolása, telefonálás, e-mail írás",
  },
  {
    value: "Számítógépes munka",
    label: "Számítógépes munka",
    description: "számítógépek, informatikai programok és rendszerek használata",
  },
  {
    value: "Kreatív munka",
    label: "Kreatív munka",
    description: "képek, grafikák és más kreatív tartalmak készítése",
  },
  {
    value: "Marketing és kommunikáció",
    label: "Marketing és kommunikáció",
    description: "reklámok, Facebook, Instagram, TikTok, YouTube videók, szövegek készítése",
  },
  {
    value: "Pénzügyi és könyvelési munka",
    label: "Pénzügyi és könyvelési munka",
    description: "számlák, pénzügyi adatok és könyvelési feladatok kezelése",
  },
  {
    value: "Személyügyi és asszisztens munka",
    label: "Személyügyi és asszisztens munka",
    description: "munkatársakkal kapcsolatos feladatok, szervezés és irodai segítség",
  },
  {
    value: "Oktatás és más emberek segítése",
    label: "Oktatás és más emberek segítése",
    description: "tanítás, fejlesztés, támogatás vagy segítségnyújtás",
  },
  {
    value: "Fordítás és szövegírás",
    label: "Fordítás és szövegírás",
    description: "szövegek fordítása vagy írása",
  },
  {
    value: "Otthonról végezhető munka",
    label: "Otthonról végezhető munka",
    description: "a munkát otthonról végzed számítógépen vagy más eszközzel",
  },
];

export const FIZIKAI_KATEGORIAK: KategoriaItem[] = [
  { value: "Csomagolás",                        label: "Csomagolás",                        description: "" },
  { value: "Raktáros munka",                    label: "Raktáros munka",                    description: "" },
  { value: "Könnyű tárgyak emelése, sok séta",  label: "Könnyű tárgyak emelése, sok séta",  description: "" },
  { value: "Álló munka",                         label: "Álló munka",                         description: "" },
  { value: "Tárgyak készítése",                  label: "Tárgyak készítése",                  description: "" },
  { value: "Gyárban gépekkel való munka",        label: "Gyárban gépekkel való munka",        description: "" },
  { value: "Konyhai kisegítő munka",             label: "Konyhai kisegítő munka",             description: "mosogatás, takarítás, segítség a konyhán" },
  { value: "Takarítás",                          label: "Takarítás",                          description: "" },
  { value: "Kertészeti munka",                   label: "Kertészeti munka",                   description: "" },
  { value: "Karbantartás",                       label: "Karbantartás",                       description: "" },
  { value: "Bolti munka",                        label: "Bolti munka kisegítő",               description: "" },
  { value: "Árupakolás",                         label: "Árupakolás",                         description: "" },
  { value: "Autóvezetés",                        label: "Autóvezetés",                        description: "" },
  { value: "Varrás",                             label: "Varrás",                             description: "" },
  { value: "Címkézés",                           label: "Címkézés",                           description: "" },
  { value: "Szerelés",                           label: "Szerelés",                           description: "" },
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
  structured_tasks?: boolean;
  open_to_beginners?: boolean;
  category?: string;
  q?: string;
}

export const FILTER_LABELS: Record<string, string> = {
  part_time: "Részmunkaidő",
  flexible_schedule: "Rugalmas munkaidő",
  open_to_neurodivergent: "Neurodivergens jelentkezőknek",
  open_to_disabled: "Megváltozott munkaképességű személyeknek",
  open_to_parents: "Szülőknek is alkalmas",
  mentor: "Támogató személy van",
  written_instructions: "Írásban is kaphatók a feladatok",
  quiet_environment: "Csendesebb munkakörnyezet",
  low_verbal: "Kevés beszélgetés emberekkel",
  structured_tasks: "Jól strukturált, lépésről lépésre feladatok",
  open_to_beginners: "Pályakezdőknek is",
};
