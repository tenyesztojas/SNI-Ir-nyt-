# Védett Jelzés — Implementációs terv

> Kódbázis-elemzés alapján összeállítva, 2026-08-27

---

## 1. Meglévő stack összefoglalója

| Elem | Megoldás |
|---|---|
| Framework | Next.js 14 App Router, Server Components |
| Server Actions | `"use server"` + `revalidatePath` / `redirect` |
| Adatbázis | Supabase (PostgreSQL + RLS) |
| Admin bypass | `createAdminClient()` — service_role kulcs |
| Cache-kezelés | `unstable_noStore` + `router.refresh()` |
| Design | Tailwind CSS, Nunito font, brand: `sni-brand-teal` / `sni-brand-blue` / `sni-brand-navy` |
| Auth | Supabase Auth; admin check: `profile.role === "admin"` |
| Admin guard | `app/admin/layout.tsx` — redirect ha nem admin |

---

## 2. Navigáció — jelenlegi vs. tervezett

### Jelenlegi `navLinks` (HeaderClient.tsx):
```
Helyek keresése | Hely beküldése | Kedvenceim | Közösség | Programajánló | Tudásbázis ▼
```

### Tervezett navigáció:
```
Védett Helyek ▼ | Kedvenceim | Közösség | Védett Jelzés | Programajánló | Tudásbázis ▼
```

**Védett Helyek dropdown tartalma:**
- Helyek keresése (`/helyek`)
- Hely beküldése (`/uj-hely`)

**Védett Jelzés** → `/vedett-jelzes` (top-level link, nincs dropdown)

**Változások a HeaderClient.tsx-ben:**
- `navLinks` tömbből kivesszük: `Helyek keresése`, `Hely beküldése`
- Tudásbázishoz hasonló dropdown kerül be: `Védett Helyek`
- Új link: `Védett Jelzés` → `/vedett-jelzes`
- Mobil menüben ugyanez accordion-ként

---

## 3. Adatbázis — új táblák

### 3.1 `vj_signals` — digitális jelzés (felhasználónként 1 db)
```sql
CREATE TABLE vj_signals (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  display_name           text NOT NULL,
  neurodivergence_type   text NOT NULL CHECK (neurodivergence_type IN ('autizmus','adhd','autizmus_adhd')),
  support_needs          text[] DEFAULT '{}',  -- ID-k a katalógusból
  overwhelmed_mode_active boolean DEFAULT false,
  card_config            jsonb DEFAULT '{}',   -- megjelenítési beállítások
  qr_token               uuid UNIQUE DEFAULT gen_random_uuid(),
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE vj_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Saját jelzés olvasása" ON vj_signals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Saját jelzés létrehozása" ON vj_signals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Saját jelzés szerkesztése" ON vj_signals FOR UPDATE USING (auth.uid() = user_id);
-- QR token alapján publikus olvasás (csak qr_token-nel):
CREATE POLICY "QR alapú publikus olvasás" ON vj_signals FOR SELECT USING (true);
-- (A QR route server-side admin client-tel fut, így nincs biztonsági probléma)
```

### 3.2 `vj_products` — fizikai termékek (admin kezeli)
```sql
CREATE TABLE vj_products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text UNIQUE NOT NULL,  -- 'kartya' | 'jelveny' | 'nyakbako'
  name_hu      text NOT NULL,
  description_hu text,
  status       text DEFAULT 'COMING_SOON' CHECK (status IN ('COMING_SOON','AVAILABLE')),
  price_huf    integer,
  image_url    text,
  sort_order   integer DEFAULT 0
);

-- Kezdeti adatok (INSERT szükséges a migrációban):
INSERT INTO vj_products (slug, name_hu, description_hu, sort_order) VALUES
  ('kartya',   'Védett Jelzés kártya',  'Plasztikkártya méretű személyi azonosító', 1),
  ('jelveny',  'Védett Jelzés jelvény', 'Kitűző a ruhán viselhető jelzéshez',        2),
  ('nyakbako', 'Védett Jelzés nyakba akasztó', 'Nyakba akasztható azonosító', 3);
```

### 3.3 `vj_fulfillment_profiles` — szállítási adatok (felhasználónként 1 db)
```sql
CREATE TABLE vj_fulfillment_profiles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  full_name    text NOT NULL,
  email        text NOT NULL,
  phone        text,
  postal_code  text NOT NULL,
  city         text NOT NULL,
  address_line text NOT NULL,
  country      text DEFAULT 'Magyarország',
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE vj_fulfillment_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Saját szállítási profil" ON vj_fulfillment_profiles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### 3.4 `vj_waitlist_entries` — várólistára jelentkezés
```sql
CREATE TABLE vj_waitlist_entries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_slug          text REFERENCES vj_products(slug) NOT NULL,
  signal_snapshot       jsonb,  -- jelzés mentett állapota feliratkozáskor
  fulfillment_snapshot  jsonb,  -- szállítási adatok mentett állapota feliratkozáskor
  status                text DEFAULT 'pending'
                        CHECK (status IN ('pending','confirmed','shipped','cancelled')),
  admin_note            text,
  created_at            timestamptz DEFAULT now(),
  confirmed_at          timestamptz,
  shipped_at            timestamptz,
  UNIQUE(user_id, product_slug)
);

