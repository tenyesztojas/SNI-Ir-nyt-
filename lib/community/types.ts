// VédettSarok Közösség — TypeScript típusok

export type CommunityRole = "szulo" | "erintett_felnott" | "szakember" | "egyeb";
export type AvatarType = "photo" | "avatar" | "icon";
export type ProfileVisibility = "active" | "hidden";
export type ProfileStatus =
  | "draft"
  | "pending_review"
  | "active"
  | "hidden_by_user"
  | "suspended"
  | "deleted";
export type ConnectionStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "blocked"
  | "removed";
export type MessageStatus =
  | "active"
  | "deleted_by_user"
  | "deleted_by_admin"
  | "reported"
  | "hidden";
export type NotificationType =
  | "connection_request"
  | "connection_accepted"
  | "new_message"
  | "moderation"
  | "system";
export type MessagePrivacy = "anyone" | "connection" | "nobody";

export interface CommunityProfile {
  id: string;
  user_id: string;
  display_name: string;
  role: CommunityRole;
  profile_image_url?: string | null;
  avatar_type: AvatarType;
  intro_text?: string | null;
  country?: string | null;
  county?: string | null;
  city?: string | null;
  district?: string | null;
  map_display_enabled: boolean;
  approximate_lat?: number | null;
  approximate_lng?: number | null;
  // user_private_lat és user_private_lng SZÁNDÉKOSAN HIÁNYZIK — soha nem kerül frontend-re
  use_location_for_nearby: boolean;
  child_age_group?: string[] | null;
  neurodivergence_tags?: string[] | null;
  connection_goals?: string[] | null;
  accepts_friend_requests: boolean;
  accepts_first_message: MessagePrivacy;
  push_friend_requests: boolean;
  push_messages: boolean;
  push_connection_accepted: boolean;
  profile_visibility: ProfileVisibility;
  status: ProfileStatus;
  created_at: string;
  updated_at: string;
}

export interface CommunityConnection {
  id: string;
  requester_user_id: string;
  receiver_user_id: string;
  status: ConnectionStatus;
  intro_message?: string | null;
  created_at: string;
  updated_at: string;
  responded_at?: string | null;
  // Joined data
  other_profile?: CommunityProfile | null;
}

export interface CommunityThread {
  id: string;
  participant_1_user_id: string;
  participant_2_user_id: string;
  connection_id?: string | null;
  last_message_at?: string | null;
  created_at: string;
  // Joined data
  other_profile?: CommunityProfile | null;
  unread_count?: number;
  last_message_body?: string | null;
}

export interface CommunityMessage {
  id: string;
  thread_id: string;
  sender_user_id: string;
  body: string;
  read_at?: string | null;
  created_at: string;
  deleted_at?: string | null;
  status: MessageStatus;
}

export interface CommunityReport {
  id: string;
  reporter_user_id?: string | null;
  reported_user_id?: string | null;
  reported_profile_id?: string | null;
  reported_message_id?: string | null;
  reason: string;
  description?: string | null;
  status: "pending" | "resolved" | "dismissed";
  admin_note?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  related_user_id?: string | null;
  related_connection_id?: string | null;
  related_thread_id?: string | null;
  read_at?: string | null;
  created_at: string;
}

// Konstansok
export const ROLE_LABELS: Record<CommunityRole, string> = {
  szulo: "Szülő / hozzátartozó",
  erintett_felnott: "Érintett felnőtt",
  szakember: "Szakember",
  egyeb: "Egyéb",
};

export const CONNECTION_GOAL_OPTIONS = [
  { value: "beszelgetek_szulokkel", label: "Beszélgetnék más szülőkkel" },
  { value: "erintett_felnottekkel", label: "Érintett felnőttekkel kapcsolódnék" },
  { value: "helyi_csaldok", label: "Helyi családokat keresek" },
  { value: "kozos_jatszoteres", label: "Közös játszótéri program érdekel" },
  { value: "kozos_sera", label: "Közös séta vagy kirándulás érdekel" },
  { value: "intezmeny_tapasztalatcsere", label: "Intézményi tapasztalatcsere" },
  { value: "fejlesztohelyekrol", label: "Fejlesztőhelyekről beszélgetnék" },
  { value: "online_beszelgetes", label: "Online beszélgetés érdekel" },
  { value: "szemelyes_talalkozas", label: "Személyes találkozás is érdekel" },
  { value: "szakember_segito", label: "Szakemberként segítő kapcsolatokat keresek" },
  { value: "szakembert_kereső", label: "Szakembert kereső családokkal kapcsolódnék" },
];

