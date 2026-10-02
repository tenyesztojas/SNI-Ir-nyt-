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
  // Owner-only (lásd a ChildAccountStatusView kommentjét) —
  // guardian-családoknál mindig null, ugyanazon elv alapján, mint a
  // guardianChildSchedulePermissions mezőnél: ez egy owner-only
  // account-kezelő UI adatforrása, nem egy általános olvasási nézet.
  // A getLinkedChildSelfView() által visszaadott gyermek-saját nézetnél
  // is mindig null (ott nincs értelme).
  accountStatus: ChildAccountStatusView | null;
};

export type PendingGuardianInvitationView = {
  id: string;
  invitedEmail: string;
  createdAt: string;
};

// Owner-only — egy adott (guardian, child) párra vonatkozó, Napirend
// szempontjából releváns jogosultság-állapot a guardian_child_permissions
// táblából (lásd supabase/migrations/20260927_child_account_foundation.sql).
// KIZÁRÓLAG a Napirend megtekintés/kezelés UI-hoz kell — a journey/GPS
// flageket (can_start_supervised_journey, can_view_active_journey,
// can_view_live_location) NEM ez a típus modellezi, azokat a
// guardianChildFuturePermissionsByKey map tartja nyilván getMyFamilies()-ben,
// KIZÁRÓLAG azért, hogy az owner UI action a meglévő
// upsert_guardian_child_permission(...) RPC hívásakor pontosan ezeket az
// ÉRINTETLEN flag-eket tudja visszaküldeni (lásd
// lib/actions/family.ts updateGuardianChildScheduleAccessAction()) — SOHA
// nem jelenik meg ez a UI-n, és SOHA nem módosítja ezt ez a funkció.
export type GuardianChildSchedulePermissionView = {
  guardianUserId: string;
  childId: string;
  canViewSchedule: boolean;
  canManageSchedule: boolean;
};

// Owner-only — egy (owner, child) pár gyermekfiók-állapota. "none":
// nincs sem child_accounts sor, sem pending meghívó. "pending_invitation":
// van egy MÉG FÜGGŐ (nem lejárt) child_account_invitations sor.
// "active": van egy NEM visszavont (active/suspended) child_accounts
// sor. Lásd supabase/migrations/20260927_child_account_foundation.sql —
// a jelenlegi RPC-foundation semelyik meglévő RPC-vel sem hoz létre
// 'pending' vagy 'suspended' állapotú child_accounts sort
// (accept_child_account_invitation mindig 'active'-ot insertál), ezért
// ez a típus csak a valóban előforduló három állapotot modellezi.
export type ChildAccountStatusView =
  | { kind: "none" }
  | { kind: "pending_invitation"; invitationId: string; expiresAt: string }
  | { kind: "active"; accountId: string };

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
  // KIZÁRÓLAG owner szerepkör esetén töltött (lásd getMyFamilies()) — a
  // guardian_child_permissions SELECT RLS (is_child_family_owner(child_id)
  // or guardian_user_id = auth.uid(), lásd
  // supabase/migrations/20260927_child_account_foundation.sql) a guardian
  // saját lekérdezését is engedné a SAJÁT sorára, de ezt a mezőt a data
  // loader guardian-családoknál explicit üres tömbbel tölti — ez egy
  // owner-only PERMISSION-KEZELŐ UI adatforrása, nem egy általános
  // olvasási nézet, ezért nem adjuk oda guardiannak.
  guardianChildSchedulePermissions: GuardianChildSchedulePermissionView[];
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

// Owner-oldali nézet (lásd FamilyView.pendingGuardianInvitations) — ez
// EGY a saját, meghívott e-mail-címre szóló, MÉG FÜGGŐ meghívást
// modellez, amit a bejelentkezett userNEK KELL látnia, hogy
// elfogadhassa/elutasíthassa (lásd GuardianInvitationInbox.tsx). A
// familyName KIZÁRÓLAG megjelenítési célt szolgál ("Meghívták Önt a(z)
// X család családhoz") — a tényleges elfogadás/elutasítás jogosultságát
// NEM ez a lekérdezés, hanem az accept_family_guardian_invitation /
// decline_family_guardian_invitation RPC-k saját, auth.email()-alapú
// ellenőrzése adja (lásd lib/actions/family.ts).
export type RecipientGuardianInvitationView = {
  id: string;
  familyId: string;
  familyName: string | null;
  createdAt: string;
};

