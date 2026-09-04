# Védett Karrier – MVP Final Audit

**Dátum:** 2026-09-03
**Auditor:** Claude (Anthropic) — red-team módban
**Scope:** Sprint 1–6, teljes VK kódbázis
**Mandátum:** "Próbáld bizonyítani, hogy a rendszer NEM release-ready."

---

## Összefoglaló ítélet

| Gate | Ítélet |
|------|--------|
| LOCAL / DEV | ✅ READY |
| CLOSED PILOT | ✅ READY (ismert korlátokkal) |
| PUBLIC PRODUCTION | ⚠️ CONDITIONAL — 2 kötelező pre-production lépés |

A rendszer **funkcionálisan és adatvédelmileg release-ready** a closed pilot szintjén. A két pre-production lépés (in-memory rate limiter kiváltása + CSP `unsafe-inline` kezelése) nem blokkolja a closed pilot indítást, de blokkolja a nyilvános produkciós élesítést.

---

## Auditált fájlok (Phase A)

### Migráció fájlok

| Fájl | Sprint | Auditált |
|------|--------|---------|
| `20260903_vedett_karrier_foundation.sql` | 1 | ✅ |
| `20260903_vedett_karrier_sprint3.sql` | 3 | ✅ |
| `20260903_vedett_karrier_sprint4.sql` | 4 | ✅ |
| `20260903_vedett_karrier_sprint5.sql` | 5 | ✅ |
| `20260903_vedett_karrier_sprint6.sql` | 6 | ✅ |

### Lib fájlok

| Fájl | Auditált |
|------|---------|
| `lib/supabase/server.ts` | ✅ |
| `lib/supabase/client.ts` | ✅ |
| `lib/vedett-karrier/opportunity/actions.ts` | ✅ |
| `lib/vedett-karrier/opportunity/data.ts` | ✅ (summary) |
| `lib/vedett-karrier/preferencialap/actions.ts` | ✅ |
| `lib/vedett-karrier/preferencialap/data.ts` | ✅ (grep) |
| `lib/vedett-karrier/preferencialap/template.ts` | ✅ (via tests) |

### App fájlok

| Fájl | Auditált |
|------|---------|
| `app/vedett-karrier/lehetosegek/[id]/page.tsx` | ✅ |
| `app/vedett-karrier/preferencialap/PreferenceDocumentViewer.tsx` | ✅ |
| `app/vedett-karrier/preferencialap/megosztas/[token]/page.tsx` | ✅ |

### Infrastruktúra

| Fájl | Auditált |
|------|---------|
| `middleware.ts` | ✅ |
| `next.config.mjs` | ✅ |

---

## Findings összesítő

### P1 – Kritikus (release-blocker)

| # | Leírás | Fájl | Státusz |
|---|--------|------|---------|
| P1-01 | XSS: `win.document.write()` unescaped user data | `PreferenceDocumentViewer.tsx` | ✅ JAVÍTVA |

### P2 – Magas (pre-production kezelendő)

| # | Leírás | Fájl | Státusz |
|---|--------|------|---------|
| P2-01 | `application_url`: `data:` / `javascript:` scheme nem blokkolva Zod-ban | `opportunity/actions.ts` | ✅ JAVÍTVA |
| P2-02 | CSP `script-src 'unsafe-inline'` — XSS védelem részleges | `next.config.mjs` | ⚠️ OPEN (Next.js korlát) |
| P2-03 | Rate limiter in-memory — serverless instanciák között nem megosztott | `middleware.ts` | ⚠️ OPEN (dokumentált) |
| P2-04 | Accessibility: ARIA hiányok (részletezés: UX_ACCESSIBILITY_REVIEW.md) | több UI fájl | ⚠️ OPEN |

### P3 – Alacsony (post-pilot)

| # | Leírás | Fájl | Státusz |
|---|--------|------|---------|
| P3-01 | Nincs DB constraint: `valid_from <= valid_until` | Sprint 6 migration | ⚠️ OPEN |
| P3-02 | Nincs cross-field Zod check: EXTERNAL_URL + null `application_url` | `opportunity/actions.ts` | ⚠️ OPEN |
| P3-03 | Print popup: böngészők popup-blokkolója megakadályozhatja | `PreferenceDocumentViewer.tsx` | ⚠️ OPEN |

