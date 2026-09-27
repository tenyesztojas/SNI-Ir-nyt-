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

// ────────────────────────────────────────────────────────────────
// Type boundary: PostgREST beágyazott (embedded) reláció normalizálása
// ────────────────────────────────────────────────────────────────
// A lenti két lekérdezés (family_members -> profiles,
// family_children -> child_profiles) mindkét esetben egy to-one
// (many-to-one) FK-relációt ágyaz be: egy family_members sor PONTOSAN
// egy profiles sorhoz kapcsolódik (user_id FK), egy family_children
// sor PONTOSAN egy child_profiles sorhoz (child_id FK). Egy ilyen
// to-one FK-nál a PostgREST FUTÁSIDŐBEN egyetlen objektumot (vagy
// null-t) ad vissza — tömböt csak a FORDÍTOTT irányú (to-many)
// beágyazásnál adna. A Supabase JS kliens (itt nincs Database
// generic, lásd lib/supabase/server.ts) fordítási időben viszont
// TÖMBKÉNT infereli ezt — ez a fordítási idő/futásidő eltérés okozta
// a korábbi regressziót (a kód a hibás compile-time típushoz lett
// igazítva, nem a valós runtime shape-hez).
//
// Ez a helper EGYETLEN, jól elkülönített type boundary-n kezeli ezt
// az eltérést — a FamilyView/FamilyMemberView/FamilyChildView
// alkalmazásmodell és a lenti mapping-logika ettől független, mindig
// egyetlen (vagy null) kapcsolt sorral dolgozik. Robusztus mindhárom
// lehetséges alakra: objektum, null/undefined, vagy (ha egy jövőbeli
// PostgREST/Supabase verzió vagy egy teszt-környezet mégis tömbként
// adná) egyelemű (vagy üres) tömb. Nincs `any`, nincs `as any`, nincs
// `@ts-ignore`/`@ts-expect-error`.
function normalizeToOneRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : null;
  }
  return value ?? null;
}

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
            // A Supabase kliens (Database generic nélkül) ezt a
            // to-one embedet fordítási időben tömbként infereli, a
            // PostgREST futásidőben viszont egyetlen objektumot (vagy
            // null-t) ad vissza — lásd a normalizeToOneRelation()
            // megjegyzését fent. Itt ezért mindkét alakot elfogadjuk,
            // és a normalizálást a helperre bízzuk, NEM egy `[0]`
            // indexeléssel.
            profiles:
              | { display_name?: string }[]
              | { display_name?: string }
              | null;
          }) => {
            const profile = normalizeToOneRelation(m.profiles);
            return {
              userId: m.user_id,
              role: m.role as FamilyRole,
              displayName: profile?.display_name ?? "Ismeretlen felhasználó",
            };
          }
        );

      const children: FamilyChildView[] = (childrenRes.data ?? [])
        .filter((fc: { family_id: string }) => fc.family_id === f.id)
        .map(
          (fc: {
            // Ugyanaz az ok, mint a profiles embed-nél fent: a
            // family_children -> child_profiles is to-one FK-reláció,
            // futásidőben egyetlen objektum (vagy null), nem tömb —
            // lásd normalizeToOneRelation().
            child_profiles:
              | {
                  id: string;
                  first_name: string;
                  birth_year: number | null;
                }[]
              | {
                  id: string;
                  first_name: string;
                  birth_year: number | null;
                }
              | null;
          }) => normalizeToOneRelation(fc.child_profiles)
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
