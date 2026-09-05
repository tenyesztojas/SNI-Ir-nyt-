# Védett Karrier – Product Integration Report
Task: #273
Dátum: 2026-09-04
Státusz: **TASK #273 — GO FOR REVIEW**

---

## Változtatások összefoglalója

### 1. Nav fix – HeaderClient.tsx

**Fájl:** `components/HeaderClient.tsx`, sor 40
**Változás:** `href: "/vedettmunka"` → `href: "/vedett-karrier"`

A "VédettKarrier" globális nav elem mostantól az új Sprint 1–6 rendszerre mutat.
A desktop és mobile navigáció egyszerre érintett (mindkettő ugyanazt a `PILOT_LINKS`
tömböt használja). A legacy `/vedettmunka` route-ok elérhetők maradnak — a nav csak
nem mutat oda.

---

### 2. Public route allowlist – layout.tsx

**Fájl:** `app/vedett-karrier/layout.tsx`
**Változás:** Eltávolítva az auth redirect és a `createClient` import.

Az auth guard **nem a layout-ban volt a helyes helyen** — a privát page-ek már mind
rendelkeztek saját `redirect()` hívással a helyes `?next=` paraméterrel. A layout-szintű
guard csak redundanciát és egy hardkódolt felülírást (`?next=/vedett-karrier/munkaprofil`)
okozott minden route esetén.

Mostantól publikusan elérhetők (auth nélkül):
- `/vedett-karrier` (új landing)
- `/vedett-karrier/lehetosegek`
- `/vedett-karrier/lehetosegek/[id]`
- `/vedett-karrier/munkakorcsaladok`
- `/vedett-karrier/munkakorcsaladok/[slug]`
- `/vedett-karrier/preferencialap/megosztas/[token]`

Privát page-ek saját guard-juk van (változatlan):
- `munkaprofil` → `/belepes?next=/vedett-karrier/munkaprofil`
- `kepessegek` → `/belepes?next=/vedett-karrier/kepessegek`
- `karrieriranytu` → `/belepes?next=/vedett-karrier/karrieriranytu`
- `preferencialap` → `/belepes?next=/vedett-karrier/preferencialap` *(javítva, ld. lent)*
- `kompatibilitas/[id]` → `/belepes?next=/vedett-karrier/kompatibilitas/<id>`
- `munkaltato` → `/belepes?next=/vedett-karrier/munkaltato`

---

### 3. Auth returnTo fix – preferencialap/page.tsx

**Fájl:** `app/vedett-karrier/preferencialap/page.tsx`, sor 33
**Változás:** `redirect('/bejelentkezes')` → `redirect('/belepes?next=/vedett-karrier/preferencialap')`

A `preferencialap` page hibásan a nem létező `/bejelentkezes` route-ra irányított.
Javítva a helyes `/belepes?next=` formátumra.

---

### 4. Safe returnTo utility – lib/vedett-karrier/returnTo.ts

**Fájl:** `lib/vedett-karrier/returnTo.ts` (ÚJ)

`sanitizeReturnTo(raw)` és `buildLoginRedirect(path)` — open redirect védelem.