// A /csalad oldal KÖRKÖRÖS onboarding-függőségének feloldásához (lásd a
// hibajegyet: egy meghívott, NEM béta-userhez szóló meghívás korábban
// SOSE volt látható, mert a teljes oldal a hasFamilyBetaAccess() kapun
// bukott el, MIELŐTT egyáltalán lekérdezte volna a meghívásait) —
// KIZÁRÓLAG a bejelentkezett user SAJÁT, szerveroldali (session-ből
// jövő, SOHA nem böngészőből kapott) e-mail-címére szóló, MÉG FÜGGŐ
// meghívásokat adja vissza. A family_guardian_invitations SELECT RLS
// (is_family_owner(family_id) or lower(invited_email) =
// lower(auth.email()), lásd
// supabase/migrations/20260927_family_guardian_invitation_foundation.sql)
// ÖNMAGÁBAN is garantálja, hogy egy user SOSE láthat más userhez szóló
// meghívást — az alábbi explicit `.eq("invited_email", ...)` szűrés
// ezen FELÜL, kifejezetten azért kell, hogy ez a lekérdezés
// KIZÁRÓLAG a RECIPIENS-oldali sorokat adja vissza, NE az owner által
// (a saját családjába) kiküldött, a RLS által ugyanúgy látható
// meghívásokat is.
export async function getPendingGuardianInvitationsForUser(
  email: string | undefined | null
): Promise<{ invitations: RecipientGuardianInvitationView[]; error?: string }> {
  if (typeof email !== "string" || email.trim().length === 0) {
    return { invitations: [] };
  }
  const emailNormalized = email.trim().toLowerCase();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("family_guardian_invitations")
    .select("id, family_id, created_at, families(name)")
    .eq("invited_email", emailNormalized)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString());

  if (error) {
    return { invitations: [], error: error.message };
  }

  const invitations: RecipientGuardianInvitationView[] = (data ?? []).map(
    (row: {
      id: string;
      family_id: string;
      created_at: string;
      families: { name: string | null }[] | { name: string | null } | null;
    }) => {
      const family = normalizeToOneRelation(row.families);
      return {
        id: row.id,
        familyId: row.family_id,
        familyName: family?.name ?? null,
        createdAt: row.created_at,
      };
    }
  );

  return { invitations };
}

