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
};

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