export const NEURODIVERGENCE_OPTIONS = [
  { value: "autizmus", label: "Autizmus" },
  { value: "adhd", label: "ADHD" },
  { value: "autizmus_adhd", label: "Autizmus és ADHD" },
  { value: "szenzoros", label: "Szenzoros érzékenység" },
  { value: "tanulasi_nehezseg", label: "Tanulási nehézség" },
  { value: "nem_adom_meg", label: "Nem szeretném megadni" },
  { value: "egyeb", label: "Egyéb" },
];

export const CHILD_AGE_OPTIONS = [
  { value: "bolcsodes", label: "Bölcsődés korú" },
  { value: "ovodas", label: "Óvodás" },
  { value: "also", label: "Alsós" },
  { value: "felsos", label: "Felsős" },
  { value: "kozepiskolas", label: "Középiskolás" },
  { value: "fiatal_felnott", label: "Fiatal felnőtt" },
  { value: "nem_adom_meg", label: "Nem szeretném megadni" },
];

// ── Közösségi segítség ────────────────────────────────────────
export type HelpVisibility = "connections_only" | "city_or_district" | "county";

export interface CommunityHelpSettings {
  id: string;
  user_id: string;
  enabled: boolean;
  accepted_responsibility_notice_at: string | null;
  help_needed_enabled: boolean;
  help_needed_categories: string[];
  help_needed_description: string | null;
  help_offered_enabled: boolean;
  help_offered_categories: string[];
  help_offered_description: string | null;
  visibility: HelpVisibility;
  created_at: string;
  updated_at: string;
}

export type UserReportStatus =
  | "pending"
  | "under_review"
  | "resolved_no_action"
  | "resolved_warning_sent"
  | "resolved_help_disabled"
  | "resolved_profile_suspended"
  | "rejected";

