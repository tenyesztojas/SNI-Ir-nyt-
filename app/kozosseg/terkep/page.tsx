import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/data";
import { getActiveCommunityMembers } from "@/lib/community/data";
import CommunityMap from "./CommunityMap";

export const metadata = { title: "Közösségi térkép – VédettSarok" };
export const dynamic = "force-dynamic";

export default async function TerképPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/belepes");

  const members = await getActiveCommunityMembers();
  // Csak térképen megjelenő tagok, közelítő koordinátával
  const mapMembers = members
    .filter((m) => m.map_display_enabled && m.approximate_lat && m.approximate_lng)
    .map((m) => ({
      id: m.id,
      display_name: m.display_name,
      role: m.role,
      city: m.city,
      district: m.district,
      intro_text: m.intro_text,
      connection_goals: m.connection_goals,
      lat: m.approximate_lat!,
      lng: m.approximate_lng!,
    }));

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      <div className="border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
        <h1 className="text-lg font-bold text-sni-text">Közösségi térkép</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Csak város/kerület szintű megjelenítés. Pontos lakcím nem látható.
        </p>
      </div>
      <div className="flex-1">
        <CommunityMap members={mapMembers} />
      </div>
    </div>
  );
}