Elfogad: `/vedett-karrier/*` prefixű belső relative URL-t.
Elutasít (fallback-re esik): `http://`, `https://`, `//`, `javascript:`, `data:`, `\`, üres string, `..`, nem VK prefix, >512 karakter.

Fallback: `DEFAULT_RETURN_TO = '/vedett-karrier/munkaprofil'`

---

### 5. Employer cross-link fix – munkaltato/page.tsx

**Fájl:** `app/vedett-karrier/munkaltato/page.tsx`
**Változás:** `href="/vedettmunka/munkaltato/regisztracio"` (404) → `href="/vedettmunka/munkaltatoi-regisztracio"` (helyes régi route)

Nincs új VK employer registration route → **TEMPORARY LEGACY BRIDGE** dokumentálva
kommentben a fájlban. TODO: új VK employer reg page implementálásakor cserélandő.

---

### 6. Új VK landing – app/vedett-karrier/page.tsx

**Fájl:** `app/vedett-karrier/page.tsx` (ÚJ)

Publikus landing, helyettesíti a régi `/vedettmunka` álláshirdetős UX-et a nav target
szempontjából.

Tartalom:
- Hero: "Találd meg, milyen munkában tudsz jól működni."
- Primary CTA: "Elkészítem a Munkaprofilomat" → `/vedett-karrier/munkaprofil`
- Secondary CTA: "Felfedezem a munkaköröket" → `/vedett-karrier/munkakorcsaladok`
- Tertiary CTA: "Munkáltatóként belépek" → `/vedett-karrier/munkaltato`
- Jogi disclaimer (nem munkaerő-közvetítő, nem alkalmassági vizsgálat)
- How It Works: 6 lépés (Munkaprofil → Preferencialap), linkelve a route-okra
- Aktuális lehetőségek szekció (secondary, nem primary)
- Munkáltatóknak szekció
- Nincs `/vedettmunka/*` CTA

---

### Legacy route státusz

A `/vedettmunka/*` route-ok **érintetlenül megmaradtak**. Nem törölve, nem redirectelve.
A nav többé nem mutat oda, de a közvetlen URL-en keresztül elérhetők.

---

## Tesztek

**Fájl:** `__tests__/vedett-karrier/integration-273.test.ts` (ÚJ)

28 teszt, 9 suite:
- Test #1: Header nav link → /vedett-karrier ✓
- Test #2–4: Layout nem blokkol (nincs redirect, nincs supabase import) ✓
- Test #5: Privát page-ek saját auth guard-juk van ✓
- Test #6: valid returnTo megtartva ✓
- Test #7: external URL elutasítva ✓
- Test #8: protocol-relative, javascript:, data:, backslash, üres, undefined, nem-VK path elutasítva ✓
- Test #9: landing primary CTA → Munkaprofil ✓
- Test #10: landing nem /vedettmunka route-ra irányít ✓

---

## Build gate

| Ellenőrzés | Eredmény |
|---|---|
| tsc --noEmit | **PASS** (exit 0) |
| integration-273.test.ts (28 teszt) | **28/28 PASS** |
| profile-validation.test.ts (39 teszt) | **39/39 PASS** |
| .js relative import regresszió | **CLEAN** |
| node:crypto kliens chain | **CLEAN** |
| eslint-disable no-explicit-any regresszió | **CLEAN** (.fuse_hidden temp fájlok, nem source) |
| npm run build | NOT VERIFIED – SANDBOX TIMEOUT (ismert korlát) |

---

## Nem változott

| Terület | Státusz |
|---|---|
| DB séma | NEM változott |
| Production migration | NEM futott |
| RLS | NEM változott |
| Security (CSP, rate limiter) | NEM változott |
| Sprint 1–6 üzleti logika | NEM változott |
| Legacy /vedettmunka/* route-ok | NEM változott, elérhetők |

---

## Módosított fájlok

| Fájl | Típus |
|---|---|
| `components/HeaderClient.tsx` | MÓDOSÍTOTT (1 sor) |
| `app/vedett-karrier/layout.tsx` | MÓDOSÍTOTT (auth guard eltávolítva) |
| `app/vedett-karrier/preferencialap/page.tsx` | MÓDOSÍTOTT (1 sor: helyes redirect) |
| `app/vedett-karrier/munkaltato/page.tsx` | MÓDOSÍTOTT (1 href + TODO comment) |
| `app/vedett-karrier/page.tsx` | ÚJ (landing) |
| `lib/vedett-karrier/returnTo.ts` | ÚJ (safe returnTo utility) |
| `__tests__/vedett-karrier/integration-273.test.ts` | ÚJ (28 regressziós teszt) |
| `docs/vedett-karrier/PRODUCT_INTEGRATION_AUDIT.md` | ÚJ (audit doc) |
| `docs/vedett-karrier/PRODUCT_INTEGRATION_PLAN.md` | ÚJ (plan doc) |
| `docs/vedett-karrier/JOB_BOARD_DRIFT_AUDIT.md` | ÚJ (drift audit doc) |

---

HALT — COMMIT, PUSH ÉS DEPLOY NEM TÖRTÉNT.