export interface CommunityUserReport {
  id: string;
  reporter_user_id: string;
  reported_user_id: string;
  related_help_setting_id: string | null;
  related_thread_id: string | null;
  reason: string;
  description: string;
  status: UserReportStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const HELP_VISIBILITY_LABELS: Record<HelpVisibility, string> = {
  connections_only: "Csak kapcsolataimnak",
  city_or_district: "Közösségi tagoknak (város / kerület szinten)",
  county: "Közösségi tagoknak (megye szinten)",
};

export const HELP_NEEDED_CATEGORIES = [
  { value: "ugyintezesben_segitseg", label: "Ügyintézésben segítség" },
  { value: "hivatalos_ugyek_megertese", label: "Hivatalos ügyek megértése / előkészítése" },
  { value: "urlapok_dokumentumok", label: "Űrlapok, dokumentumok értelmezése" },
  { value: "idopontra_elkiseres", label: "Időpontra elkísérés" },
  { value: "orvosi_idopontra_elkiseres", label: "Orvosi vagy fejlesztői időpontra elkísérés, szülői jelenléttel" },
  { value: "kozos_programra_elkiseres", label: "Közös programra elkísérés" },
  { value: "uj_hely_kiprobalasa", label: "Új hely kipróbálása együtt" },
  { value: "tapasztalatmegosztas", label: "Tapasztalatmegosztás" },
  { value: "sorstars_beszelgetes", label: "Sorstársi beszélgetés" },
  { value: "bevasarlasban_segitseg", label: "Bevásárlásban vagy hétköznapi szervezésben segítség" },
  { value: "gyermek_melletti_jelenlét", label: "Gyermek melletti rövid jelenlét kizárólag szülővel egyeztetve", warning: "child" },
  { value: "szallitasban_segitseg", label: "Szállításban segítség kizárólag felnőtt hozzájárulással és külön egyeztetéssel", warning: "transport" },
  { value: "egyeb", label: "Egyéb" },
] as const;

export const HELP_OFFERED_CATEGORIES = [
  { value: "sorstars_beszelgetes", label: "Sorstársi beszélgetés" },
  { value: "tapasztalatmegosztas", label: "Tapasztalatmegosztás" },
  { value: "ugyintezesben_eligazitas", label: "Ügyintézésben eligazítás" },
  { value: "urlapok_dokumentumok", label: "Űrlapok, dokumentumok értelmezése" },
  { value: "programra_elkiseres", label: "Programra elkísérés" },
  { value: "uj_hely_kiprobalasa", label: "Új hely kipróbálása együtt" },
  { value: "bevasarlasban_segitseg", label: "Bevásárlásban vagy hétköznapi szervezésben segítség" },
  { value: "idopontra_elkiseres", label: "Időpontra elkísérés" },
  { value: "gyermek_melletti_jelenlét", label: "Rövid jelenlét gyermek mellett, kizárólag szülővel egyeztetve", warning: "child" },
  { value: "szallitasban_segitseg", label: "Szállításban segítség, kizárólag külön egyeztetéssel", warning: "transport" },
  { value: "egyeb", label: "Egyéb" },
] as const;

export const USER_REPORT_REASONS = [
  { value: "zaklatas_banto", label: "Zaklatás vagy bántó viselkedés" },
  { value: "gyanús_veszelyes_felajanlas", label: "Gyanús vagy veszélyes segítségfelajánlás" },
  { value: "gyermek_adat_megosztasa", label: "Gyermek személyes adatának megosztása" },
  { value: "erzekeny_adat_megosztasa", label: "Érzékeny adat nyilvános megosztása" },
  { value: "penzkeresugyzletszeru", label: "Pénzkérés vagy üzletszerű szolgáltatás hirdetése" },
  { value: "megteveeszto_info", label: "Megtévesztő információ" },
  { value: "nem_megfelelo_uzenet", label: "Nem megfelelő üzenet vagy kapcsolatfelvétel" },
  { value: "visszaeles_funkcióval", label: "Visszaélés a közösségi segítség funkcióval" },
  { value: "egyeb", label: "Egyéb" },
] as const;

// Városok közelítő koordinátái a térképes megjelenítéshez
export const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  "Budapest": { lat: 47.4979, lng: 19.0402 },
  "Debrecen": { lat: 47.5316, lng: 21.6273 },
  "Miskolc": { lat: 48.1035, lng: 20.7784 },
  "Pécs": { lat: 46.0727, lng: 18.2323 },
  "Győr": { lat: 47.6875, lng: 17.6504 },
  "Nyíregyháza": { lat: 47.9495, lng: 21.7244 },
  "Kecskemét": { lat: 46.9067, lng: 19.6917 },
  "Székesfehérvár": { lat: 47.1865, lng: 18.4221 },
  "Szombathely": { lat: 47.2307, lng: 16.6218 },
  "Szolnok": { lat: 47.1621, lng: 20.1825 },
  "Tatabánya": { lat: 47.5726, lng: 18.3960 },
  "Kaposvár": { lat: 46.3594, lng: 17.7964 },
  "Veszprém": { lat: 47.0930, lng: 17.9087 },
  "Érd": { lat: 47.3922, lng: 18.9137 },
  "Zalaegerszeg": { lat: 46.8417, lng: 16.8416 },
  "Eger": { lat: 47.9025, lng: 20.3772 },
  "Dunaújváros": { lat: 46.9819, lng: 18.9355 },
  "Sopron": { lat: 47.6849, lng: 16.5845 },
  "Nagykanizsa": { lat: 46.4590, lng: 16.9897 },
  "Békéscsaba": { lat: 46.6792, lng: 21.0877 },
  "Salgótarján": { lat: 48.0955, lng: 19.7997 },
  "Esztergom": { lat: 47.7924, lng: 18.7408 },
  "Pápa": { lat: 47.3297, lng: 17.4694 },
  "Ajka": { lat: 47.1006, lng: 17.5561 },
  "Mosonmagyaróvár": { lat: 47.8691, lng: 17.2687 },
  "Hatvan": { lat: 47.6678, lng: 19.6811 },
  "Gödöllő": { lat: 47.5978, lng: 19.3581 },
  "Cegléd": { lat: 47.1703, lng: 19.7997 },
  "Várpalota": { lat: 47.2026, lng: 18.1372 },
  "Kazincbarcika": { lat: 48.2511, lng: 20.6408 },
  "Szekszárd": { lat: 46.3478, lng: 18.7061 },
  "Dombóvár": { lat: 46.3764, lng: 18.1339 },
  "Orosháza": { lat: 46.5655, lng: 20.6647 },
  "Baja": { lat: 46.1833, lng: 18.9536 },
  "Ózd": { lat: 48.2197, lng: 20.2903 },
  "Tiszaújváros": { lat: 47.9194, lng: 21.0581 },
  "Gyöngyös": { lat: 47.7839, lng: 19.9281 },
  "Gyula": { lat: 46.6478, lng: 21.2800 },
  "Mátészalka": { lat: 47.9536, lng: 22.3200 },
  "Sárospatak": { lat: 48.3211, lng: 21.5711 },
  "Marcali": { lat: 46.5847, lng: 17.4086 },
  "Paks": { lat: 46.6261, lng: 18.8558 },
  "Szentendre": { lat: 47.6728, lng: 19.0736 },
  "Vecsés": { lat: 47.4069, lng: 19.2706 },
  "Budaörs": { lat: 47.4614, lng: 18.9553 },
  "Pomáz": { lat: 47.6406, lng: 18.9994 },
  "Törökbálint": { lat: 47.4256, lng: 18.9089 },
  "Dunakeszi": { lat: 47.6253, lng: 19.1392 },
  "Fót": { lat: 47.6139, lng: 19.1894 },
  "Szigetszentmiklós": { lat: 47.3453, lng: 19.0436 },
};

