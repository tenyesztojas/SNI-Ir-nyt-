-- ────────────────────────────────────────────────────────────────
-- Gyermekfiók-meghívás — BIZTONSÁGOS ELŐNÉZET (preview) RPC
-- ────────────────────────────────────────────────────────────────
-- CÉL: a /gyermek-meghivo?token=... oldal MOST bejelentkezés ELŐTT és
-- UTÁN is meg tudja mutatni, MELYIK gyermekprofilt érinti a meghívás
-- (lásd a feladat "informed acceptance" követelményét) — eddig a
-- meghívott csak VAKON fogadhatott el, mert a
-- child_account_invitations tábla SELECT RLS-e
-- ("child_account_invitations_select_via_family_owner", lásd
-- supabase/migrations/20260927_child_account_foundation.sql)
-- KIZÁRÓLAG a child family ownerjének enged olvasást — a token
-- birtokosának nem.
--
-- FORWARD-ONLY, ADDITÍV migráció — a 20260927_child_account_
-- foundation.sql-ben lévő táblákat/policy-kat NEM módosítja, csak EGY
-- ÚJ, önálló SECURITY DEFINER RPC-t ad hozzá. Nincs DROP/ALTER a
-- meglévő child_accounts/child_account_invitations táblán vagy azok
-- RLS policy-jain.
--
-- A token hash-elési mechanizmus BYTE-RA UGYANAZ, mint
-- accept_child_account_invitation()-ben:
--   encode(extensions.digest(p_token, 'sha256'), 'hex')
--
-- MINIMÁLIS VISSZATÉRÉS: KIZÁRÓLAG a gyermek keresztneve
-- (child_profiles.first_name). Explicit NEM adjuk vissza:
--   - child_id (nincs rá szükség a kliens oldalon — a
--     megerősítés/elfogadás a p_token-nel, nem child_id-val
--     történik, lásd accept_child_account_invitation(text))
--   - family_id, családtagok, testvérek
--   - napirend, születési év
--   - a meghívó token_hash-e, maga a meghívás id-ja
--   - guardian-/owner-adat, auth_user_id, e-mail-cím
--
-- NINCS lookup child_id/family_id/email alapján — a FÜGGVÉNY
-- EGYETLEN bemenete a plaintext token, és a visszaadott sor
-- KIZÁRÓLAG akkor nem üres, ha a token hash-e egy JELENLEG is
-- pending ÉS még nem lejárt meghívóra illeszkedik (ugyanaz a két
-- feltétel, mint accept_child_account_invitation()-ben — revoked és
-- accepted meghívók status-a már nem 'pending', tehát automatikusan
-- kiszűrődnek). Érvénytelen/lejárt/visszavont/már elfogadott token
-- esetén a függvény EGYSZERŰEN NULLA SORT ad vissza — a hívó oldal
-- (lásd app/gyermek-meghivo/page.tsx) ebből NEM tudja megkülönböztetni
-- a négy esetet egymástól, egyetlen generikus "már nem érvényes"
-- állapotot renderel, hogy ne szivárogtasson információt arról, hogy
-- egy adott token valaha is létezett-e.
create or replace function public.preview_child_account_invitation(
  p_token text
)
returns table (child_first_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token_hash text;
  v_child_id uuid;
begin
  if p_token is null or btrim(p_token) = '' then
    return;
  end if;

  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select cai.child_id
  into v_child_id
  from public.child_account_invitations cai
  where cai.token_hash = v_token_hash
    and cai.status = 'pending'
    and cai.expires_at > now();

  if v_child_id is null then
    return;
  end if;

  return query
    select cp.first_name
    from public.child_profiles cp
    where cp.id = v_child_id;
end;
$$;

comment on function public.preview_child_account_invitation(text) is
  'Biztonságos, token-kapuzott előnézet egy MÉG FÜGGŐ, NEM LEJÁRT gyermekfiók-meghívóhoz — KIZÁRÓLAG a gyermek keresztnevét adja vissza. Érvénytelen/lejárt/visszavont/elfogadott token esetén nulla sort ad (nincs megkülönböztethető hibaüzenet, lásd a fenti kommentet). A nagy entrópiájú token maga a jogosultság — lásd a lenti GRANT-okat.';

-- ────────────────────────────────────────────────────────────────
-- GRANT-ok — SZÁNDÉKOSAN eltér a modul többi RPC-jétől (amik
-- KIZÁRÓLAG authenticated-nek engedettek, anon-tól explicit
-- revoke-olva, lásd a 20260927_child_account_foundation.sql végén).
--
-- Ez a meghívó-link BEJELENTKEZÉS ELŐTT is megnyitható (lásd a
-- feladat 10. szekcióját: "token survives login/register redirect") —
-- az előnézetnek MÁR a bejelentkezési képernyő ELŐTT is működnie kell,
-- hogy a felhasználó lássa, kinek szól a meghívás, MIELŐTT
-- regisztrál/bejelentkezik. Ezért ez a FÜGGVÉNY (és KIZÁRÓLAG ez)
-- anon-nak is futtatható — ez biztonságos, mert:
--   1) a függvény bemenete a nagy entrópiájú (32 byte, hex-kódolt)
--      plaintext token, amit csak az kaphat meg, akinek az owner
--      továbbadta (lásd create_child_account_invitation()) — nem
--      kitalálható/brute-force-olható belátható időn belül;
--   2) a visszaadott adat KIZÁRÓLAG egy keresztnév, semmi egyéb
--      (nincs child_id, nincs family-/guardian-/email-adat);
--   3) a függvény NEM enged lookupot child_id/family_id/email
--      alapján — csak token-hash egyezés alapján enged nullánál több
--      sort visszaadni.
revoke execute on function public.preview_child_account_invitation(text) from public;
grant execute on function public.preview_child_account_invitation(text) to anon;
grant execute on function public.preview_child_account_invitation(text) to authenticated;
