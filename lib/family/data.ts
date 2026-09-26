import { createClient } from "@/lib/supabase/server";

// Family modul — read-only adatlekérés a jelenlegi userhez tartozó
// családokra. KIZÁRÓLAG a meglévő szerver oldali (cookie-alapú, RLS-t
// tiszteletben tartó) Supabase klienst használja — nincs service_role,
// nincs admin client, nincs hardcode-olt user ID, nincs RLS-megkerülés.
//
// Szándékosan sima, egymás után futó (nem beágyazott PostgREST embed)
// lekérdezésekkel dolgozik és a csoportosítást JS-ben végzi — ez a
// legegyszerűbb, legkevésbé hibalehetőséges megoldás egy első MVP-hez,
// nem egy általános family service réteg.

export type FamilyRole = "owner" | "guardian";

export type FamilyMemberView = {
  userId: string;
  role: FamilyRole;
  displayName: string;
};

export type FamilyChildView = {
  id: string;
  firstName: string;
  birthYear: number | null;
};

export type FamilyView = {
  id: string;
  name: string | null;
  myRole: FamilyRole;
  members: FamilyMemberView[];
  children: FamilyChildView[];
};

export async function getMyFamilies(
  userId: string
): Promise<{ families: FamilyView[]; error?: string }> {
  const supabase = createClient();

  // A user aktív family tagságai — ez dönti el, mely családok
  // jelennek meg EZEN a személyes oldalon (szándékosan NEM az admin
  // RLS-en keresztül elméletileg látható összes családot mutatjuk,
  // hanem csak azokat, amiknek a jelenlegi user tényleg tagja).
  const { data: memberships, error: membershipsError } = await supabase
    .from("family_members")
    .select("family_id, role")
    .eq("user_id", userId)
    .eq("status", "active");

  if (membershipsError) {
    return { families: [], error: membershipsError.message };
  }
  if (!memberships || memberships.length === 0) {
    return { families: [] };
  }

  const familyIds = memberships.map((m) => m.family_id as string);
  const myRoleByFamily = new Map<string, FamilyRole>(
    memberships.map((m) => [m.family_id as string, m.role as FamilyRole])
  );

  const [familiesRes, membersRes, childrenRes] = await Promise.all([
    supabase.from("families").select("id, name").in("id", familyIds),
    supabase
      .from("family_members")
      .select("family_id, user_id, role, profiles(display_name)")
      .in("family_id", familyIds)
      .eq("status", "active"),
    supabase
      .from("family_children")
      .select("family_id, child_profiles(id, first_name, birth_year)")
      .in("family_id", familyIds),
  ]);

  const firstError =
    familiesRes.error || membersRes.error || childrenRes.error;
  if (firstError) {
    return { families: [], error: firstError.message };
  }

  const families: FamilyView[] = (familiesRes.data ?? []).map(
    (f: { id: string; name: string | null }) => {
      const members: FamilyMemberView[] = (membersRes.data ?? [])
        .filter((m: { family_id: string }) => m.family_id === f.id)
        .map(
          (m: {
            user_id: string;
            role: string;
            profiles: { display_name?: string } | null;
          }) => ({
            userId: m.user_id,
            role: m.role as FamilyRole,
            displayName: m.profiles?.display_name ?? "Ismeretlen felhasználó",
          })
        );

      const children: FamilyChildView[] = (childrenRes.data ?? [])
        .filter((fc: { family_id: string }) => fc.family_id === f.id)
        .map(
          (fc: {
            child_profiles: {
              id: string;
              first_name: string;
              birth_year: number | null;
            } | null;
          }) => fc.child_profiles
        )
        .filter(
          (
            child
          ): child is { id: string; first_name: string; birth_year: number | null } =>
            Boolean(child?.id)
        )
        .map((child) => ({
          id: child.id,
          firstName: child.first_name,
          birthYear: child.birth_year,
        }));

      return {
        id: f.id,
        name: f.name,
        myRole: myRoleByFamily.get(f.id) ?? "guardian",
        members,
        children,
      };
    }
  );

  return { families };
}
