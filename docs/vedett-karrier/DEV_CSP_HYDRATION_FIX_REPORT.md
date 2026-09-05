# TASK #273.3 — DEV CSP / REACT HYDRATION FIX REPORT

Dátum: 2026-09-05
Branch: local (NEM commitolva, NEM pusholva, NEM deployolva)

---

## ROOT CAUSE

A production hardening (Phase 4 / Task #250) során bevezetett nonce-alapú CSP
`middleware.ts`-ben egyetlen `buildCsp()` függvényen keresztül épül — `NODE_ENV`
ellenőrzés nélkül. Ezért local `next dev` alatt ugyanaz a strict CSP kerül
kiküldésre, mint productionben.

A Next.js 14 development runtime (webpack HMR + React Refresh) eval-alapú
kódkiértékelést használ belső bundle összeszerkesztéshez. Ha a CSP `script-src`
nem tartalmaz `'unsafe-eval'`-t, a böngésző `EvalError`-t dob, a runtime
összeomlása után a React hydration nem fejeződik be — az SSR HTML látható marad,
de event handlerek nincsenek hozzákapcsolva.

---

## CSP IMPLEMENTATION LOCATION

**Egyetlen helyszín:** `middleware.ts`

- `buildCsp(nonce, supabaseHost)` — request-enkénti CSP builder
- `middleware()` — nonce generálás, `buildCsp()` hívás, header beállítás
- `app/layout.tsx` — `x-nonce` header olvasása, átadása `<Script nonce={nonce}>` tageknek
- `next.config.mjs` — CSP **NEM** itt van; kommentben dokumentált, hogy middleware kezeli

Nincs más CSP forrás a repositoryban.

---

## PREVIOUS DEV CSP (script-src)

```
script-src 'self' 'nonce-<nonce>' 'strict-dynamic'
  https://www.google.com https://www.gstatic.com
  https://www.googletagmanager.com https://unpkg.com
```

`'unsafe-eval'` **HIÁNYZOTT** — azonos production és development CSP.

---

## NEW DEV CSP (script-src)

```
script-src 'self' 'nonce-<nonce>' 'strict-dynamic' 'unsafe-eval'
  https://www.google.com https://www.gstatic.com
  https://www.googletagmanager.com https://unpkg.com
```

`'unsafe-eval'` **JELEN VAN** — kizárólag `isDev === true` esetén.

---

## PRODUCTION CSP (script-src — változatlan)

```
script-src 'self' 'nonce-<nonce>' 'strict-dynamic'
  https://www.google.com https://www.gstatic.com
  https://www.googletagmanager.com https://unpkg.com
```

`'unsafe-eval'` **NINCS** — production security invariant változatlan.

---

## WHY NEXT DEV FAILED

A Next.js development runtime (`next/dist/compiled/@next/react-refresh-utils/dist/runtime.js`,
webpack `main-app.js`) az `eval()` JavaScript built-in-t használja modul
összeszerkesztéshez és hot module replacement-hez. A böngésző CSP policy ezt
blokkolja, ha `'unsafe-eval'` nincs engedélyezve:

```
Uncaught EvalError: Evaluating a string as JavaScript violates the following
Content Security Policy directive because 'unsafe-eval' is not an allowed
source of script.
```

Stack trace: `react-refresh-utils → webpack → main-app.js`

---

## WHY SSR HTML STILL APPEARED

A Next.js Server Component (`munkaprofil/page.tsx`) szerveren fut, CSP-től
függetlenül. Az SSR HTML elkészül és a böngészőbe kerül — a CSP csak
a böngésző oldalán érvényesül a kliens JavaScript betöltésekor. Ezért az oldal
tartalma (SubDimCard kártyák, gombok, slider-ek) vizuálisan megjelent.

---

## WHY REACT EVENTS DID NOT FIRE

A React client runtime hydration a Next.js development bundlera épül. Mivel az
eval-függő webpack bundle betöltése meghiúsult, a React soha nem csatolta
a event handlereket a SSR DOM-hoz. Ennek következtében:

- `onClick`, `onChange` — nem regisztrálva
- `[VK-DBG]` logok — nem jelennek meg
- `setSubStates` — soha nem hívódik
- `hasDirty` — örökre `false`
- Mentés gomb — örökre `disabled`

---

## MODIFIED FILES

| Fájl | Változás |
|------|---------|
| `middleware.ts` | `buildCsp(nonce, supabaseHost)` → `buildCsp(nonce, supabaseHost, isDev: boolean)` |
| `middleware.ts` | `isDev = process.env.NODE_ENV === "development"` feltétel + `buildCsp()` hívásnak átadva |
| `middleware.ts` | `script-src` development ágban: `'unsafe-eval'` hozzáadva |
| `__tests__/vedett-karrier/csp-273-3.test.ts` | **ÚJ** — 13 CSP regression teszt (7 describe) |

**NEM módosult:**
- Production CSP policy
- Nonce generálás
- `strict-dynamic`
- Host allowlist
- Rate limiter
- Auth guards
- RLS
- VKMM

---

## SECURITY INVARIANTS

| Invariant | Állapot |
|-----------|---------|
| production `script-src` NEM tartalmaz `'unsafe-eval'`-t | ✅ PASS |
| production `script-src` NEM tartalmaz általános `'unsafe-inline'`-t | ✅ PASS |
| production nonce-alapú script kezelés megmaradt | ✅ PASS |
| production `'strict-dynamic'` megmaradt | ✅ PASS |
| production host allowlist megmaradt | ✅ PASS |
| `'unsafe-eval'` kizárólag `NODE_ENV=development` esetén aktív | ✅ PASS |

---

## #273.2B DEBUG RESULT — BEFORE FIX

```
[VK-DBG] CATEGORICAL_PREFERRED_CLICK  → NEM JELENT MEG
[VK-DBG] IMPORTANCE_CHANGE             → NEM JELENT MEG
[VK-DBG] SUBDIM_VALUE_CHANGE           → NEM JELENT MEG
[VK-DBG] SUBDIM_IMPORTANCE_CHANGE      → NEM JELENT MEG
[VK-DBG] WIZARD_STATE_CHANGE           → NEM JELENT MEG

Console EvalError: 'unsafe-eval' CSP violation  → MEGJELENT
```

**Következtetés:** React event handlerek nem regisztrálódtak. CSP blokkolt minden kliensoldali interakciót.

---

## #273.2B DEBUG RESULT — AFTER FIX

Manuális böngészős teszt még nem történt meg.
A `[VK-DBG]` logok **BENT MARADNAK** a manuális ellenőrzés idejére.

Elvárt eredmény a CSP fix után:
```
[VK-DBG] IMPORTANCE_CHANGE env_noise high
[VK-DBG] SUBDIM_IMPORTANCE_CHANGE env_noise high
[VK-DBG] WIZARD_STATE_CHANGE env_noise dirty=true hasDirty(after)=true
```

---

## MUNKAPROFIL MANUAL RESULT

**PENDING** — manuális böngészős ellenőrzés szükséges.

Ellenőrzőlista (lásd masterprompt 16–17. szakasz):
- [ ] Ordinal slider-ek mozognak
- [ ] Importance opciók válthatók (kártyánként külön, #273.2 fix)
- [ ] Categorical Preferált/OK kattintható
- [ ] Nem tudom checkbox működik
- [ ] Textarea írható
- [ ] Mentés aktiválódik dirty state után
- [ ] Következő átvisz következő dimenzióra
- [ ] State megmarad visszalépés után
- [ ] Legalább Dimension 1–3 alatt tesztelve

---

## AUTH REGRESSION

| Tesztfájl | PASS |
|-----------|------|
| `auth-273-1.test.ts` (33 teszt) | ✅ 33/33 |
| `integration-273.test.ts` (28 teszt) | ✅ 28/28 |

---

## MUNKAPROFIL REGRESSION

| Tesztfájl | PASS |
|-----------|------|
| `munkaprofil-interaction-273-2.test.ts` (24 teszt) | ✅ 24/24 |

A #273.2 radio-name fix regresszió: **NINCS**.

---

## CSP TEST RESULTS

| Teszt | Leírás | Eredmény |
|-------|--------|----------|
| #1a | dev CSP tartalmaz `'unsafe-eval'`-t | ✅ PASS |
| #1b | dev `'unsafe-eval'` a script-src direktívában van | ✅ PASS |
| #2 | prod CSP NEM tartalmaz `'unsafe-eval'`-t | ✅ PASS |
| #3 | prod script-src NEM tartalmaz `'unsafe-inline'`-t | ✅ PASS |
| #4a | prod CSP nonce megmarad | ✅ PASS |
| #4b | prod nonce a script-src-ben van | ✅ PASS |
| #5 | prod `'strict-dynamic'` megmarad | ✅ PASS |
| #6a–d | prod host allowlist (4 host) megmarad | ✅ 4/4 PASS |
| #7a | middleware.ts isDev paramétert használ | ✅ PASS |
| #7b | middleware.ts NODE_ENV development feltételt tartalmaz | ✅ PASS |
| #7c | production buildCsp nem tartalmaz `'unsafe-eval'`-t | ✅ PASS |
| #7d | `'unsafe-eval'` csak isDev feltétel alatt | ✅ PASS |

**CSP tesztek összesen: 13/13 PASS**

---

## TOTAL TEST RESULTS

```
# tests  398
# suites  93
# pass    398
# fail      0
# duration_ms  13841
```

**398/398 PASS**

---

## TSC

```
npx tsc --noEmit → (no output — 0 error)
```

---

## BUILD

```
BUILD: SANDBOX TIMEOUT — MANUAL LOCAL BUILD REQUIRED
```

A sandbox 120s timeout alatt nem fejezte be a build folyamatot. Ez nem egy kódhiba — a sandbox erőforráskorlátja. A tsc 0 hibával zárult, 398/398 teszt PASS. Lokálisan `npm run build` szükséges a végleges megerősítéshez.

---

## PRODUCTION CSP STATIC AUDIT

| Ellenőrzés | Állapot |
|-----------|---------|
| `'unsafe-eval'` ABSENT | ✅ |
| `'unsafe-inline'` nem általánosan visszaengedve | ✅ |
| Nonce PRESENT | ✅ |
| `'strict-dynamic'` PRESENT | ✅ |
| Jóváhagyott script host-ok megmaradtak | ✅ |

---

## TASK #273.3 — GO FOR MANUAL REVIEW

A kódoldali fix és az automatikus ellenőrzések rendben vannak.
A manuális böngészős teszt elvégzése szükséges:

```
1. Ctrl+C (dev server leállítása)
2. npm run dev
3. Chrome: Ctrl+Shift+R (hard reload)
4. http://localhost:3000/vedett-karrier/munkaprofil
5. DevTools → Console → szűrj [VK-DBG]-re
6. Ellenőrizd: nincs EvalError
7. Kattints egy Importance opcióra → várd a [VK-DBG] log-okat
8. Végezd el a 16–17. szakasz ellenőrzőlistáját
```

COMMIT, PUSH ÉS DEPLOY NEM TÖRTÉNT.