// Case-insensitive városkeresés
export function findCityCoordinates(city: string): { lat: number; lng: number } | null {
  const lower = city.trim().toLowerCase();
  const entry = Object.entries(CITY_COORDINATES).find(
    ([key]) => key.toLowerCase() === lower
  );
  return entry ? entry[1] : null;
}

// Budapest kerületek közelítő koordinátái
export const BUDAPEST_DISTRICT_COORDINATES: Record<string, { lat: number; lng: number }> = {
  "I.": { lat: 47.4963, lng: 19.0394 },
  "II.": { lat: 47.5371, lng: 18.9889 },
  "III.": { lat: 47.5597, lng: 19.0386 },
  "IV.": { lat: 47.5697, lng: 19.0792 },
  "V.": { lat: 47.5014, lng: 19.0518 },
  "VI.": { lat: 47.5084, lng: 19.0670 },
  "VII.": { lat: 47.4994, lng: 19.0737 },
  "VIII.": { lat: 47.4877, lng: 19.0778 },
  "IX.": { lat: 47.4724, lng: 19.0764 },
  "X.": { lat: 47.4792, lng: 19.1253 },
  "XI.": { lat: 47.4644, lng: 19.0220 },
  "XII.": { lat: 47.5013, lng: 18.9800 },
  "XIII.": { lat: 47.5258, lng: 19.0627 },
  "XIV.": { lat: 47.5139, lng: 19.1011 },
  "XV.": { lat: 47.5614, lng: 19.1069 },
  "XVI.": { lat: 47.5162, lng: 19.1622 },
  "XVII.": { lat: 47.4740, lng: 19.1889 },
  "XVIII.": { lat: 47.4472, lng: 19.1375 },
  "XIX.": { lat: 47.4440, lng: 19.1031 },
  "XX.": { lat: 47.4319, lng: 19.0764 },
  "XXI.": { lat: 47.4253, lng: 19.0503 },
  "XXII.": { lat: 47.4017, lng: 18.9811 },
  "XXIII.": { lat: 47.3933, lng: 19.0964 },
};
