-- Izolált teszt-stub kiegészítés (SOHA nem éles): a delete_own_account_stubs.sql
-- minimális community_user_reports tábláját kiegészíti a megőrzési oszlopokkal
-- (20260830_community_help_moderation.sql minta).
alter table public.community_user_reports
  add column if not exists description text not null default 'leiras',
  add column if not exists retention_until timestamptz null,
  add column if not exists anonymized_at timestamptz null,
  add column if not exists closed_at timestamptz null,
  add column if not exists updated_at timestamptz not null default now();
alter table public.community_report_appeals
  add column if not exists admin_response text null,
  add column if not exists reviewed_at timestamptz null,
  add column if not exists updated_at timestamptz not null default now();
