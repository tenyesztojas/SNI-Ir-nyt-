import { getCurrentPartnerId, getPartnerProfile, getPartnerAcademyStats, getPartnerSettings } from "@/lib/academy/data";
import AcademyNav from "@/components/academy/AcademyNav";
import FrontlineCountForm from "./FrontlineCountForm";
import AnnualDeclarationBox from "./AnnualDeclarationBox";
import { GraduationCap, Users, Mail, Play, CheckCircle, UserX, BarChart3 } from "lucide-react";

export default async function AkademiaPage() {
  const partnerId = (await getCurrentPartnerId())!;
  const partner = await getPartnerProfile(partnerId);
  const stats = await getPartnerAcademyStats(partnerId);
  const settings = await getPartnerSettings(partnerId);

  const kpiCards = [
    { label: "Munkatársak",              value: stats.total,      icon: Users,        color: "text-sni-brand-navy" },
    { label: "Meghívva",                 value: stats.invited,    icon: Mail,         color: "text-amber-500" },
    { label: "Elkezdte",                 value: stats.opened,     icon: Play,         color: "text-blue-500" },
    { label: "Sikeresen teljesítette",   value: stats.completed,  icon: CheckCircle,  color: "text-emerald-600" },
    { label: "Még nem kezdte el",        value: stats.notStarted, icon: UserX,        color: "text-rose-500" },
    { label: "Képzési lefedettség",      value: `${stats.coverage}%`, icon: BarChart3, color: "text-sni-brand-teal" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <AcademyNav companyName={partner?.company_name ?? ""} active="attekintes" />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex items-center gap-3 mb-6">
          <GraduationCap size={28} className="text-sni-brand-teal" />
          <div>
            <h1 className="text-2xl font-bold text-sni-text">Védett Akadémia</h1>
            <p className="text-sm text-gray-500">Képzések és munkatársi teljesítések</p>
          </div>
        </div>

        {/* KPI kártyák */}
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6 mb-8">
          {kpiCards.map((c) => (
            <div key={c.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
              <c.icon size={20} className={`${c.color} mb-2`} />
              <p className="text-2xl font-bold text-sni-text">{c.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>

        {/* Lefedettség sáv */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-sni-text">Képzési lefedettség</p>
            <p className="text-sm font-bold text-sni-brand-teal">{stats.coverage}%</p>
          </div>
          <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={stats.coverage} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="h-3 rounded-full bg-sni-brand-teal transition-all"
              style={{ width: `${Math.min(100, stats.coverage)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {stats.completed} / {stats.frontline > 0 ? stats.frontline : "?"} ügyfélkapcsolati munkatárs rendelkezik érvényes képzéssel
          </p>

          {/* Frontline count szerkesztő */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <FrontlineCountForm current={settings?.frontline_employee_count ?? 0} />
          </div>
        </div>

        {/* Munkáltatói felelősség */}
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm text-amber-800 mb-6" role="note">
          A Védett Partner saját felelőssége, hogy minden olyan munkatársat meghívjon és a képzés elvégzéséről gondoskodjon, aki a szolgáltatás során autista vagy ADHD-s vendéggel kapcsolatba kerülhet. A VédettSarok csak a partner által megadott munkatársi és létszámadatokból tudja számítani a képzési lefedettséget.
        </div>

        {/* Éves nyilatkozat */}
        <AnnualDeclarationBox
          confirmedAt={settings?.annual_confirmed_at ?? null}
          frontlineCount={settings?.frontline_employee_count ?? 0}
        />
      </div>
    </div>
  );
}
