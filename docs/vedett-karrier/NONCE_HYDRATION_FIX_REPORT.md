# TASK #273.4 — NONCE HYDRATION FIX REPORT

Dátum: 2026-09-05
Branch: local (NEM commitolva, NEM pusholva, NEM deployolva)

---

## ROOT CAUSE

**Browser nonce hiding (nonce cloaking)** — W3C Content Security Policy Level 3 specifikáció
szerinti böngészőviselkedés.

### Mechanizmus

1. A middleware `x-nonce` request headerben továbbítja a nonce értéket a layout-nak.
2. A `RootLayout` szerver renderelésekor `headers().get("x-nonce")` visszaadja a nonce-ot.
3. A layout a nonce-ot átadja a `<head>` `<script dangerouslySetInnerHTML>` elemeknek.
4. A server-oldali HTML tartalmazza: `<script nonce="abc123" ...>`.
5. **A böngésző fogadja az oldalt, olvassa a nonce-ot a CSP ellenőrzéshez (ez helyes),
   majd az attribútumot üres stringre állítja (`nonce=""`) a DOM-ban.**
   — Cél: megakadályozni, hogy CSS `[nonce=...]` attribute selectorok kiszivárogtatják a nonce értéket.
6. React hydration beolvassa a DOM-t: `nonce=""`.
7. Az RSC payload (server render output) `nonce="abc123"` értéket tartalmaz.
8. React mismatch warningot dob:

```
Warning: Prop `nonce` did not match.
Server: ""
Client: "<generated nonce>"
Stack: script > head > html > RootLayout
```

_(React terminológiában: "Server" = DOM-ból olvasott érték; "Client" = RSC payloadból várt érték)_

### Miért csak a `<head>` natív `<script>` elemeket érinti?

A Next.js `<Script strategy="afterInteractive">` komponensek a React fán kívül,
effekteken keresztül injektálódnak — React nem próbálja meg őket a DOM-ban hydratálni,
ezért ott nem keletkezik mismatch.

A két érintett elem:
- Service Worker regisztrációs script
- Accessibility anti-flash script

---

## NONCE FLOW — BEFORE

```
middleware.ts:
  crypto.randomUUID() → base64 → nonce
  x-nonce request header: nonce
  Content-Security-Policy header: script-src 'nonce-<nonce>' ...

layout.tsx (SSR):
  headers().get("x-nonce") → nonce
  <script nonce={nonce} dangerouslySetInnerHTML> → HTML: nonce="abc123"

Browser:
  DOM nonce attribute → "" (browser hides it)

React hydration:
  DOM: nonce=""
  RSC: nonce="abc123"
  → WARNING: Prop `nonce` did not match
```

---

## NONCE FLOW — AFTER

```
middleware.ts:
  (változatlan)

layout.tsx (SSR):
  headers().get("x-nonce") → nonce
  <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML>
                         ↑
                         React nem ellenőrzi az attribútum egyezést ezen az elemen

Browser:
  DOM nonce attribute → "" (böngésző elrejti — ez nem változik)

React hydration:
  suppressHydrationWarning → mismatch warning elmarad
  CSP: a nonce ELŐTTE érvényesül (böngésző az attribute elrejtés ELŐTT olvassa)
  → NO WARNING
```

---

## MODIFIED FILES

