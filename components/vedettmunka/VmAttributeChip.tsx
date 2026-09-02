"use client";
import VmIcon from "./VmIcon";
import { ATTRIBUTE_LABELS } from "@/lib/vedettmunka/attributes";

interface Props {
  slug: string;
  showDesc?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  kiszamithatosag: "bg-blue-50 text-blue-700 border-blue-100",
  betanitas:       "bg-green-50 text-green-700 border-green-100",
  munkakornyzet:   "bg-sni-brand-navy/5 text-sni-brand-navy border-sni-brand-navy/10",
  szenzoros:       "bg-amber-50 text-amber-700 border-amber-100",
  munka_jellege:   "bg-gray-50 text-gray-700 border-gray-200",
  "munkaidő":      "bg-purple-50 text-purple-700 border-purple-100",
  helyszin:        "bg-teal-50 text-teal-700 border-teal-100",
  megkozelites:    "bg-rose-50 text-rose-700 border-rose-100",
  szunet:          "bg-orange-50 text-orange-700 border-orange-100",
};

// Slug → kategória gyors map (az ikon-name azonos a slug-gal, kategória a prefix alapján)
function guessCategory(slug: string): string {
  if (["predictable_tasks","predictable_schedule","advance_notice","routine_tasks"].includes(slug)) return "kiszamithatosag";
  if (["gradual_training","assigned_mentor","can_ask_questions","regular_feedback","written_tasks"].includes(slug)) return "betanitas";
  if (["quieter_env","calmer_env","small_team","large_team","low_verbal","high_communication","low_customer","independent_work","team_work"].includes(slug)) return "munkakornyzet";
  if (["noise_low","noise_medium","noise_high","natural_light","calm_visual"].includes(slug)) return "szenzoros";
  if (["seated_work","standing_work","computer_work","physical_work","repetitive_tasks","varied_tasks"].includes(slug)) return "munka_jellege";
  if (["full_time","part_time","flexible_hours","predictable_shift","no_weekend","no_night"].includes(slug)) return "munkaidő";
  if (["onsite","home_office","hybrid","fixed_location"].includes(slug)) return "helyszin";
  if (["accessible","public_transport","parking","commute_support"].includes(slug)) return "megkozelites";
  if (["regular_breaks","flexible_breaks","quiet_room"].includes(slug)) return "szunet";
  return "munkakornyzet";
}

export default function VmAttributeChip({ slug, showDesc = false, size = "sm", className = "" }: Props) {
  const label = ATTRIBUTE_LABELS[slug] ?? { title: slug, desc: "" };
  const cat = guessCategory(slug);
  const colorClass = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.munkakornyzet;
  const sizeClass = size === "md"
    ? "px-3 py-2 text-sm gap-2"
    : "px-2.5 py-1.5 text-xs gap-1.5";
  const iconSize = size === "md" ? 28 : 22;

  if (showDesc) {
    return (
      <div className={`flex items-start gap-3 rounded-xl border p-3 ${colorClass} ${className}`}>
        <div className="mt-0.5 shrink-0">
          <VmIcon name={slug} size={32} />
        </div>
        <div>
          <p className="font-semibold leading-tight">{label.title}</p>
          {label.desc && (
            <p className="mt-0.5 text-xs leading-snug opacity-75">{label.desc}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <span
      title={label.desc}
      className={`inline-flex items-center rounded-full border font-medium ${colorClass} ${sizeClass} ${className}`}
    >
      <VmIcon name={slug} size={iconSize} />
      {label.title}
    </span>
  );
}
