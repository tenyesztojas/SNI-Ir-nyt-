-- =====================================================================
-- Forrás: docs/account-deletion/migration/20261020000000_delete_own_account.DRAFT.sql
-- (SNI_Iranytu_ios_auth_release, változatlan SQL-tartalommal átvéve).
-- Éles adatbázissal összevetve: 2026-10-26 (függvény- és triggerdefiníciók,
-- FK-szabályok és oszlopok egyeznek). Élesben már telepítve: ott újrafuttatás
-- helyett a migrációs nyilvántartásban rögzítendő.
-- =====================================================================

-- =====================================================================
-- VédettSarok — TRANZAKCIÓBIZTOS FIÓKTÖRLÉS (delete_own_account)
-- TERVEZET (DRAFT) — NEM FUTTATVA, NEM ÉLES. Ne másold supabase/migrations/
-- alá jóváhagyás és izolált tesztelés előtt (lásd ../TEST_PLAN.md).
-- ---------------------------------------------------------------------
-- CÉL: a családi adatok, a felhasználó saját rekordjai ÉS az auth.users sor
-- törlése EGYETLEN PostgreSQL-tranzakcióban. Bármely hiba esetén minden
-- módosítás visszagördül (nincs részleges, visszafordíthatatlan törlés).
--
-- ADDITÍV migráció:
--   * NEM módosítja a meglévő prepare_account_deletion / _account_deletion_classify
--     / get_account_deletion_state / transfer_family_ownership függvényeket
--     (a jelenlegi API változatlanul működik, amíg át nem állítjuk).
--   * NEM módosít idegen kulcsot, oszlopot, sort.
--   * Új objektumok: 1 policy-tábla (+ seed), 4 függvény.
--
-- MEGŐRZÉSI SZABÁLYOK: public.account_deletion_retention_policy tábla.
-- Alapértelmezés KONZERVATÍV: minden jogi/termékdöntést igénylő rekordtípus
-- 'manual' (=> kézi ügyintézés), amíg a döntés meg nem születik. Egyszerű
-- felhasználónál (akinek ezekben a táblákban nincs sora) a törlés automatikus.
--
-- Kézi ügyintézési állapot: RECORDS_MANUAL_REVIEW (új; a jelenlegi kliens nem
-- ismeri — csak az új API/kliens használja, lásd TRANSACTIONAL_ACCOUNT_DELETION.md).
-- =====================================================================

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------
-- 1. Megőrzési szabályok (auditálható, migrációval/adminnal módosítható)
-- ---------------------------------------------------------------------
create table if not exists public.account_deletion_retention_policy (
  rule_key    text primary key,
  action      text not null,
  allowed     text[] not null,
  decided_by  text null,           -- pl. 'jogi:2026-10-xx' — a döntés forrása
  decided_at  timestamptz null,
  note        text not null,
  constraint account_deletion_retention_policy_action_allowed check (action = any (allowed))
);
alter table public.account_deletion_retention_policy enable row level security;
revoke all on public.account_deletion_retention_policy from public, anon, authenticated;

insert into public.account_deletion_retention_policy (rule_key, action, allowed, note) values
  ('place_claims',         'manual',   array['manual','delete'],
     'Saját hely-igénylés (céges e-mail). Döntés: törölhető-e automatikusan.'),
  ('place_responses',      'manual',   array['manual','delete'],
     'Saját Nyilvános Válasz. reports.response_id ON DELETE SET NULL.'),
  ('messages_sent',        'manual',   array['manual','delete'],
     'A felhasználó által KÜLDÖTT üzenetek (saját tartalom).'),
  ('messages_received',    'manual',   array['manual','delete','pseudonymize'],
     'A felhasználó által KAPOTT üzenetek (MÁS felhasználó tartalma). pseudonymize: recipient_user_id = NULL — DROP NOT NULL migrációt igényel.'),
  ('consent_log',          'manual',   array['manual','delete','revoke_pseudonymize'],
     'Üzenetküldési hozzájárulások. revoke_pseudonymize: revoked_at=now(), user_id=NULL — DROP NOT NULL migrációt igényel. Megőrzési idő nincs a tájékoztatóban.'),
  ('appeals_closed',       'manual',   array['manual','pseudonymize'],
     'LEZÁRT saját fellebbezés (3 év megőrzés). pseudonymize: appellant_user_id=NULL — DROP NOT NULL migrációt igényel. Nyitott fellebbezés MINDIG kézi.'),
  ('admin_metadata_nullable','set_null', array['manual','set_null'],
     'Nullable admin-metaadat (community_report_appeals.reviewed_by, provider_registrations.reviewed_by, academy_partner_settings.annual_confirmed_by): a felülvizsgálat ténye/ideje marad, a személy-hivatkozás NULL.')