// Könnyűsúlyú EXISTENCE-check a /profil navigációs Család-bejegyzés
// gate-jéhez (lásd app/profil/page.tsx) — SZÁNDÉKOSAN NEM a teljes
// getMyFamilies()/getPendingGuardianInvitationsForUser() lekérdezés-pár
// (azok több JOIN-t és a teljes napirend-/engedély-adatot is betöltik,
// ami egy puszta "van-e egyáltalán Family hozzáférésed" kérdéshez
// felesleges terhelés lenne minden /profil betöltésnél). Mindkét al-
// lekérdezés `.select("id").limit(1)`, és a MEGLÉVŐ RLS-ekre (lásd
// family_members_select_* és
// family_guardian_invitations_select_owner_or_recipient) támaszkodik —
// ez a függvény csak a "van legalább egy sor" kérdést teszi fel, a
// tényleges Family-adatbetöltést a /csalad oldal getMyFamilies()-e
// végzi.
export async function hasAnyFamilyAccessSignal(
  userId: string,
  email: string | undefined | null
): Promise<boolean> {
  const supabase = createClient();

  const membershipCheck = supabase
    .from("family_members")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);

  const invitationCheck = typeof email === "string" && email.trim().length > 0
    ? supabase
        .from("family_guardian_invitations")
        .select("id")
        .eq("invited_email", email.trim().toLowerCase())
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .limit(1)
    : Promise.resolve({ data: [] as { id: string }[], error: null });

  // ÚJ: linkelt, AKTÍV child_accounts sor is önálló belépési pont — egy
  // gyermek-saját userhez SOSE lesz family_members sora (lásd
  // accept_child_account_invitation RPC: explicit blokkolja, ha a
  // hívónak már van aktív family_members sora, és SOSE hoz létre
  // ilyet), tehát a membershipCheck ág önmagában SOSE adna neki
  // hozzáférést — ez a harmadik, egymástól független belépési pont
  // (lásd app/csalad/page.tsx getLinkedChildSelfView()-ra épülő ágát).
  const childAccountCheck = supabase
    .from("child_accounts")
    .select("id")
    .eq("auth_user_id", userId)
    .eq("status", "active")
    .limit(1);

  const [membershipRes, invitationRes, childAccountRes] = await Promise.all([
    membershipCheck,
    invitationCheck,
    childAccountCheck,
  ]);

  return (
    (membershipRes.data?.length ?? 0) > 0 ||
    (invitationRes.data?.length ?? 0) > 0 ||
    (childAccountRes.data?.length ?? 0) > 0
  );
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

  // Owner-only: az összes SAJÁT (owner által birtokolt) gyermekhez
  // tartozó, Napirend-releváns guardian_child_permissions sor — ez adja
  // a "Gondviselők" szekció permission-kezelő UI-jának adatát (lásd
  // GuardianManagement.tsx). A guardian_child_permissions SELECT RLS
  // (is_child_family_owner(child_id) or guardian_user_id = auth.uid(),
  // lásd supabase/migrations/20260927_child_account_foundation.sql) az
  // ownernek MINDEN sort visszaad a saját gyermekeihez, bármelyik
  // guardianhoz tartozzon — tehát ez EGYETLEN batch-elt lekérdezés,
  // NEM guardianonkénti/childenkénti N+1. Csak owner-családok gyermek
  // azonosítóira kérdezünk (ownerChildIds), guardian-családokra nem — ott
  // a mezőt a data loader lent explicit üres tömbbel tölti.
  const ownerChildIds = Array.from(
    new Set(
      (childrenRes.data ?? [])
        .filter(
          (fc: { family_id: string }) =>
            myRoleByFamily.get(fc.family_id) === "owner"
        )
        .map((fc: { child_profiles: { id: string }[] | { id: string } | null }) =>
          normalizeToOneRelation(fc.child_profiles)
        )
        .filter((child): child is { id: string } => Boolean(child?.id))
        .map((child) => child.id)
    )
  );

  const guardianChildSchedulePermissionsByFamily = new Map<
    string,
    GuardianChildSchedulePermissionView[]
  >();
  if (ownerChildIds.length > 0) {
    const { data: ownerPermissionRows, error: ownerPermissionsError } =
      await supabase
        .from("guardian_child_permissions")
        .select("child_id, guardian_user_id, can_view_schedule, can_manage_schedule")
        .eq("status", "active")
        .in("child_id", ownerChildIds);

    if (ownerPermissionsError) {
      return { families: [], error: ownerPermissionsError.message };
    }

    // child_id -> family_id, hogy a sorokat a megfelelő családhoz tudjuk
    // csoportosítani (egy gyermek pontosan egy családhoz tartozik).
    const familyIdByChildId = new Map<string, string>();
    for (const fc of childrenRes.data ?? []) {
      const child = normalizeToOneRelation(
        (fc as { child_profiles: { id: string }[] | { id: string } | null })
          .child_profiles
      );
      if (child?.id) {
        familyIdByChildId.set(child.id, (fc as { family_id: string }).family_id);
      }
    }

    for (const row of ownerPermissionRows ?? []) {
      const familyId = familyIdByChildId.get(row.child_id);
      if (!familyId) continue;
      const list = guardianChildSchedulePermissionsByFamily.get(familyId) ?? [];
      list.push({
        guardianUserId: row.guardian_user_id,
        childId: row.child_id,
        canViewSchedule: row.can_view_schedule,
        canManageSchedule: row.can_manage_schedule,
      });
      guardianChildSchedulePermissionsByFamily.set(familyId, list);
    }
  }

  // Owner-only: az összes SAJÁT (owner által birtokolt) gyermekhez
  // tartozó gyermekfiók-állapot (child_accounts / child_account_
  // invitations) — ez adja a "Gyermekfiók" szekció UI-jának adatát
  // (lásd ChildAccountSection.tsx). KIZÁRÓLAG owner-családok gyermek
  // azonosítóira kérdezünk (ownerChildIds) — ugyanaz a minta, mint a
  // guardianChildSchedulePermissionsByFamily-nál fent. A child_accounts
  // SELECT RLS (auth_user_id = auth.uid() or is_child_family_owner(child_id))
  // és a child_account_invitations SELECT RLS
  // (is_child_family_owner(child_id)) — mindkettő lásd
  // supabase/migrations/20260927_child_account_foundation.sql — ownerként
  // mindig visszaadja a saját gyermekeihez tartozó sorokat; guardian-
  // családokra nem kérdezünk (ott a mezőt a data loader lent explicit
  // null-lal tölti).
  const childAccountStatusByChildId = new Map<string, ChildAccountStatusView>();
  if (ownerChildIds.length > 0) {
    const [childAccountsRes, childInvitationsRes] = await Promise.all([
      supabase
        .from("child_accounts")
        .select("id, child_id, status")
        .in("child_id", ownerChildIds)
        .neq("status", "revoked"),
      supabase
        .from("child_account_invitations")
        .select("id, child_id, status, expires_at")
        .in("child_id", ownerChildIds)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString()),
    ]);

    if (childAccountsRes.error) {
      return { families: [], error: childAccountsRes.error.message };
    }
    if (childInvitationsRes.error) {
      return { families: [], error: childInvitationsRes.error.message };
    }

    // Pending meghívó előbb, aktív account UTÓBB írja felül — egy
    // childhoz legfeljebb egy nem-revoked account és legfeljebb egy
    // pending meghívó létezhet egyszerre (lásd a child_accounts
    // child_id unique constraint-ját és a child_account_invitations
    // "egy pending per child" egyedi indexét), tehát ez a sorrend csak
    // a gyakorlatban elő nem forduló átmeneti állapotok esetén dönt.
    for (const row of childInvitationsRes.data ?? []) {
      childAccountStatusByChildId.set(row.child_id, {
        kind: "pending_invitation",
        invitationId: row.id,
        expiresAt: row.expires_at,
      });
    }
    for (const row of childAccountsRes.data ?? []) {
      childAccountStatusByChildId.set(row.child_id, {
        kind: "active",
        accountId: row.id,
      });
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
          accountStatus:
            myRole === "owner"
              ? childAccountStatusByChildId.get(child.id) ?? { kind: "none" }
              : null,
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
        guardianChildSchedulePermissions:
          myRole === "owner"
            ? guardianChildSchedulePermissionsByFamily.get(f.id) ?? []
            : [],
      };
    }
  );

  return { families };
}