ALTER TABLE vj_waitlist_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Saját várólisták olvasása" ON vj_waitlist_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Saját várólistára feliratkozás" ON vj_waitlist_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Saját feliratkozás lemondása" ON vj_waitlist_entries FOR UPDATE USING (auth.uid() = user_id);
-- Admin minden sort lát és módosíthat (createAdminClient-tel)
```

---

## 4. Fájlstruktúra — új fájlok

```
lib/
  vedett-jelzes/
    types.ts              ← TypeScript típusok + support needs katalógus (hardcoded)
    data.ts               ← server-side data access függvények

app/
  vedett-jelzes/
    page.tsx              ← Bevezető / landing oldal (mi a Védett Jelzés?)
    actions.ts            ← server actions (upsertSignal, toggleOverwhelmed,
                             upsertFulfillmentProfile, subscribeToWaitlist,
                             cancelWaitlistEntry, adminUpdateStatus)

    sajat-jelzes/
      page.tsx            ← Saját jelzés szerkesztő (create/edit)
      SajatJelzesForm.tsx ← client form
      kijelzes/
        page.tsx          ← Teljes képernyős digitális kártya (csak bejelentkezett)

    feliratkozas/
      [termek]/
        page.tsx          ← Waitlist form (kartya | jelveny | nyakbako)
        FeliratkozasForm.tsx

    varolistaim/
      page.tsx            ← Felhasználó várólistás belépések listája

  api/
    vedett-jelzes/
      qr/
        [token]/
          route.ts        ← QR token alapján publikus kártyamegjelenítés

  admin/
    vedett-jelzes/
      page.tsx            ← Admin dashboard: KPI kártyák + terméklink lista
      [termek]/
        page.tsx          ← Termék-specifikus várólistakezelés + CSV export

public/
  vedett-jelzes-logo.png  ← ✅ már mentve