---

## Kritikus invariánsok — végső állapot

| Invariáns | Bizonyíték | Teljesül |
|-----------|-----------|---------|
| service_role key NEM kliensoldalon | `server.ts` + `client.ts` csak ANON_KEY-t használ | ✅ |
| RLS minden VK táblán engedélyezve | Migration audit: minden `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` | ✅ |
| Employer NEM olvas user-private táblát | Nincs employer policy: `vk_compatibility_results`, `work_preference_documents`, `career_profile_dimensions`, `user_skills`, `career_interests` | ✅ |
| Nincs AI matching | Teljes `lib/vedett-karrier/` grep: 0 LLM hívás | ✅ |
| Nincs alkalmassági pontszám | `buildCompatibilitySummary`: csak darabszám, nincs pct/rank | ✅ |
| Nincs INTERNAL_APPLICATION | ApplicationMethod enum + RLS: csak EXTERNAL_URL / EMAIL / CONTACT_INSTRUCTIONS | ✅ |
| Preferencialap NEM AI | `template.ts` pure function, tesztelt, 26/26 pass | ✅ |
| User profiladat NEM kerül employerhez | Server action auth chain: employer action nem olvas user profilt | ✅ |
| Megosztás explicit user döntés | `shareDocument` action + `is_shared` flag | ✅ |
| NEM deployolva productionbe | Csak lokális migration fájl | ✅ |
| Legacy tábla NEM törölve | Migration audit: nincs `DROP TABLE` | ✅ |
| Legacy migration NEM módosítva | Korábbi fájlok érintetlenek | ✅ |

---

## Teszt és build eredmények

| Ellenőrzés | Eredmény |
|-----------|---------|
| `opportunity.test.ts` | 26/26 PASS |
| `tsc --noEmit` (Phase B után) | 0 hiba |
| `dangerouslySetInnerHTML` a VK kódban | 0 előfordulás |
| `NEXT_PUBLIC.*SERVICE_ROLE` grep | 0 találat |
| `javascript:` / `data:` scheme in JSX | 0 (szűrve a fix által) |

---

## Phase B javítások (elvégzett)

### P1-01 — XSS fix: `PreferenceDocumentViewer.tsx`

`escapeHtml()` helper hozzáadva, minden user-controlled string (`doc.title_hu`, `doc.generated_text_hu`, dátum) escape-elve `win.document.write()` előtt. Javítás: 2026-09-03.

### P2-01 — URL scheme fix: `opportunity/actions.ts`

`CreateOpportunitySchema.application_url` mezőhöz `.refine()` hozzáadva, amely kizárólag `http://` és `https://` protokollt enged. Javítás: 2026-09-03.

---

## Pre-production teendők (PUBLIC PRODUCTION előtt kötelező)

1. **In-memory rate limiter → Upstash Redis** (P2-03): A `middleware.ts`-ben lévő `rateLimitStore` Map serverless környezetben instanciánként független. Nyilvános produkciónál Redis-alapú csúszóablak szükséges (ajánlott: Upstash Redis ingyenes tier).

2. **CSP `unsafe-inline` kezelése** (P2-02): A jelenlegi CSP `script-src 'unsafe-inline'`-t tartalmaz, ami szükséges a Next.js inline script-jei és a Tailwind CSS-in-JS miatt. Megoldások: (a) nonce-alapú CSP Next.js middleware-rel, vagy (b) `unsafe-inline` elfogadása dokumentált korlátként. Ez utóbbi elfogadható closed pilot számára.

---

## Closed pilot feltételek

A rendszer CLOSED PILOT-ra ready, ha:
- A javított kód deployed (P1-01 + P2-01 fixekkel)
- A pilot-ban részt vevő felhasználók tájékoztatást kapnak a rendszer státuszáról
- A `valid_until < valid_from` edge-case kezelése admin-szinten ellenőrzött

---

## ⛔ ÁLLJ MEG

Az audit elvégezve. Sprint 7 NEM kezdődik automatikusan.
