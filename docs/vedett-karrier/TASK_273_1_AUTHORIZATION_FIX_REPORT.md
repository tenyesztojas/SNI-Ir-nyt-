# TASK #273.1 — AUTHORIZATION FIX REPORT

Dátum: 2026-09-05
Branch: local (NEM commitolva, NEM pusholva, NEM deployolva)

---

## Modified Files

| Fájl | Változás |
|------|---------|
| `app/vedett-karrier/munkaltato/munkakorok/new/page.tsx` | `'use client'` → Server Component; getUser + employer + approved guard |
| `app/vedett-karrier/munkaltato/munkakorok/new/NewJobRoleClient.tsx` | **ÚJ** — kliensoldali form extrahálva |
| `app/vedett-karrier/munkaltato/lehetosegek/new/page.tsx` | `redirect('/bejelentkezes')` → `buildLoginRedirect(path+jobRoleId)` |
| `app/vedett-karrier/munkaltato/lehetosegek/[id]/page.tsx` | `redirect('/bejelentkezes')` → `buildLoginRedirect('/vedett-karrier/munkaltato/lehetosegek/'+params.id)` |
| `app/vedett-karrier/lehetosegek/[id]/page.tsx` | anon CTA `href="/bejelentkezes"` → `href="/belepes"` |
| `app/vedett-karrier/kepessegek/page.tsx` | stale comment javítva |
| `app/vedett-karrier/karrieriranytu/page.tsx` | stale comment javítva |
| `__tests__/vedett-karrier/auth-273-1.test.ts` | **ÚJ** — 33 db regressziós teszt (14 test-csoport) |

---

## Blocker Status

| # | Blocker | Státusz |
|---|---------|---------|
| 1 | `munkakorok/new` — `'use client'` oldal, nincs server-side auth | **FIXED** |
| 2 | `lehetosegek/new` — `redirect('/bejelentkezes')` (404), jobRoleId elvész | **FIXED** |
| 3 | `lehetosegek/[id]` (employer) — `redirect('/bejelentkezes')` (404) | **FIXED** |

| # | Minor | Státusz |
|---|-------|---------|
| A | `lehetosegek/[id]` (public) anon CTA `href="/bejelentkezes"` | **FIXED** |
| B | `kepessegek` + `karrieriranytu` stale comment ("auth guard via layout.tsx") | **FIXED** |

---

## Authorization Re-Audit

### Layout

| Fájl | Auth guard | Státusz |
|------|-----------|---------|
| `app/vedett-karrier/layout.tsx` | Nincs — passthrough Server Component | ✅ PASS |

### Publikus route-ok (auth nélkül elérhetők)

| Route | Guard helye | Autentikáció | PASS/FAIL |
|-------|------------|-------------|-----------|
| `/vedett-karrier` | — | Nincs redirect; page.tsx statikus | ✅ PASS |
| `/vedett-karrier/lehetosegek` | — | Nincs redirect | ✅ PASS |
| `/vedett-karrier/lehetosegek/[id]` | — | Nincs redirect; user opcionálisan lekérve CTA-hoz | ✅ PASS |
| `/vedett-karrier/munkakorcsaladok` | — | Nincs redirect | ✅ PASS |
| `/vedett-karrier/munkakorcsaladok/[slug]` | — | Nincs redirect | ✅ PASS |
| `/vedett-karrier/munkaltato/munkakorok/[id]` | page.tsx | active → publikus; draft → ownership check | ✅ PASS |
| `/vedett-karrier/preferencialap/megosztas/[token]` | — | Token-alapú, nincs user auth | ✅ PASS |

### Privát route-ok (user auth szükséges)