```

---

## 5. Support needs katalógus (TypeScript, hardcoded)

```typescript
export const SUPPORT_NEEDS_CATALOG = [
  // Kommunikáció
  { id: "lassu_beszelj", category: "kommunikacio", label: "Kérlek, lassan és érthetően beszélj" },
  { id: "egyszeruen_fogalmazz", category: "kommunikacio", label: "Egyszerű mondatokat használj" },
  { id: "irj_le", category: "kommunikacio", label: "Írd le nekem, ha nem értom" },
  { id: "ne_szemkontakt", category: "kommunikacio", label: "Szemkontaktus nehéz számomra" },
  { id: "valasz_ido", category: "kommunikacio", label: "Adj időt a válaszra" },
  // Érzékszervi
  { id: "csendes_ter", category: "erzekszervi", label: "Csendes helyre van szükségem" },
  { id: "teli_ter_nehez", category: "erzekszervi", label: "A teli, zajos tér nehéz számomra" },
  { id: "ne_erj", category: "erzekszervi", label: "Kérlek, ne érj hozzám" },
  { id: "erosfeny", category: "erzekszervi", label: "Az erős fény érzékeny vagyok" },
  // Segítség
  { id: "segitseg_kell", category: "segitseg", label: "Segítségre van szükségem" },
  { id: "kiserore_varok", category: "segitseg", label: "Kísérőre várok" },
  { id: "elvesztem", category: "segitseg", label: "Elvesztem / nem tudom merre menjek" },
  { id: "tul_vagyok_terhelve", category: "segitseg", label: "Túl vagyok terhelve" },
  // Egyéb
  { id: "autizmus_spektrum", category: "egyeb", label: "Autizmus spektrum zavarral élek" },
  { id: "adhd", category: "egyeb", label: "ADHD-val élek" },
];
```

---

## 6. Implementációs sorrend (fázisok)

### Fázis 1 — DB + types (1 lépés, futtatni kell Supabase-ben)
- SQL migráció: mind a 4 tábla + initial data + RLS policies

### Fázis 2 — Lib réteg
- `lib/vedett-jelzes/types.ts`
- `lib/vedett-jelzes/data.ts` (getMySignal, getProducts, getMyWaitlistEntries, adminGetWaitlistByProduct, stb.)

### Fázis 3 — Felhasználói flow
- `app/vedett-jelzes/page.tsx` (landing)
- `app/vedett-jelzes/sajat-jelzes/page.tsx` + form (create/edit signal)
- `app/vedett-jelzes/sajat-jelzes/kijelzes/page.tsx` (full screen card)
- `app/vedett-jelzes/actions.ts` (upsertSignal, toggleOverwhelmed)

### Fázis 4 — Fizikai termékek / waitlist
- `app/vedett-jelzes/feliratkozas/[termek]/page.tsx` + form
- `app/vedett-jelzes/varolistaim/page.tsx`
- actions: upsertFulfillmentProfile, subscribeToWaitlist, cancelWaitlistEntry

### Fázis 5 — Admin dashboard
- `app/admin/vedett-jelzes/page.tsx` (KPI + linkek)
- `app/admin/vedett-jelzes/[termek]/page.tsx` (lista + státusz + CSV export)
- admin actions: updateWaitlistStatus

### Fázis 6 — QR + navigáció
- `app/api/vedett-jelzes/qr/[token]/route.ts`
- Navigation: HeaderClient.tsx frissítése (Védett Helyek dropdown + Védett Jelzés link)

---

## 7. Nyitott kérdések (döntés szükséges implementáció előtt)

### K1 — QR kód célja
A fizikai kártyán lévő QR kód beolvasásakor mi jelenjen meg?
- **A opció:** Publikus, névtelen megjelenítés (mindenki látja a jelzést, aki beolvassa)
- **B opció:** Csak bejelentkezett felhasználók láthatják (login redirect)
- **C opció:** Csak a támogatási szükségletek listája jelenik meg (anonimizálva)

*Javaslat: A opció — publikus, nincs login szükséges, de névtelen megjelenítés (csak display_name + support_needs, nincs email/user_id)*

### K2 — Túlterhelődtem mód
Ez egy felhasználói toggle (pl. a kijelzés oldalon egy gomb)?
- Bekapcsolt állapotban a kártyán piros háttér / "Segítségre van szükségem" üzenet?
- Bekapcsolt állapotban ezt látja a QR-t beolvasó személy is?

*Javaslat: Igen — toggle a sajat-jelzes/kijelzes oldalon, azonnal ment Supabase-be, QR-t beolvasó is a valós státuszt látja*

### K3 — Feliratkozás COMING_SOON termékekre
Ha a termék `COMING_SOON`, a feliratkozás form elérhető, de "Értesíts, ha elérhető" gomb van rajta? Vagy a teljes feliratkozási flow (szállítási adatokkal) fut le?

*Javaslat: Teljes flow (névvel + szállítási adatokkal) fut le COMING_SOON esetén is — az admin lássa a tényleges igényt*

### K4 — Kártya konfiguráció
A spec említ "card configuration snapshot"-ot. Mit tartalmaz a `card_config` JSON mező?
- Csak a support_needs kiválasztás (ami a signal-ban már van)?
- Egyéb: háttérszín, megjelenített mezők ki/be kapcsolva?

*Javaslat: Egyszerűen: display_name + neurodivergence_type + support_needs — nincs külön color picker, a kártya design fix (kék)*

### K5 — Admin CSV exportok
**Produkciós CSV** (gyártáshoz): milyen mezők? Javaslat:
`sorszam, teljes_nev, display_name, neurodivergence_type, support_needs (vesszővel), qr_token`

**Teljesítési CSV** (csomagküldéshez): javaslat:
`sorszam, teljes_nev, email, telefon, iranyitoszam, varos, cim, termek, status, feliratkozas_datuma`

### K6 — Navigáció "Védett Helyek" dropdown
A "Hely beküldése" link neve és céloldalra utal: van `/uj-hely` route. A dropdown tartalmazza:
- Helyek keresése → `/helyek`
- Hely beküldése → `/uj-hely`
- esetleg: Védett Útvonal → `/vedett-utvonal` (ha van)?

### K7 — Bejelentkezés szükséges-e a Védett Jelzés landing oldalhoz?
- Landing (`/vedett-jelzes`) legyen publikus — mindenki látja a termékismertetőt
- Saját jelzés (`/vedett-jelzes/sajat-jelzes`) → login required

---

## 8. Admin dashboard tervezett képernyő

```
/admin/vedett-jelzes

KPI kártyák:
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Kártya          │ │ Jelvény         │ │ Nyakba akasztó  │
│ 47 feliratkozott│ │ 23 feliratkozott│ │ 12 feliratkozott│
│ [COMING_SOON ▼] │ │ [COMING_SOON ▼] │ │ [COMING_SOON ▼] │
└─────────────────┘ └─────────────────┘ └─────────────────┘

Linkek: → Kártya lista | → Jelvény lista | → Nyakba akasztó lista
```

---

## 9. Összefoglalás

| Elem | Darab |
|---|---|
| Új Supabase tábla | 4 |
| Új lib fájl | 2 |
| Új app route | ~10 |
| Módosított fájl | ~3 (HeaderClient, admin/page, admin/layout) |
| SQL migráció | 1 file |

**Becsült implementációs idő:** 4–5 munkamenet (fázisonként 1 session)

---

*Logo: `/public/vedett-jelzes-logo.png` — ✅ mentve*
