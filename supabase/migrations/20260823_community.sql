-- VédettSarok Közösség — Supabase migrációs SQL
-- Futtatd a Supabase SQL Editorban

-- ─────────────────────────────────────────────
-- 1. community_profiles
-- ─────────────────────────────────────────────
create table if not exists community_profiles (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  display_name                text not null,
  role                        text not null default 'szulo'
                              check (role in ('szulo','erintett_felnott','szakember','egyeb')),
  profile_image_url           text,
  avatar_type                 text default 'icon'
                              check (avatar_type in ('photo','avatar','icon')),
  intro_text                  text,
  country                     text default 'Magyarország',
  county                      text,
  city                        text,
  district                    text,           -- Budapest kerület
  map_display_enabled         boolean default true,
  approximate_lat             double precision, -- város/kerület középpontja
  approximate_lng             double precision,
  user_private_lat            double precision, -- SOHA nem kerül frontend-re
  user_private_lng            double precision,
  use_location_for_nearby     boolean default false,
  child_age_group             text[],
  neurodivergence_tags        text[],
  connection_goals            text[],
  accepts_friend_requests     boolean default true,
  accepts_first_message       text default 'connection'
                              check (accepts_first_message in ('anyone','connection','nobody')),
  push_friend_requests        boolean default true,
  push_messages               boolean default true,
  push_connection_accepted    boolean default true,
  profile_visibility          text default 'active'
                              check (profile_visibility in ('active','hidden')),
  status                      text default 'pending_review'
                              check (status in ('draft','pending_review','active','hidden_by_user','suspended','deleted')),
  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now(),
  unique (user_id)
);

-- Index a városra/státuszra (keresés/szűrés)
create index if not exists idx_community_profiles_city   on community_profiles(city);
create index if not exists idx_community_profiles_status on community_profiles(status);

-- ─────────────────────────────────────────────
-- 2. community_connections
-- ─────────────────────────────────────────────
create table if not exists community_connections (
  id                  uuid primary key default gen_random_uuid(),
  requester_user_id   uuid not null references auth.users(id) on delete cascade,
  receiver_user_id    uuid not null references auth.users(id) on delete cascade,
  status              text not null default 'pending'
                      check (status in ('pending','accepted','declined','blocked','removed')),
  intro_message       text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  responded_at        timestamptz,
  unique (requester_user_id, receiver_user_id)
);

create index if not exists idx_connections_receiver on community_connections(receiver_user_id, status);
create index if not exists idx_connections_requester on community_connections(requester_user_id, status);

