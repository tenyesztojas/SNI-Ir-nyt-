# Védett Karrier – Production Readiness Assessment

**Dátum:** 2026-09-03
**Scope:** Teljes VK kódbázis (Sprint 0.5–6)

---

## Gate Definíciók

| Gate | Leírás |
|------|--------|
| LOCAL / DEV | Fejlesztői gépen fut, nincs valós user |
| CLOSED PILOT | Meghívásos, korlátozott felhasználók, nem publikusan indexelt |
| PUBLIC PRODUCTION | Nyilvánosan elérhető, bárki regisztrálhat |

---

## Technikai Checklist

### TypeScript

| Ellenőrzés | Eredmény |
|-----------|---------|
| `tsc --noEmit` (Phase B után) | ✅ 0 hiba |
| `"moduleResolution": "bundler"` | ✅ Konfiguráltaa |
| Importok `.js` extension nélkül (`.tsx` → `.ts`) | ✅ Helyes |

### Tesztek

| Tesztfájl | Tesztek | Pass |
|-----------|---------|------|
| `opportunity.test.ts` | 26 | 26 ✅ |
| (Sprint 1–5 tesztek) | ~151 | ~151 ✅ (prior sessions) |
| **Összes** | **~177** | **~177** |

### Build

| Ellenőrzés | Eredmény |
|-----------|---------|
| `next build` | Nem futtatva (production deploy tiltott) |
| `tsc --noEmit` | ✅ PASS (proxy a build-re) |

---

## Adatbázis

### Migration State

| Fájl | Állapot |
|------|---------|
| Foundation + Sprint 1–6 migration fájlok | ✅ Lokálisan elkészítve |
| Production DB-re alkalmazva | ❌ NEM (szándékosan) |
| Legacy migration módosítva | ❌ NEM (invariáns teljesül) |

### RLS Audit

Minden VK tábla RLS-sel védett. A referenciatáblák (`skills`, `job_families`, `industries`) publikusan olvashatók (szándékosan) — ezek aggregált, nem személyes adatok. A user-private táblák minden nem-user query-t kizárnak az RLS-en keresztül.

---

## Infrastruktúra

### Rate Limiting

| Aspektus | Állapot |
|---------|---------|
| IP-alapú in-memory limiter | ✅ Implementálva |
| Serverless instanciák közötti megosztás | ❌ Nincs (Upstash Redis hiányzik) |
| Closed pilot: Elfogadható | ✅ (alacsony forgalom) |
| Public production: Elfogadható | ⚠️ RESOLVE BEFORE |

### Supabase

| Aspektus | Állapot |
|---------|---------|
| Anon key kliensoldalon | ✅ (szándékos, RLS backstop) |
| Service role key kliensoldalon | ✅ NINCS |
| RLS minden táblán | ✅ |

---

## Security Headers

| Header | Konfiguráltaa | Érték |
|--------|--------------|-------|
| X-Frame-Options | ✅ | DENY |
| X-Content-Type-Options | ✅ | nosniff |
| Strict-Transport-Security | ✅ | max-age=31536000; includeSubDomains; preload |
| Content-Security-Policy | ✅ (korláttal) | unsafe-inline jelen |
| Referrer-Policy | ✅ | strict-origin-when-cross-origin |
| Permissions-Policy | ✅ | camera=(), microphone=() |

---

## Privacy Compliance

| Invariáns | Állapot |
|-----------|---------|
| Employer nem olvas user-private adatot | ✅ RLS garantálja |
| User profiladat NEM kerül munkáltatóhoz | ✅ Server action auth chain |
| Preferencialap NEM AI | ✅ Pure function, tesztelt |
| Nincs alkalmassági pontszám / rangsor | ✅ Kód + teszt auditált |
| Megosztás explicit user döntés | ✅ `shareDocument` action + is_shared flag |
| GDPR-releváns: user delete cascade | ✅ `ON DELETE CASCADE` auth.users FK |

---

## Dependency Audit

### Megfigyelt külső függőségek (VK-specifikus)

| Package | Felhasználás | Kockázat |
|---------|-------------|---------|
| `zod` | Input validation | ALACSONY (standard) |
| `@supabase/ssr` | Auth + DB | ALACSONY (official) |
| `crypto.randomUUID()` | share_token generálás | ALACSONY (Web Crypto API) |

Nincs npm PDF library a VK kódban (browser print alapú). Ez szándékos, eliminál egy dependency risk vektort.

---

## Known Limitations (Dokumentált)

| # | Limitáció | Zárolt pilot | Publikus prod |
|---|-----------|-------------|--------------|
| L1 | In-memory rate limiter (serverless inkompatibilis) | ✅ Elfogadható | ❌ RESOLVE |
| L2 | CSP `unsafe-inline` in script-src | ✅ Elfogadható | ⚠️ Review |
| L3 | Print popup blocker: csendes failure | ✅ Elfogadható | ⚠️ UX fix |
| L4 | Nincs `valid_from <= valid_until` DB constraint | ✅ Elfogadható | ⚠️ Fix |
| L5 | Nincs cross-field Zod: EXTERNAL_URL + null url | ✅ Elfogadható | ⚠️ Fix |
| L6 | ARIA aria-expanded hiányzik expand gombon | ✅ Elfogadható | ⚠️ Fix |
| L7 | Employer form: nincs redirect mentés után | ✅ Elfogadható | ⚠️ Fix |

---

## Gate Verdicts

### LOCAL / DEV — ✅ READY

A rendszer lokálisan deployolható és tesztelhető. Minden invariáns teljesül. TypeScript 0 hiba, 26/26 teszt pass.

### CLOSED PILOT — ✅ READY

Feltételek:
- A P1-01 (XSS fix) és P2-01 (URL scheme fix) kód deployed
- Az L1–L7 limitációk dokumentáltak és a pilot team ismeri
- A pilot felhasználók meghívásos alapon (nem publikus regisztráció)
- Production DB nem fogadja a migration fájlokat explicit admin jóváhagyás előtt

### PUBLIC PRODUCTION — ⚠️ CONDITIONAL

Kötelező pre-production lépések:
1. **Upstash Redis rate limiter** — L1 feloldása
2. **CSP `unsafe-inline` felülvizsgálata** — L2: nonce middleware vagy dokumentált elfogadás
3. **`aria-expanded` fix** — L6 (accessibility best practice)
4. **Employer form redirect** — L7 (UX)
5. **Production DB migration apply** — admin jóváhagyással, rollback plan-nel
6. **Monitoring / alerting** — Supabase dashboard + Next.js error tracking

---

## Pre-Production Checklist

```
[ ] Upstash Redis bekötése middleware.ts-be
[ ] CSP nonce middleware vagy unsafe-inline elfogadása döntéssel dokumentálva
[ ] PreferenceDocumentViewer: aria-expanded hozzáadása
[ ] Employer opportunity form: redirect mentés után
[ ] valid_from <= valid_until CHECK constraint migration hozzáadása
[ ] EXTERNAL_URL + null url Zod cross-field validáció
[ ] Print popup: error handling ha win=null
[ ] Production Supabase migration apply (admin review + rollback plan)
[ ] Error monitoring setup (pl. Sentry)
[ ] Load test (ha > 100 egyidejű user várható)
```

---

## Összefoglalás

A Védett Karrier MVP technikailag és adatvédelmileg closed pilot szintjén release-ready. A két already-fixed P1/P2 probléma (XSS + URL scheme) a kódban javítva van. A megmaradó nyílt pontok ismert, dokumentált limitációk, amelyek closed pilot számára elfogadhatók, és publikus production előtt kezelendők.