on conflict (rule_key) do nothing;

-- ---------------------------------------------------------------------
-- 2. Belső: megőrzendő rekordok vizsgálata (mutáció nélkül)
--    NULL = nincs akadály; különben {state:'RECORDS_MANUAL_REVIEW', reasons:[...]}
--    A reasons CSAK szabálykulcsokat tartalmaz, személyes adatot nem.
-- ---------------------------------------------------------------------
create or replace function public._account_deletion_records_check(p_uid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_reasons text[] := '{}';
  v_pol jsonb;
begin
  if p_uid is null then
    return jsonb_build_object('state', 'RECORDS_MANUAL_REVIEW', 'reasons', jsonb_build_array('no_session'));
  end if;

  select coalesce(jsonb_object_agg(rule_key, action), '{}'::jsonb) into v_pol
  from public.account_deletion_retention_policy;

  -- KEMÉNY szabályok (policy-tól függetlenül mindig kézi ügyintézés)
  if exists (select 1 from public.profiles where id = p_uid and role = 'admin') then
    v_reasons := array_append(v_reasons, 'admin_account');
  end if;
  if exists (select 1 from public.community_report_audit_log where admin_user_id = p_uid) then
    v_reasons := array_append(v_reasons, 'admin_audit_log');
  end if;
  if exists (select 1 from public.academy_source_documents where uploaded_by = p_uid) then
    v_reasons := array_append(v_reasons, 'academy_source_documents');
  end if;
  if exists (select 1 from public.community_report_appeals
                 where appellant_user_id = p_uid and status in ('pending', 'under_review')) then
    v_reasons := array_append(v_reasons, 'appeal_open');
  end if;
  -- Jogi megőrzés: a community_user_reports CASCADE-del törlődne (reporter/reported)
  if exists (select 1 from public.community_user_reports
                 where (reporter_user_id = p_uid or reported_user_id = p_uid) and legal_hold) then
    v_reasons := array_append(v_reasons, 'legal_hold');
  end if;

  -- POLICY-függő szabályok: ha van sor és a szabály 'manual'
  if coalesce(v_pol->>'place_claims', 'manual') = 'manual'
     and exists (select 1 from public.place_claims where claimant_user_id = p_uid) then
    v_reasons := array_append(v_reasons, 'place_claims');
  end if;
  if coalesce(v_pol->>'place_responses', 'manual') = 'manual'
     and exists (select 1 from public.place_responses where responder_user_id = p_uid) then
    v_reasons := array_append(v_reasons, 'place_responses');
  end if;
  if coalesce(v_pol->>'messages_sent', 'manual') = 'manual'
     and exists (select 1 from public.messages where sender_user_id = p_uid) then
    v_reasons := array_append(v_reasons, 'messages_sent');
  end if;
  if coalesce(v_pol->>'messages_received', 'manual') = 'manual'
     and exists (select 1 from public.messages where recipient_user_id = p_uid) then
    v_reasons := array_append(v_reasons, 'messages_received');
  end if;
  if coalesce(v_pol->>'consent_log', 'manual') = 'manual'
     and exists (select 1 from public.consent_log where user_id = p_uid) then
    v_reasons := array_append(v_reasons, 'consent_log');
  end if;
  if coalesce(v_pol->>'appeals_closed', 'manual') = 'manual'
     and exists (select 1 from public.community_report_appeals
                 where appellant_user_id = p_uid and status not in ('pending', 'under_review')) then
    v_reasons := array_append(v_reasons, 'appeals_closed');
  end if;
  if coalesce(v_pol->>'admin_metadata_nullable', 'manual') = 'manual'
     and (exists (select 1 from public.community_report_appeals where reviewed_by = p_uid)
       or exists (select 1 from public.provider_registrations where reviewed_by = p_uid)
       or exists (select 1 from public.academy_partner_settings where annual_confirmed_by = p_uid)) then
    v_reasons := array_append(v_reasons, 'admin_metadata');
  end if;

  if array_length(v_reasons, 1) is null then
    return null;
  end if;
  return jsonb_build_object('state', 'RECORDS_MANUAL_REVIEW', 'reasons', to_jsonb(v_reasons));
end;
$$;
revoke execute on function public._account_deletion_records_check(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Belső: családi adatok törlése — a prepare_account_deletion (20261004)
--    törzsének VÁLTOZATLAN sorrendje, kiemelve. Csak delete_own_account hívja,
--    UGYANABBAN a tranzakcióban (commit nélkül).
-- ---------------------------------------------------------------------
create or replace function public._account_deletion_family_cleanup(p_uid uuid, p_class jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_fid uuid;
  v_children uuid[];
  v_deleted_families int := 0;
  v_deleted_children int := 0;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_class->'family_deletion', '[]'::jsonb))
  loop
    v_fid := (v_item->>'family_id')::uuid;

    select coalesce(array_agg(child_id), '{}') into v_children
    from public.family_children where family_id = v_fid;

    if exists (select 1 from public.child_accounts where child_id = any(v_children))
       or exists (select 1 from public.family_children
                  where child_id = any(v_children) and family_id <> v_fid)
       or exists (select 1 from public.family_members
                  where family_id = v_fid and status = 'active' and user_id <> p_uid) then
      raise exception 'A család állapota megváltozott, a törlés megszakadt';
    end if;

    delete from public.child_schedule_items where child_id = any(v_children);
    delete from public.guardian_child_permissions where child_id = any(v_children);
    delete from public.child_account_invitations where child_id = any(v_children);
    delete from public.family_children where family_id = v_fid;
    delete from public.child_profiles where id = any(v_children);
    delete from public.family_guardian_invitations where family_id = v_fid;

    perform set_config('vedettsarok.family_deletion_id', v_fid::text, true);
    delete from public.families where id = v_fid;
    perform set_config('vedettsarok.family_deletion_id', '', true);

    v_deleted_families := v_deleted_families + 1;
    v_deleted_children := v_deleted_children + coalesce(array_length(v_children, 1), 0);
  end loop;

  delete from public.guardian_child_permissions where guardian_user_id = p_uid;
  delete from public.family_members where user_id = p_uid;

  return jsonb_build_object('deleted_families', v_deleted_families,
                            'deleted_children', v_deleted_children);
end;
$$;
revoke execute on function public._account_deletion_family_cleanup(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Állapot (v2): a meglévő osztályozás + a rekord-alapú kézi ügyintézés.
--    A régi get_account_deletion_state VÁLTOZATLAN marad (kompatibilitás).
-- ---------------------------------------------------------------------
create or replace function public.get_account_deletion_state_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_rec jsonb;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges';
  end if;
  v_rec := public._account_deletion_records_check(v_uid);
  if v_rec is not null then
    return v_rec || jsonb_build_object('transfer', '[]'::jsonb, 'family_deletion', '[]'::jsonb);
  end if;
  return public._account_deletion_classify(v_uid);
end;
$$;
revoke execute on function public.get_account_deletion_state_v2() from public, anon;
grant execute on function public.get_account_deletion_state_v2() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Tranzakcióbiztos saját fióktörlés
-- ---------------------------------------------------------------------
create or replace function public.delete_own_account(p_confirm_family_deletion boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_pol jsonb;
  v_rec jsonb;
  v_class jsonb;
  v_state text;
  v_fam jsonb;
  v_n int;
  v_con text;
  v_tbl text;
  v_code text;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges';
  end if;

  -- Ugyanaz a zárolás, mint a prepare_account_deletion-ben (egy userre egy futás;
  -- a user Familyjei zárolva a transfer_family_ownership-pel szemben).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  perform 1 from public.families
   where id in (select family_id from public.family_members where user_id = v_uid)
   order by id for update;

  -- (a) Megőrzendő rekordok -> kézi ügyintézés, semmi nem módosul.
  v_rec := public._account_deletion_records_check(v_uid);
  if v_rec is not null then
    return jsonb_build_object('ok', false, 'transfer', '[]'::jsonb, 'family_deletion', '[]'::jsonb) || v_rec;
  end if;

  -- (b) Családi osztályozás — a meglévő szabályok változatlanul.
  v_class := public._account_deletion_classify(v_uid);
  v_state := v_class->>'state';
  if v_state not in ('READY', 'GUARDIAN_READY', 'OTHER_OWNER_READY',
                     'SOLE_OWNER_FAMILY_DELETE_CONFIRMATION_REQUIRED') then
    return jsonb_build_object('ok', false) || v_class;
  end if;
  if v_state = 'SOLE_OWNER_FAMILY_DELETE_CONFIRMATION_REQUIRED'
     and coalesce(p_confirm_family_deletion, false) is not true then
    return jsonb_build_object('ok', false) || v_class;
  end if;

  select coalesce(jsonb_object_agg(rule_key, action), '{}'::jsonb) into v_pol
  from public.account_deletion_retention_policy;

  -- (c) MINDEN módosítás egy alblokkban (implicit SAVEPOINT). Megkötés-hiba
  --     esetén a blokk teljes egészében visszagördül, és strukturált választ
  --     adunk. Minden más hiba a teljes tranzakciót görgeti vissza (RPC-hiba).
  begin
    v_fam := public._account_deletion_family_cleanup(v_uid, v_class);

    -- Policy-alapú saját rekordok. 'manual' esetén ide csak akkor jutunk,
    -- ha nincs sor (a records_check különben megállított).
    if v_pol->>'place_responses' = 'delete' then
      delete from public.place_responses where responder_user_id = v_uid;
    end if;
    if v_pol->>'place_claims' = 'delete' then
      delete from public.place_claims where claimant_user_id = v_uid;
    end if;
    if v_pol->>'messages_sent' = 'delete' then
      delete from public.messages where sender_user_id = v_uid;
    end if;
    if v_pol->>'messages_received' = 'delete' then
      delete from public.messages where recipient_user_id = v_uid;
    elsif v_pol->>'messages_received' = 'pseudonymize' then
      update public.messages set recipient_user_id = null where recipient_user_id = v_uid;
    end if;
    if v_pol->>'consent_log' = 'delete' then
      delete from public.consent_log where user_id = v_uid;
    elsif v_pol->>'consent_log' = 'revoke_pseudonymize' then
      update public.consent_log set revoked_at = coalesce(revoked_at, now()), user_id = null
       where user_id = v_uid;
    end if;
    if v_pol->>'appeals_closed' = 'pseudonymize' then
      update public.community_report_appeals set appellant_user_id = null
       where appellant_user_id = v_uid and status not in ('pending', 'under_review');
    end if;
    if v_pol->>'admin_metadata_nullable' = 'set_null' then
      update public.community_report_appeals set reviewed_by = null where reviewed_by = v_uid;
      update public.provider_registrations   set reviewed_by = null where reviewed_by = v_uid;
      update public.academy_partner_settings set annual_confirmed_by = null where annual_confirmed_by = v_uid;
    end if;

    -- Az auth.users sor törlése UGYANABBAN a tranzakcióban.
    -- CASCADE: profiles, auth.identities/sessions/... (élesben ellenőrizendő!)
    delete from auth.users where id = v_uid;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'A felhasználó nem található (törölt sorok: %)', v_n;
    end if;
  exception
    when foreign_key_violation or restrict_violation or not_null_violation then
      get stacked diagnostics v_con = constraint_name, v_tbl = table_name, v_code = returned_sqlstate;
      return jsonb_build_object(
        'ok', false,
        'state', 'RECORDS_MANUAL_REVIEW',
        'reasons', jsonb_build_array('db_constraint'),
        'blocked_by', coalesce(nullif(v_tbl, ''), '?') || '.' || coalesce(nullif(v_con, ''), '?'),
        'sqlstate', v_code,
        'transfer', '[]'::jsonb,
        'family_deletion', '[]'::jsonb);
  end;

  return jsonb_build_object(
    'ok', true,
    'state', v_state,
    'deleted_families', coalesce((v_fam->>'deleted_families')::int, 0),
    'deleted_children', coalesce((v_fam->>'deleted_children')::int, 0));
end;
$$;
revoke execute on function public.delete_own_account(boolean) from public, anon;
grant execute on function public.delete_own_account(boolean) to authenticated;

commit;