-- ─────────────────────────────────────────────
-- 3. community_threads (1:1 chat szál)
-- ─────────────────────────────────────────────
create table if not exists community_threads (
  id                    uuid primary key default gen_random_uuid(),
  participant_1_user_id uuid not null references auth.users(id) on delete cascade,
  participant_2_user_id uuid not null references auth.users(id) on delete cascade,
  connection_id         uuid references community_connections(id) on delete set null,
  last_message_at       timestamptz,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create index if not exists idx_threads_p1 on community_threads(participant_1_user_id, last_message_at desc);
create index if not exists idx_threads_p2 on community_threads(participant_2_user_id, last_message_at desc);

-- ─────────────────────────────────────────────
-- 4. community_messages
-- ─────────────────────────────────────────────
create table if not exists community_messages (
  id              uuid primary key default gen_random_uuid(),
  thread_id       uuid not null references community_threads(id) on delete cascade,
  sender_user_id  uuid not null references auth.users(id) on delete cascade,
  body            text not null,
  read_at         timestamptz,
  created_at      timestamptz default now(),
  deleted_at      timestamptz,
  reported_at     timestamptz,
  status          text default 'active'
                  check (status in ('active','deleted_by_user','deleted_by_admin','reported','hidden'))
);

create index if not exists idx_messages_thread on community_messages(thread_id, created_at);

-- ─────────────────────────────────────────────
-- 5. community_reports
-- ─────────────────────────────────────────────
create table if not exists community_reports (
  id                    uuid primary key default gen_random_uuid(),
  reporter_user_id      uuid references auth.users(id) on delete set null,
  reported_user_id      uuid references auth.users(id) on delete set null,
  reported_profile_id   uuid references community_profiles(id) on delete set null,
  reported_message_id   uuid references community_messages(id) on delete set null,
  reason                text not null,
  description           text,
  status                text default 'pending'
                        check (status in ('pending','resolved','dismissed')),
  admin_note            text,
  created_at            timestamptz default now(),
  resolved_at           timestamptz,
  resolved_by_admin_id  uuid references auth.users(id) on delete set null
);

-- ─────────────────────────────────────────────
-- 6. notifications
-- ─────────────────────────────────────────────
create table if not exists notifications (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  type                    text not null
                          check (type in ('connection_request','connection_accepted','new_message','moderation','system')),
  title                   text not null,
  body                    text,
  related_user_id         uuid references auth.users(id) on delete set null,
  related_connection_id   uuid references community_connections(id) on delete set null,
  related_thread_id       uuid references community_threads(id) on delete set null,
  read_at                 timestamptz,
  created_at              timestamptz default now()
);

create index if not exists idx_notifications_user on notifications(user_id, read_at, created_at desc);

-- ─────────────────────────────────────────────
-- 7. RLS engedélyezése
-- ─────────────────────────────────────────────
alter table community_profiles    enable row level security;
alter table community_connections enable row level security;
alter table community_threads     enable row level security;
alter table community_messages    enable row level security;
alter table community_reports     enable row level security;
alter table notifications         enable row level security;

-- community_profiles RLS
create policy "Aktív profilok láthatók belépett tagoknak"
  on community_profiles for select
  using (
    auth.uid() is not null
    and status = 'active'
    and profile_visibility = 'active'
  );

create policy "Saját profil mindig látható"
  on community_profiles for select
  using (auth.uid() = user_id);

create policy "Saját profil létrehozható"
  on community_profiles for insert
  with check (auth.uid() = user_id);

create policy "Saját profil szerkeszthető"
  on community_profiles for update
  using (auth.uid() = user_id);

-- community_connections RLS
create policy "Saját kapcsolatok láthatók"
  on community_connections for select
  using (auth.uid() = requester_user_id or auth.uid() = receiver_user_id);

create policy "Kapcsolatkérés küldése"
  on community_connections for insert
  with check (auth.uid() = requester_user_id);

create policy "Kapcsolat frissítése (fogadó)"
  on community_connections for update
  using (auth.uid() = receiver_user_id or auth.uid() = requester_user_id);

-- community_threads RLS
create policy "Saját szálak láthatók"
  on community_threads for select
  using (auth.uid() = participant_1_user_id or auth.uid() = participant_2_user_id);

create policy "Szál létrehozása"
  on community_threads for insert
  with check (auth.uid() = participant_1_user_id or auth.uid() = participant_2_user_id);

create policy "Szál frissítése"
  on community_threads for update
  using (auth.uid() = participant_1_user_id or auth.uid() = participant_2_user_id);

-- community_messages RLS
create policy "Üzenetek láthatók a szál résztvevőinek"
  on community_messages for select
  using (
    exists (
      select 1 from community_threads t
      where t.id = thread_id
      and (t.participant_1_user_id = auth.uid() or t.participant_2_user_id = auth.uid())
    )
    and status not in ('deleted_by_admin','hidden')
  );

create policy "Üzenet küldése"
  on community_messages for insert
  with check (
    auth.uid() = sender_user_id
    and exists (
      select 1 from community_threads t
      where t.id = thread_id
      and (t.participant_1_user_id = auth.uid() or t.participant_2_user_id = auth.uid())
    )
  );

create policy "Saját üzenet törlése"
  on community_messages for update
  using (auth.uid() = sender_user_id);

-- community_reports RLS
create policy "Saját bejelentések láthatók"
  on community_reports for select
  using (auth.uid() = reporter_user_id);

create policy "Bejelentés küldése"
  on community_reports for insert
  with check (auth.uid() = reporter_user_id);

-- notifications RLS
create policy "Saját értesítések"
  on notifications for select
  using (auth.uid() = user_id);

create policy "Értesítés olvasottra állítása"
  on notifications for update
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- 8. user_private_lat/lng SOHA nem kerül SELECT-be
-- (az összes lekérdező query explicit oszlopokat sorol fel)
-- ─────────────────────────────────────────────
-- MEGJEGYZÉS: A szerver-side lekérdezések explicit oszloplistát használnak,
-- soha nem SELECT *, így user_private_lat és user_private_lng
-- nem kerül a frontend-re.
