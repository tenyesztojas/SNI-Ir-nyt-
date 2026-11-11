-- =====================================================================
-- Védett Család — gyermekfiók és felnőtt családtagság szétválasztása
-- (2026-11-06)
-- =====================================================================
-- Üzleti döntés: gyermekfiókhoz kapcsolt felhasználó nem válhat a család
-- felnőtt tagjává (gondviselő vagy tulajdonos) sem ugyanabban, sem másik
-- családban. A fordított irányt (családtag nem kapcsolható gyermekfiókként)
-- az accept_child_account_invitation eddig is ellenőrizte, de csak az
-- 'active' tagságra és zár nélkül.
-- Rés, amit ez zár:
--   * az accept_family_guardian_invitation nem nézte a child_accounts táblát:
--     egy gyermekfiókos felhasználó a saját e-mail-címére szóló meghívóval
--     gondviselő lehetett;
--   * a két elfogadás párhuzamosan mindkét ellenőrzésen átjuthatott.
-- Megoldás (adatbázisoldali, minden írási útra):
--   * "Élő" gyermekfiók-kapcsolat: child_accounts.status <> 'revoked'
--     (pending, active, suspended). A visszavont (megszűnt) kapcsolat NEM
--     tilt: az ilyen felnőtt felhasználó lehet családtag.
--   * "Élő" tagság: family_members.status in ('active', 'pending'). A
--     visszavont tagság NEM tilt.
--   * Két BEFORE trigger, mindkettő ugyanazt a felhasználónkénti advisory
--     lockot veszi fel ('family_role_user:<user_id>'), majd a MÁSIK táblát
--     ellenőrzi; így a párhuzamos meghívás/kapcsolás sorba rendeződik, és a
--     második az első véglegesített sorát már látja.
--   * Meglévő adatot nem módosít; az esetleges meglévő ütközéseket csak
--     NOTICE-ban jelzi.
-- A meglévő meghívási, gyermekfiók- és fióktörlési folyamatok változatlanok
-- (a fióktörlés csak töröl, arra a triggerek nem futnak).
-- =====================================================================

create or replace function public.enforce_family_member_not_child_account()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status not in ('active', 'pending') then
    return new;
  end if;
  -- már élő tagság módosítása (pl. szerepváltás) nem új szerepfelvétel
  if tg_op = 'UPDATE' and old.status in ('active', 'pending') and old.user_id = new.user_id then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('family_role_user:' || new.user_id::text, 0));
  if exists (
    select 1 from public.child_accounts ca
    where ca.auth_user_id = new.user_id and ca.status <> 'revoked'
  ) then
    raise exception using errcode = 'P0001',
      message = 'Gyermekfiókhoz kapcsolt felhasználó nem lehet a család felnőtt tagja (tulajdonos vagy gondviselő).',
      hint = 'family_child_account_conflict';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_family_member_not_child_account() from public, anon, authenticated;

drop trigger if exists enforce_family_member_not_child_account_trigger on public.family_members;
create trigger enforce_family_member_not_child_account_trigger
  before insert or update of status, user_id on public.family_members
  for each row execute function public.enforce_family_member_not_child_account();

create or replace function public.enforce_child_account_not_family_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'revoked' then
    return new;
  end if;
  -- már élő kapcsolat állapotváltása (pl. active -> suspended) nem új kapcsolás
  if tg_op = 'UPDATE' and old.status <> 'revoked' and old.auth_user_id = new.auth_user_id then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('family_role_user:' || new.auth_user_id::text, 0));
  if exists (
    select 1 from public.family_members fm
    where fm.user_id = new.auth_user_id and fm.status in ('active', 'pending')
  ) then
    raise exception using errcode = 'P0001',
      message = 'Családtag (tulajdonos vagy gondviselő) fiókja nem kapcsolható gyermekfiókként.',
      hint = 'family_child_account_conflict';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_child_account_not_family_member() from public, anon, authenticated;

drop trigger if exists enforce_child_account_not_family_member_trigger on public.child_accounts;
create trigger enforce_child_account_not_family_member_trigger
  before insert or update of status, auth_user_id on public.child_accounts
  for each row execute function public.enforce_child_account_not_family_member();

-- Meglévő ütközések jelzése (csak olvasás, adatot nem módosít).
do $$
declare v_conflicts int;
begin
  select count(distinct ca.auth_user_id) into v_conflicts
  from public.child_accounts ca
  join public.family_members fm on fm.user_id = ca.auth_user_id
  where ca.status <> 'revoked' and fm.status in ('active', 'pending');
  if v_conflicts > 0 then
    raise notice 'family_child_account_conflict: % meglévő felhasználónál él egyszerre gyermekfiók és családtagság (kézi felülvizsgálat szükséges)', v_conflicts;
  end if;
end $$;

-- ROLLBACK (kézzel, külön jóváhagyással):
--   drop trigger if exists enforce_family_member_not_child_account_trigger on public.family_members;
--   drop trigger if exists enforce_child_account_not_family_member_trigger on public.child_accounts;
--   drop function if exists public.enforce_family_member_not_child_account(),
--     public.enforce_child_account_not_family_member();
