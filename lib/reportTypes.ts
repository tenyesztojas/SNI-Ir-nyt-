import { ReportType } from "@/lib/types";

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  hibas_adat: "Hibás adat (cím, telefon, nyitvatartás stb.)",
  nem_mukodik: "A hely már nem létezik / nem működik",
  nem_megfelelo_tartalom: "Nem megfelelő tartalom",
  egyeb: "Egyéb",
};

export const REPORT_TYPE_OPTIONS: { value: ReportType; label: string }[] = (
  Object.keys(REPORT_TYPE_LABELS) as ReportType[]
).map((value) => ({ value, label: REPORT_TYPE_LABELS[value] }));
