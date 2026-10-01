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

export type ScheduleType = "one_time" | "recurring";

export type ChildScheduleItemView = {
  id: string;
  title: string;
  description: string | null;
  scheduleType: ScheduleType;
  startDate: string | null;
  endDate: string | null;
  timeLocal: string;
  arrivalTimeLocal: string | null;
  daysOfWeek: number[] | null;
  originLabel: string | null;
  destinationLabel: string | null;
  isActive: boolean;
};

export type FamilyChildView = {
  id: string;
  firstName: string;
  birthYear: number | null;
  // Owner-családoknál MINDIG true. Guardian-családoknál a sor
  // egyáltalán csak akkor jelenik meg (lásd a
  // family_children/child_profiles RLS guardian-ágát,
  // 20261001_family_schedule_authorization_completion.sql), ha a
  // hívónak van aktív can_view_schedule VAGY can_manage_schedule
  // jogosultsága ehhez a childhoz — tehát a MEGJELENÉS maga már
  // "legalább view" jogot garantál; ez a mező KIZÁRÓLAG azt dönti el,
  // hogy a Napirend UI megjelenítse-e a létrehozás/szerkesztés/törlés
  // vezérlőket (lásd scheduleItemsByChild/canManageScheduleByChild
  // felépítését getMyFamilies()-ben).
  canManageSchedule: boolean;
  scheduleItems: ChildScheduleItemView[];
};

export type PendingGuardianInvitationView = {
  id: string;
  invitedEmail: string;
  createdAt: string;
};