// Gyermek-saját (child-self) nézet — KIZÁRÓLAG a bejelentkezett userhez
// LINKELT, AKTÍV child_accounts sor alapján (lásd
// supabase/migrations/20260927_child_account_foundation.sql). Ez a
// lekérdezés SOSE megy a family_children/family_members táblákon
// keresztül — nincs is rá szükség: a child_profiles és
// child_schedule_items SELECT RLS mindkettő tartalmaz egy dedikált
// child-self ágat (exists (... ca.auth_user_id = auth.uid() and
// ca.status = 'active' ...)), lásd
// 20261001_family_schedule_authorization_completion.sql és
// 20260927_guardian_child_permission_hardening_v1.sql — tehát egy
// linkelt gyermek-account KÖZVETLENÜL, a family_members tábla
// megkerülésével (amibe egyébként SOSE kerül be, lásd
// accept_child_account_invitation RPC) látja a SAJÁT gyermekprofilját
// és napirendjét. canManageSchedule mindig false (a gyermek sosem
// módosíthatja a saját napirendjét — a child_schedule_items
// UPDATE/DELETE RLS-ben NINCS child-self ág), accountStatus mindig
// null (az owner-only, itt nincs értelme).
export async function getLinkedChildSelfView(
  userId: string
): Promise<{ child: FamilyChildView | null; error?: string }> {
  const supabase = createClient();

  const { data: accountRow, error: accountError } = await supabase
    .from("child_accounts")
    .select("child_id")
    .eq("auth_user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (accountError) {
    return { child: null, error: accountError.message };
  }
  if (!accountRow) {
    return { child: null };
  }

  const childId = accountRow.child_id as string;

  const [profileRes, scheduleRes] = await Promise.all([
    supabase
      .from("child_profiles")
      .select("id, first_name, birth_year")
      .eq("id", childId)
      .maybeSingle(),
    supabase
      .from("child_schedule_items")
      .select(
        "id, child_id, title, description, schedule_type, start_date, end_date, time_local, arrival_time_local, days_of_week, origin_label, destination_label, is_active"
      )
      .eq("child_id", childId),
  ]);

  if (profileRes.error) {
    return { child: null, error: profileRes.error.message };
  }
  if (scheduleRes.error) {
    return { child: null, error: scheduleRes.error.message };
  }
  if (!profileRes.data) {
    return { child: null };
  }

  function toHourMinute(value: string): string {
    return value.length >= 5 ? value.slice(0, 5) : value;
  }

  const scheduleItems: ChildScheduleItemView[] = (scheduleRes.data ?? [])
    .map(
      (row: {
        id: string;
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
      }) => ({
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
      })
    )
    .sort((a, b) => {
      if (a.timeLocal !== b.timeLocal) {
        return a.timeLocal < b.timeLocal ? -1 : 1;
      }
      return a.id.localeCompare(b.id);
    });

  return {
    child: {
      id: profileRes.data.id,
      firstName: profileRes.data.first_name,
      birthYear: profileRes.data.birth_year,
      canManageSchedule: false,
      scheduleItems,
      accountStatus: null,
    },
  };
}