| Fájl | Változás |
|------|---------|
| `app/layout.tsx` | 2 db `<script dangerouslySetInnerHTML>` elemhez `suppressHydrationWarning` prop hozzáadva |
| `__tests__/vedett-karrier/csp-273-3.test.ts` | 4 új nonce regression teszt (#273.4) |

**NEM módosult:**
- `middleware.ts` nonce generálás
- CSP policy (sem dev, sem prod)
- `'unsafe-eval'` dev engedélyezés (#273.3)
- Auth guards
- RLS
- Bármi más

---

## DEV CSP (változatlan #273.3 óta)

```
script-src 'self' 'nonce-<nonce>' 'strict-dynamic' 'unsafe-eval'
  https://www.google.com https://www.gstatic.com
  https://www.googletagmanager.com https://unpkg.com
```

---

## PRODUCTION CSP (változatlan)

```
script-src 'self' 'nonce-<nonce>' 'strict-dynamic'
  https://www.google.com https://www.gstatic.com
  https://www.googletagmanager.com https://unpkg.com
```

`'unsafe-eval'` — NINCS.

---

## SECURITY INVARIANTS

| Invariant | Állapot |
|-----------|---------|
| Nonce requestenként generálódik middleware-ben | ✅ VÁLTOZATLAN |
| Nonce bekerül a CSP headerbe | ✅ VÁLTOZATLAN |
| Nonce átadódik a layout-nak x-nonce headeren | ✅ VÁLTOZATLAN |
| Nonce jelen van a `<script>` tagokon (SSR HTML-ben) | ✅ VÁLTOZATLAN |
| A böngésző a CSP-t a nonce-on keresztül érvényesíti | ✅ VÁLTOZATLAN |
| `suppressHydrationWarning` NEM távolítja el a nonce-ot | ✅ IGEN — csak a React warning-ot suppressálja |
| production `'unsafe-eval'` ABSENT | ✅ VÁLTOZATLAN |
| production `'unsafe-inline'` (script-src) ABSENT | ✅ VÁLTOZATLAN |
| production `'strict-dynamic'` PRESENT | ✅ VÁLTOZATLAN |

---

## TESTS

| Teszt | Leírás | Eredmény |
|-------|--------|----------|
| layout #7a | SW script tartalmaz suppressHydrationWarning-t | ✅ PASS |
| layout #7b | A11y script tartalmaz suppressHydrationWarning-t | ✅ PASS |
| layout #7c | ≥2 suppressHydrationWarning előfordulás | ✅ PASS |
| layout #7d | nonce prop megmarad a script elemeken | ✅ PASS |
| layout #7e | layout.tsx x-nonce headert olvas | ✅ PASS |
| CSP #1–6 | #273.3 CSP tesztek regressziója | ✅ 13/13 PASS |
| CSP #8 | middleware.ts statikus audit | ✅ 4/4 PASS |

**CSP+Nonce tesztek összesen: 19/19 PASS**

---

## TOTAL TEST RESULTS

```
# tests  402
# suites  94
# pass    402
# fail      0
# duration_ms  7534
```

**402/402 PASS**

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

---

## MANUAL RETEST STATUS

**PENDING** — manuális böngészős ellenőrzés szükséges.

Retest protokoll:
```
1. Ctrl+C
2. npm run dev
3. Ctrl+Shift+R
4. http://localhost:3000/vedett-karrier/munkaprofil
5. DevTools Console
```

Kötelező (a fix után NEM jelenhet meg):
```
Warning: Prop `nonce` did not match.
Server: ""
Client: "<generated nonce>"
```

```
Uncaught EvalError: unsafe-eval CSP violation
```

A `[VK-DBG]` debug logok **BENT MARADNAK** a manuális PASS-ig.

---

## TASK #273.4 — GO FOR FINAL REVIEW

A kódoldali fix és az automatikus ellenőrzések (402/402, tsc 0 hiba) rendben vannak.

Manuális retest és [VK-DBG] cleanup szükséges:

```
Ha Console-ban nincs:
  - Prop `nonce` did not match warning
  - unsafe-eval EvalError

ÉS a [VK-DBG] logok megjelennek kattintásra
ÉS a Munkaprofil interaktív (slider, importance, categorical, save, next)

→ [VK-DBG] logok eltávolíthatók
→ tsc + 402 teszt újra
→ npm run build (lokálisan)
→ TASK #273.3 + #273.4 — PASS
```

COMMIT, PUSH ÉS DEPLOY NEM TÖRTÉNT.