export type FamilyView = {
  id: string;
  name: string | null;
  myRole: FamilyRole;
  members: FamilyMemberView[];
  children: FamilyChildView[];
  // KIZÁRÓLAG owner szerepkör esetén töltött — lásd getMyFamilies():
  // a lekérdezés is csak az owner-családokra szűkítve fut, nem csak a
  // UI rejti guardian elől (lásd family_guardian_invitations RLS:
  // supabase/migrations/20260927_family_guardian_invitation_foundation.sql).
  pendingGuardianInvitations: PendingGuardianInvitationView[];
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

  // Függő gondviselő-meghívásokat KIZÁRÓLAG azokra a családokra
  // kérdezzük le, amelyeknek a jelenlegi user aktív ownerje — a
  // guardian-oldali RLS (lower(invited_email) = lower(auth.email()))
  // egyébként is kiszűrné, de így eleve nem is futtatunk felesleges
  // lekérdezést guardian-only családokra.
  const ownerFamilyIds = familyIds.filter(
    (id) => myRoleByFamily.get(id) === "owner"
  );

  const [familiesRes, membersRes, childrenRes, invitationsRes] = await Promise.all([
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
    ownerFamilyIds.length > 0
      ? supabase
          .from("family_guardian_invitations")
          .select("id, family_id, invited_email, created_at")
          .in("family_id", ownerFamilyIds)
          .eq("status", "pending")
      : Promise.resolve({
          data: [] as {
            id: string;
            family_id: string;
            invited_email: string;
            created_at: string;
          }[],
          error: null,
        }),
  ]);

  const firstError =
    familiesRes.error || membersRes.error || childrenRes.error || invitationsRes.error;
  if (firstError) {
    return { families: [], error: firstError.message };
  }

  // Napirendi elemek — EGYETLEN, batch-elt lekérdezés az ÖSSZES, a
  // fenti family_children/child_profiles RLS által már amúgy is
  // visszaadott (tehát jogosultság szerint eleve kiszűrt) gyermek
  // azonosítóra, NEM gyermekenkénti külön lekérdezéssel (N+1 elkerülése).
  // A child_schedule_items SELECT RLS (lásd
  // supabase/migrations/20260927_guardian_child_permission_hardening_v1.sql)
  // owner/guardian_child_permissions/child-self alapján amúgy is
  // kiszűrné a nem-jogosult sorokat — itt a childId-halmaz maga is már
  // csak a jogosult gyermekeket tartalmazza (lásd a children
  // felépítésénél lentebb), tehát ez a lekérdezés nem is KÉR olyan
  // napirendet, amihez a user egyébként sem férne hozzá.
  const allChildIds = Array.from(
    new Set(
      (childrenRes.data ?? [])
        .map(
          (fc: {
            child_profiles:
              | { id: string }[]
              | { id: string }
              | null;
          }) => normalizeToOneRelation(fc.child_profiles)
        )
        .filter((child): child is { id: string } => Boolean(child?.id))
        .map((child) => child.id)
    )
  );

  const scheduleItemsRes =
    allChildIds.length > 0
      ? await supabase
          .from("child_schedule_items")
          .select(
            "id, child_id, title, description, schedule_type, start_date, end_date, time_local, arrival_time_local, days_of_week, origin_label, destination_label, is_active"
          )
          .in("child_id", allChildIds)
      : {
          data: [] as {
            id: string;
            child_id: string;
            title: string;
            description: string | null;
            schedule_type: string;
            start_date: string | null;
            end_date: string | null;
            time_local: string;
            arrival_time_local: string | null;
            days_of_week: number[] | null;
            origin_label: string | null;
            destination_label: string | null;
            is_active: boolean;
          }[],
          error: null as { message: string } | null,
        };

  if (scheduleItemsRes.error) {
    return { families: [], error: scheduleItemsRes.error.message };
  }

  // KIZÁRÓLAG a hívó SAJÁT, aktív guardian_child_permissions sorai —
  // ez dönti el (guardian-családoknál), hogy a Napirend UI megjelenítse
  // a létrehozás/szerkesztés/törlés vezérlőket. Owner-családoknál ez a
  // map nem is kell (lásd lent: owner esetén canManageSchedule mindig
  // true, a family_db_beta pilot-gate owner-oldali eltávolítása után —
  // lásd 20261001_family_schedule_authorization_completion.sql). Nem
  // más guardianok permission-sorait kérjük le (guardian_user_id =
  // userId szűrés), tehát nem szivárogtatunk más gondviselők privát
  // jogosultsági adatát.
  const canManageScheduleByChild = new Map<string, boolean>();
  if (allChildIds.length > 0) {
    const { data: permissionRows, error: permissionsError } = await supabase
      .from("guardian_child_permissions")
      .select("child_id, can_manage_schedule")
      .eq("guardian_user_id", userId)
      .eq("status", "active")
      .in("child_id", allChildIds);

    if (permissionsError) {
      return { families: [], error: permissionsError.message };
    }

    for (const row of permissionRows ?? []) {
      if (row.can_manage_schedule) {
        canManageScheduleByChild.set(row.child_id, true);
      }
    }
  }

  // Óra-string normalizálás: a Postgres `time` oszlop PostgREST-en
  // keresztül "HH:MM:SS"-t ad vissza, a UI viszont "HH:MM"-et vár
  // (HTML <input type="time"> defaultValue-hoz) — a másodperc-rész
  // levágása tiszta string-szeletelés, nincs időzóna-konverzió.
  function toHourMinute(value: string): string {
    return value.length >= 5 ? value.slice(0, 5) : value;
  }

  const scheduleItemsByChild = new Map<string, ChildScheduleItemView[]>();
  for (const row of scheduleItemsRes.data ?? []) {
    const list = scheduleItemsByChild.get(row.child_id) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      description: row.description,
      scheduleType: row.schedule_type as ScheduleType,
      startDate: row.start_date,
      endDate: row.end_date,
      timeLocal: toHourMinute(row.time_local),
      arrivalTimeLocal: row.arrival_time_local
        ? toHourMinute(row.arrival_time_local)
        : null,
      daysOfWeek: row.days_of_week,
      originLabel: row.origin_label,
      destinationLabel: row.destination_label,
      isActive: row.is_active,
    });
    scheduleItemsByChild.set(row.child_id, list);
  }
  // Determinisztikus sorrend minden gyermeken belül: kezdési idő
  // szerint növekvő (napi ütemezés-logika), `id` szerinti
  // másodlagos rendezéssel azonos időpont esetén.
  for (const [childId, items] of scheduleItemsByChild) {
    items.sort((a, b) => {
      if (a.timeLocal !== b.timeLocal) {
        return a.timeLocal < b.timeLocal ? -1 : 1;
      }
      return a.id.localeCompare(b.id);
    });
    scheduleItemsByChild.set(childId, items);
  }

  const pendingInvitationsByFamily = new Map<
    string,
    PendingGuardianInvitationView[]
  >();
  for (const invitation of invitationsRes.data ?? []) {
    const list = pendingInvitationsByFamily.get(invitation.family_id) ?? [];
    list.push({
      id: invitation.id,
      invitedEmail: invitation.invited_email,
      createdAt: invitation.created_at,
    });
    pendingInvitationsByFamily.set(invitation.family_id, list);
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

      const myRole = myRoleByFamily.get(f.id) ?? "guardian";

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
          // Owner-családnál mindig true (a family_db_beta pilot-gate
          // owner-oldali eltávolítása után, lásd 20261001_family_
          // schedule_authorization_completion.sql); guardian-családnál
          // a SAJÁT aktív can_manage_schedule flag dönt.
          canManageSchedule:
            myRole === "owner" || canManageScheduleByChild.get(child.id) === true,
          scheduleItems: scheduleItemsByChild.get(child.id) ?? [],
        }))
        // Gyermekek mindig születési év szerint NÖVEKVŐ sorrendben
        // (legidősebb elöl) — ismeretlen (null) születési évvel
        // rendelkező gyermek MINDIG a lista VÉGÉN, az ismert évűek
        // után. Az Array.prototype.sort ES2019 óta garantáltan
        // stabil, de a `child.id` szerinti másodlagos rendezéssel
        // ettől FÜGGETLENÜL is determinisztikus a sorrend — nem a
        // (nem garantált sorrendű) DB lekérdezés eredeti sorára
        // támaszkodik, sem azonos évű, sem (mindkét) ismeretlen
        // évű gyermekek esetén.
        .sort((a, b) => {
          if (a.birthYear !== b.birthYear) {
            if (a.birthYear === null) return 1;
            if (b.birthYear === null) return -1;
            return a.birthYear - b.birthYear;
          }
          return a.id.localeCompare(b.id);
        });

      return {
        id: f.id,
        name: f.name,
        myRole,
        members,
        children,
        pendingGuardianInvitations:
          myRole === "owner"
            ? pendingInvitationsByFamily.get(f.id) ?? []
            : [],
      };
    }
  );

  return { families };
}