// Biztonságos, token-kapuzott előnézet egy gyermekfiók-meghívóhoz —
// KIZÁRÓLAG a meglévő preview_child_account_invitation(text) RPC-t
// hívja (lásd supabase/migrations/20261002_child_account_invitation_
// preview.sql). Ez a RPC anon-nak is futtatható (lásd a migráció
// GRANT-kommentjét), ezért ez a függvény bejelentkezés ELŐTT és UTÁN
// is biztonságosan hívható — a nagy entrópiájú token maga a
// jogosultság, nem a bejelentkezett session. Érvénytelen/lejárt/
// visszavont/már elfogadott token esetén a RPC nulla sort ad vissza —
// ezt egyetlen, megkülönböztethetetlen `{ preview: null }` válaszként
// adjuk tovább, hogy a hívó oldal (app/gyermek-meghivo/page.tsx) NE
// tudjon információt szivárogtatni arról, hogy egy adott token valaha
// is létezett-e.
export type ChildAccountInvitationPreviewView = {
  childFirstName: string;
};

export async function previewChildAccountInvitation(
  token: string
): Promise<{ preview: ChildAccountInvitationPreviewView | null; error?: string }> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { preview: null };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .rpc("preview_child_account_invitation", { p_token: trimmed })
    .maybeSingle();

  if (error) {
    return { preview: null, error: error.message };
  }
  if (!data) {
    return { preview: null };
  }

  const row = data as { child_first_name: string };
  return { preview: { childFirstName: row.child_first_name } };
}
