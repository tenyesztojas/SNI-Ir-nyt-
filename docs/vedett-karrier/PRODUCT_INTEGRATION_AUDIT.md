# Védett Karrier – Product Integration Audit
Dátum: 2026-09-04
Státusz: READ-ONLY – nem módosít semmiféle kódot, migrációt, DB-t

---

## 1. Sprint 1–6 VK route inventory

| Route | Sprint | Auth | Komponens |
|---|---|---|---|
| `/vedett-karrier/munkaprofil` | S1 | igen | `MunkaprofilWizard` – 51 aldimenzió, VKMM seed |
| `/vedett-karrier/kepessegek` | S2 | igen | `SkillMapClient` – user skill jelölés |
| `/vedett-karrier/karrieriranytu` | S3 | igen | `FamilyDiscoveryCard` – discovery engine |
| `/vedett-karrier/munkakorcsaladok` | S3 | **layout miatt igen** | 25 munkakörcsalád lista |
| `/vedett-karrier/munkakorcsaladok/[slug]` | S3 | **layout miatt igen** | munkakörcsalád detail |
| `/vedett-karrier/kompatibilitas/[jobRoleId]` | S5 | igen | kompatibilitás engine, auto-recompute |
| `/vedett-karrier/lehetosegek` | S6 | **layout miatt igen** | aktív lehetőségek lista |
| `/vedett-karrier/lehetosegek/[id]` | S6 | **layout miatt igen** | lehetőség detail |
| `/vedett-karrier/preferencialap` | S6 | igen | determinisztikus PDF-generáló |
| `/vedett-karrier/preferencialap/megosztas/[token]` | S6 | nem | publikus megosztott nézet |
| `/vedett-karrier/munkaltato` | S4 | igen | employer dashboard, JobRoleCard |
| `/vedett-karrier/munkaltato/munkakorok/new` | S4 | igen | új munkakör wizard |
| `/vedett-karrier/munkaltato/munkakorok/[id]` | S4 | igen | munkakör detail |
| `/vedett-karrier/munkaltato/lehetosegek/new` | S6 | igen | új lehetőség |

---

## 2. Nav audit – kritikus hiba

**Fájl:** `components/HeaderClient.tsx`, sor 40

```javascript
{ key: "vedettmunka", href: "/vedettmunka", label: "VédettKarrier" }
```

A "VédettKarrier" nav elem az **OLD rendszerre** mutat (`/vedettmunka`), nem a Sprint 1–6
architektúrára (`/vedett-karrier/*`). Ez azt jelenti, hogy minden user, aki a nav "VédettKarrier"
linkjére kattint, az elavult álláshirdetős UX-et kapja, nem az új karrierprofilos rendszert.

---

## 3. Layout auth-gate bug – publikus oldalak zárolva

**Fájl:** `app/vedett-karrier/layout.tsx`

```typescript
if (!user) {
  redirect('/belepes?next=/vedett-karrier/munkaprofil')
}
```

A layout **minden** `/vedett-karrier/*` route-ot auth-gate-el. Ezzel szemben az alábbi
page-ek szándékosan publikusak:

| Route | Page komment | Probléma |
|---|---|---|
| `/vedett-karrier/lehetosegek` | "Publikusan elérhető (anon is láthatja)" | auth-gate mögé kerül |
| `/vedett-karrier/munkakorcsaladok` | "Public (nem igényel auth)" | auth-gate mögé kerül |
| `/vedett-karrier/munkakorcsaladok/[slug]` | publikus | auth-gate mögé kerül |
| `/vedett-karrier/preferencialap/megosztas/[token]` | publikus megosztás | auth-gate mögé kerül |

**Másodlagos hiba:** a redirect mindig a `/vedett-karrier/munkaprofil`-ra küld (`next` paraméter
hardkódolt), nem az eredeti kért URL-re. Egy `/vedett-karrier/lehetosegek`-et látogató user
bejelentkezés után `/vedett-karrier/munkaprofil`-ra kerül.

---

## 4. Employer cross-link hiba

**Fájl:** `app/vedett-karrier/munkaltato/page.tsx`

```jsx
<Link href="/vedettmunka/munkaltato/regisztracio">
  Munkáltatói regisztráció
</Link>
```

Ez a link az elavult `/vedettmunka/munkaltato/regisztracio` útra mutat, ami **nem létezik**.
A valódi régi route: `/vedettmunka/munkaltatoi-regisztracio` (elválasztó nélkül).
A munkáltatói regisztrációnak az új VK rendszeren belül kellene lennie.

---

## 5. Duplikált route-ok (legacy vs. new)

| Funkció | Legacy route | Új VK route | Megjegyzés |
|---|---|---|---|
| Karrieriránytű | `/vedettmunka/karrieriranytu` | `/vedett-karrier/karrieriranytu` | Teljesen eltérő implementáció: régi = kliens-oldali quiz; új = server-side discovery engine |
| Munkaprofil | `/vedettmunka/munkaprofil` | `/vedett-karrier/munkaprofil` | Régi = egyszerű szöveges profil; új = 51-dimenziós VKMM wizard |

---

## 6. DB migrációk állapota

| Migráció | Dátum | Tartalom |
|---|---|---|
| `20260829_vedettmunka.sql` | 2026-08-29 | Legacy jobs, employers, applications |
| `20260903_vedett_karrier_foundation.sql` | 2026-09-03 | career_profiles, career_profile_dimensions |
| `20260903_vedett_karrier_sprint3.sql` | 2026-09-03 | job families, skills, interests |
| `20260903_vedett_karrier_sprint4.sql` | 2026-09-03 | employers (VK), job roles, workplaces |
| `20260903_vedett_karrier_sprint5.sql` | 2026-09-03 | compatibility_results |
| `20260903_vedett_karrier_sprint6.sql` | 2026-09-03 | job_opportunities, preference_documents |

Minden Sprint 1–6 tábla produktionban van. Legacy vedettmunka táblák szintén élnek.
**Nincs sémaütközés** a kettő között – külön névtérben kezelik az adataikat.

---

## 7. Hiányzó VK belépési pont (landing)

Nincs dedikált `/vedett-karrier` landing page. A `layout.tsx` mindenkit a munkaprofilra
irányít. A user-nek nincs "nagy képes" bemutatója az új rendszerről, hogy mit tud és
miért éri meg kitölteni a VKMM profilt.

Az `/vedettmunka` landing-jéhez (`app/vedettmunka/page.tsx`) képest az új rendszernek
nincs egyenértékű, modern belépési pontja.

---

## 8. Összefoglaló – GO / STOP verdict

| Téma | Státusz | Súlyosság |
|---|---|---|
| Nav "VédettKarrier" → `/vedettmunka` | **STOP** – javítandó | Magas: minden user rossz helyre kerül |
| Layout publikus oldalakat auth-gate-el | **STOP** – javítandó | Magas: `/lehetosegek`, `/munkakorcsaladok` nem érhető el anon |
| Layout redirect hardkódolt `?next` | **STOP** – javítandó | Közepes: rossz UX bejelentkezés után |
| Employer cross-link hibás URL | **STOP** – javítandó | Közepes: broken link (404) |
| Duplikált route-ok | FIGYELEM – nem törlendő | Alacsony: legacy fájl, marad amíg migrálva nincs |
| VK landing hiánya | FIGYELEM – implementálandó | Közepes: nincs user-facing entry point |
| DB: minden tábla éles | GO | – |
| Sprint 1–6 page-ek implementálva | GO | – |