| Route | Guard helye | getUser() | redirect target | PASS/FAIL |
|-------|------------|-----------|----------------|-----------|
| `/vedett-karrier/munkaprofil` | page.tsx | ✅ | `/belepes?next=…` | ✅ PASS |
| `/vedett-karrier/kepessegek` | page.tsx | ✅ | `/belepes?next=…` | ✅ PASS |
| `/vedett-karrier/karrieriranytu` | page.tsx | ✅ | `/belepes?next=…` | ✅ PASS |
| `/vedett-karrier/preferencialap` | page.tsx | ✅ | `/belepes?next=…` | ✅ PASS |
| `/vedett-karrier/kompatibilitas/[jobRoleId]` | page.tsx | ✅ | `/belepes?next=…` | ✅ PASS |

### Employer route-ok (user auth + employer record + approved guard)

| Route | Guard helye | getUser | getEmployerByUserId | isEmployerApproved | IDOR védelem | redirect anon | PASS/FAIL |
|-------|------------|---------|--------------------|--------------------|-------------|--------------|-----------|
| `/vedett-karrier/munkaltato` | page.tsx | ✅ | ✅ | ✅ | — | `/belepes?next=…` | ✅ PASS |
| `/vedett-karrier/munkaltato/munkakorok/new` | page.tsx | ✅ | ✅ | ✅ | — | `/belepes?next=/vedett-karrier/munkaltato/munkakorok/new` | ✅ PASS (**WAS BLOCKER 1**) |
| `/vedett-karrier/munkaltato/munkakorok/[id]/szerkesztes` | page.tsx | ✅ | ✅ | ✅ | `getJobRoleByIdForEmployer` | `/belepes?next=…` | ✅ PASS |
| `/vedett-karrier/munkaltato/lehetosegek/new` | page.tsx | ✅ | ✅ | ✅ | — | `buildLoginRedirect(path+jobRoleId)` | ✅ PASS (**WAS BLOCKER 2**) |
| `/vedett-karrier/munkaltato/lehetosegek/[id]` | page.tsx | ✅ | ✅ | — | `getOpportunityByIdForEmployer` | `buildLoginRedirect('/…/'+params.id)` | ✅ PASS (**WAS BLOCKER 3**) |

**Authorization re-audit: TASK #273.1 AUTH REVIEW — PASS**

---

## Test Results

```
Futtatás: node --experimental-strip-types __tests__/vedett-karrier/auth-273-1.test.ts

# tests 33
# suites 12
# pass  33
# fail   0
```

Lefedett invariánsok:
1. `munkakorok/new` nem `'use client'`, importál `createClient`, tartalmaz `getUser()` és `redirect()`
2. `munkakorok/new` redirect target: `/belepes` + `/vedett-karrier/munkaltato/munkakorok/new` next param
3. `/bejelentkezes` redirect eltávolítva mindhárom blocker-fájlból
4. `getEmployerByUserId` + `isEmployerApproved` megtartva
5. `NewJobRoleClient.tsx` tartalmazza a `createJobRole` + `useState` form logikát
6–7. `lehetosegek/new` + `lehetosegek/[id]` `buildLoginRedirect` hívást tartalmaz
8. IDOR védelem: `getOpportunityByIdForEmployer` + `getJobRoleByIdForEmployer` megmaradt
9–10. `munkakorok/[id]` publikus/draft ownership check megtartva
11–12. Publikus oldalak (lehetosegek, munkakorcsaladok, layout) nem tartalmaznak redirect importot
13–14. `sanitizeReturnTo`: external URL + protocol-relative tiltott; valid VK path-ok engedve

---

## TypeScript Check

```
npx tsc --noEmit

(no output — 0 error)
```

---

## Scope Control

Ebben a taskban a következők NEM történtek meg:
- DB migration
- RLS módosítás
- Legacy route törlés (`/vedettmunka/*` érintetlen)
- Landing redesign folytatása
- Dashboard redesign
- Career Discovery módosítása
- Compatibility Engine módosítása
- VKMM módosítása
- Sprint 7 funkció
- Commit / push / deploy

---

## TASK #273.1 — GO FOR REVIEW

COMMIT, PUSH ÉS DEPLOY NEM TÖRTÉNT.
