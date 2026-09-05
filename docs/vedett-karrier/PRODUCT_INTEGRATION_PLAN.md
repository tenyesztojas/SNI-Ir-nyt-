# Védett Karrier – Product Integration Plan
Dátum: 2026-09-04
Előfeltétel: PRODUCT_INTEGRATION_AUDIT.md elolvasva
Sorrend: audit → plan → implementáció (ez a plan fázis)

---

## Implementációs sorrend

### Lépés 1 – Nav javítás (HeaderClient.tsx)

**Fájl:** `components/HeaderClient.tsx`, sor 40
**Változtatás:**
```typescript
// ELŐTTE:
{ key: "vedettmunka", href: "/vedettmunka", label: "VédettKarrier" }

// UTÁNA:
{ key: "vedettmunka", href: "/vedett-karrier", label: "VédettKarrier" }
```

**Megjegyzés:** A `key: "vedettmunka"` maradhat (a nav highlight logika erre épül);
csak a `href` és végül a landing változik. Ha a `/vedett-karrier` landing még nincs
kész (Lépés 4), akkor ideiglenesen `/vedett-karrier/lehetosegek` a target.

**Kockázat:** Alacsony. A nav csak az href-et változtatja, az UI nem módosul.

---

### Lépés 2 – Layout auth-gate szétválasztása

**Fájl:** `app/vedett-karrier/layout.tsx`

Az auth check **maradjon** a layout-ban, de a publikus oldalak ki kell kerüljenek a
layout hatóköréből. Next.js App Router-ban erre a route group pattern a helyes megközelítés.

**Konkrét lépések:**

1. Hozd létre az `app/vedett-karrier/(auth)/` route group-ot.
2. Mozgasd az auth-szükséges page-eket ide:
   - `munkaprofil/`
   - `kepessegek/`
   - `karrieriranytu/`
   - `kompatibilitas/`
   - `preferencialap/`
   - `munkaltato/`
3. Az auth layout (`layout.tsx` a jelenlegi) kerüljön az `(auth)/` group-ba.
4. A publikus page-ek maradjanak `app/vedett-karrier/` alatt, layout nélkül (vagy egy publikus layouttal):
   - `lehetosegek/`
   - `munkakorcsaladok/`
5. A `preferencialap/megosztas/[token]/` már most is kívül lehet, ez is maradhat publikus.

**Layout redirect fix:** A `redirect` sorban a `?next=` értéke legyen dinamikus:
```typescript
// Ne: redirect('/belepes?next=/vedett-karrier/munkaprofil')
// Helyette: ezt a logikát a middleware vagy page-szintű guard kezeli
```
Mivel a layout-ban nem érhető el a jelenlegi URL path szerver-oldalon közvetlenül,
a megoldás: az auth-szükséges page-ek saját `redirect` hívást kapnak (mint ahogy
a `munkaprofil/page.tsx` és `munkaltato/page.tsx` már most is csinálja), és a layout
guard törlődik, hogy ne duplikáljon.

**Kockázat:** Közepes. Route group létrehozása fájlmozgatással jár; URL-ek nem változnak
(route group neve zárójelek között van, nem kerül az URL-be).

---

### Lépés 3 – Employer cross-link javítás

**Fájl:** `app/vedett-karrier/munkaltato/page.tsx`

```typescript
// ELŐTTE (hibás – nem létező URL):
href="/vedettmunka/munkaltato/regisztracio"

// UTÁNA (a meglévő régi route):
href="/vedettmunka/munkaltatoi-regisztracio"
```

**Hosszú távon:** A munkáltatói regisztrációt át kell helyezni az új VK rendszerre
(`/vedett-karrier/munkaltato/regisztracio`). Ez önálló task (Lépés 5).

**Kockázat:** Alacsony. String csere egy `href`-ben.

---

### Lépés 4 – VK Landing page létrehozása

**Fájl (új):** `app/vedett-karrier/page.tsx`

A landing célja: a user megértse, mi az új VK rendszer, és el tudjon indulni.

**Tartalom:**
- Hero: mi a Védett Karrier (nem álláshirdetős, hanem karrierprofilos rendszer)
- CTA user-nek: "Munkaprofilom kitöltése" → `/vedett-karrier/munkaprofil`
- CTA user-nek: "Álláslehetőségek böngészése" → `/vedett-karrier/lehetosegek`
- CTA user-nek: "Munkakörcsaládok felfedezése" → `/vedett-karrier/munkakorcsaladok`
- CTA employer-nek: "Munkáltatói felület" → `/vedett-karrier/munkaltato`
- Jogi disclaimer (másolja a `/vedettmunka` page stílusát – VédettSarok nem munkaerő-közvetítő)

**Auth:** A landing legyen publikus (nincs auth guard). Bejelentkezett user esetén
mutatható a saját completion_pct ha elérhető.

**Kockázat:** Alacsony. Új file, nem módosít meglévőt.

---

### Lépés 5 – Munkáltatói regisztráció VK-ra migrálja (opcionális, later)

Ha a régi `/vedettmunka/munkaltatoi-regisztracio` munkáltatói regisztrációs logikát
fel kell váltani, egy új `/vedett-karrier/munkaltato/regisztracio` page szükséges,
ami az új VK employer adatmodellt (Sprint 4) használja.

**Feltétel:** Csak akkor, ha a régi regisztrációs form valóban a régi `vedettmunka`
employer táblába ír, és az nem kompatibilis az új `vk_employers` táblával.
Előbb ellenőrizni kell a `getMyEmployer()` lib/vedettmunka/data.ts implementációját.

**Kockázat:** Közepes-magas. Adatmodell-kompatibilitás ellenőrzés szükséges.

---

## Implementációs sorrend összefoglalója

| # | Lépés | Fájl(ok) | Kockázat | Blokkolja |
|---|---|---|---|---|
| 1 | Nav javítás | `HeaderClient.tsx:40` | Alacsony | – |
| 2 | Layout route group split | `app/vedett-karrier/` struktúra | Közepes | – |
| 3 | Employer cross-link fix | `munkaltato/page.tsx` | Alacsony | – |
| 4 | VK Landing page | `app/vedett-karrier/page.tsx` | Alacsony | 1 |
| 5 | Munkáltatói reg migráció | új page + lib | Közepes-magas | 3 |

Lépés 1, 3 elvégezhető egyszerre. Lépés 2 önálló, nem blokkolja a többit.
Lépés 4 logikailag az 1 után jön (nav már az új landingre mutat).

---

## Mi NEM változik ebben a sprintben

- Legacy `/vedettmunka/*` route-ok: érintetlenek maradnak
- Legacy DB táblák: érintetlenek
- Sprint 1–6 üzleti logika: nem módosul
- Production migráció: NEM fut
- RLS: nem változik
