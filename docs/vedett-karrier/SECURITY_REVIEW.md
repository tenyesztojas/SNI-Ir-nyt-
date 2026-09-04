# Védett Karrier – Security Review

**Dátum:** 2026-09-03
**Scope:** Sprint 1–6 teljes VK kódbázis
**Módszer:** Red-team / white-box audit — kód olvasás, grep, futtatott tesztek

---

## 1. Service Role Key Exposure — P0 CHECK

**Kérdés:** A `SUPABASE_SERVICE_ROLE_KEY` vagy bármely admin kulcs megjelenik-e kliensoldalon?

**Vizsgált fájlok:**
- `lib/supabase/server.ts` — `createServerClient(url, NEXT_PUBLIC_SUPABASE_ANON_KEY, ...)` ✅
- `lib/supabase/client.ts` — `createBrowserClient(url, NEXT_PUBLIC_SUPABASE_ANON_KEY)` ✅
- Grep: `NEXT_PUBLIC.*SERVICE_ROLE` / `NEXT_PUBLIC.*service_role` → **0 találat** ✅

**Verdict: CLEAN.** Sem a server kliens, sem a browser kliens nem használ service_role kulcsot. A VK lib minden `createClient()` hívása az anon kulcsos szerveres kliensre támaszkodik, az RLS backstop teljes.

---

## 2. Row Level Security (RLS) — Employer Isolation

### 2.1 RLS engedélyezés

Minden VK tábla rendelkezik `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` utasítással:

| Tábla | RLS | Employer policy |
|-------|-----|-----------------|
| `career_profiles` | ✅ | Nincs (csak user_id = auth.uid()) |
| `career_profile_dimensions` | ✅ | Nincs |
| `user_skills` | ✅ | Nincs |
| `career_interests` | ✅ | Nincs |
| `vk_compatibility_results` | ✅ | **SZÁNDÉKOSAN NINCS** |
| `work_preference_documents` | ✅ | **SZÁNDÉKOSAN NINCS** |
| `vk_opportunities` | ✅ | Van (csak saját) |
| `vk_job_roles` | ✅ | Van (csak saját) |
| `job_role_env_values` | ✅ | Van (csak saját) |

### 2.2 Employer isolation teszt (logikai)

Ha egy employer-jogú user (auth.uid() = E) próbálna hozzáférni más user U career_profile_dimensions sorához:
- `career_profile_dimensions` policy: `USING (auth.uid() = user_id)` → E ≠ U → **kizárva** ✅
- `vk_compatibility_results` policy: csak `USING (auth.uid() = user_id)` → E ≠ U → **kizárva** ✅
- `work_preference_documents` public policy: `USING (is_shared = true AND share_token IS NOT NULL)` → ha U nem osztotta meg, employer nem fér hozzá ✅

**Verdict: CLEAN.** Az employer szerepkörű felhasználó nem fér hozzá egyetlen user-private táblához sem az RLS-en keresztül.

---

## 3. Authentication Chain — Server Actions

### 3.1 Opportunity actions (`opportunity/actions.ts`)

Minden write action auth sorrend:
1. `supabase.auth.getUser()` → auth check
2. `getEmployerByUserId(user.id)` → employer record lookup
3. `isEmployerApproved(employer)` → status guard
4. Zod validation → input sanitization
5. `getOpportunityByIdForEmployer(id, employer.id)` → ownership check
6. DB write → RLS backstop

Ez helyes többrétegű védekezés (defense in depth). ✅

### 3.2 Preferencialap actions (`preferencialap/actions.ts`)

`generateAndSavePreferenceDocument`:
1. `supabase.auth.getUser()` → auth check
2. `career_profiles` táblán `eq('user_id', user.id)` ownership check ✅
3. Generálás + mentés

`shareDocument` / `unshareDocument` / `deletePreferenceDocument`:
1. Auth check
2. `sharePreferenceDocument(documentId, user.id)` — a `user.id` átadva, a data layer WHERE-ben használja ✅

**Verdict: CLEAN.** Nincs IDOR — minden write action `user.id`-t vesz az auth tokenből, nem user input-ból.

---

## 4. XSS Audit

### 4.1 dangerouslySetInnerHTML

Grep: `dangerouslySetInnerHTML` az `app/vedett-karrier/` és `lib/vedett-karrier/` alatt → **0 találat** ✅

### 4.2 win.document.write() — VOLT P1, JAVÍTVA

**Probléma (pre-fix):** `PreferenceDocumentViewer.tsx` `handlePrint()` template literal-ban injektálta `${doc.title_hu}` és `${doc.generated_text_hu}` értékeket HTML-escapelés nélkül. Ha a user title-je `<script>alert(1)</script>` volt, az végrehajtódott a nyomtatási popup ablakban.

**Javítás (2026-09-03):**
```typescript
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
```
Minden injektált érték (`safeTitle`, `safeDate`, `safeContent`) escape-elve. ✅

**Impact (pre-fix):** Self-XSS a user saját popup ablakában. Cross-user impact: ha VKMM seed adatok kompromittáltak lennének, a `generated_text_hu` tartalma is kompromittált lenne, de ez más attack surface. A fix zárt mindkét vektort.

### 4.3 application_url / application_email rendering

- `application_email`: JSX React text nodeként renderel (`{opp.application_email}`) — NEM href, nem injekcióvektor ✅
- `application_url`: `href={opp.application_url}` — React 18 blokkolja a `javascript:` protokollt href-ben ✅
- `data:` URI blokkolás (pre-fix hiány): Zod `z.string().url()` elfogadta a `data:text/html,...` URIkat. React ezeket NEM blokkolja href-ben.

**Javítás (2026-09-03):** Zod `.refine()` hozzáadva — csak `http://` és `https://` protokoll engedett. ✅

---

## 5. URL / Redirect Security

### 5.1 External link kezelés

`lehetosegek/[id]/page.tsx` line 44:
```tsx
<a href={opp.application_url} target="_blank" rel="noopener noreferrer">
```
- `noopener`: megakadályozza az opener hozzáférést ✅
- `noreferrer`: nem szivárog referrer header ✅

### 5.2 Open redirect

Nincs nyilvános redirect endpoint a VK kódban. A VK route-ok fix statikus útvonalakat használnak. ✅

---

## 6. Share Token Entropy

`preferencialap/data.ts`:
```typescript
const shareToken = crypto.randomUUID()
```

- `crypto.randomUUID()`: Web Crypto API, 128-bit UUID v4
- Entrópia: ~122 bit (6 bit UUID version/variant fix)
- Brute force valószínűsége: 1/2^122 ≈ 3.4 × 10^-37 / kísérlet
- Nincs hash szükséges: a token csak DB lookup kulcsként szolgál (anon + shared), nem autentikáció

**Verdict: ADEQUATE** closed pilot és public production számára. ✅

Rate limiting a share_token endpointon: a middleware nem véd specifikusan `/preferencialap/megosztas/[token]` ellen. A 6-os sprintes route publikus oldal (anon SELECT), a token entrópia maga biztosítja a védelmet — elfogadható. Megerősítő rate limit ajánlott production előtt.

---

## 7. Content Security Policy (CSP)

`next.config.mjs` CSP:
```
script-src 'self' 'unsafe-inline' https://www.google.com ...
```

**Probléma (P2-02, OPEN):** `'unsafe-inline'` részlegesen lerontja a CSP XSS védelmet. Ha egy XSS vektor mégis fennmarad (pl. React 18 alatti edge case), az inline script közvetlen végrehajtást enged.

**Kontextus:** A `'unsafe-inline'` szükséges a Next.js belső inline script-jei és a Tailwind CSS-in-JS miatt. Nonce-alapú CSP megoldható, de implementációs komplexitással jár (Next.js 14 App Router + middleware nonce generálás).

**Verdict:** ACCEPTABLE closed pilot-ra, RESOLVE nyilvános production előtt. Opciók: (a) Next.js nonce middleware, (b) dokumentált elfogadott kockázat.

Egyéb CSP direktívák:
- `frame-ancestors 'none'` ✅ (clickjacking ellen)
- `upgrade-insecure-requests` ✅
- `font-src 'self'` ✅ (font szivárgás blokkolva)

---

## 8. Rate Limiting

`middleware.ts` rate limiter:
- IP-alapú csúszóablak implementáció
- Érzékeny endpointokra specifikus limitek (5–60/perc)
- In-memory `Map<string, RateWindow>` — instanciánként független

**Probléma (P2-03, OPEN):** Serverless deployban minden instance saját állapotot vezet. Párhuzamos instance-ek esetén egy IP effektíven N×limit kérést tud küldeni (N = aktív instanciák száma).

**Javítás:** Upstash Redis (ingyenes tier elég) vagy hasonló distributed store. A middleware komment ezt már jelzi.

**Verdict:** ACCEPTABLE closed pilot-ra (alacsony forgalmi terhelés), RESOLVE nyilvános production előtt.

---

## 9. Middleware Auth — Route Protection

`middleware.ts` minden kérésre frissíti a Supabase session cookie-t. Az auth-protected route-ok (munkaltato/*, preferencialap, stb.) server component-ben `createClient().auth.getUser()` hívással ellenőrzöttek.

**Nincs** nyilvános route, amely auth nélkül ad vissza user-private adatot. ✅

---

## 10. Security Headers

| Header | Érték | OK |
|--------|-------|-----|
| `X-Frame-Options` | DENY | ✅ |
| `X-Content-Type-Options` | nosniff | ✅ |
| `X-XSS-Protection` | 1; mode=block | ✅ |
| `Referrer-Policy` | strict-origin-when-cross-origin | ✅ |
| `Strict-Transport-Security` | max-age=31536000; includeSubDomains; preload | ✅ |
| `Permissions-Policy` | camera=(), microphone=() | ✅ |
| `Content-Security-Policy` | Részletes (lásd §7) | ⚠️ unsafe-inline |

---

## 11. Érzékeny adat logolás

Server action-ök nem logolnak user PII-t (névhez, e-mailhez, profil tartalmhoz kötött adat). Technikai ID-k (uuid) logolhatók — elfogadható. ✅

---

## Összefoglalás

| Kategória | Státusz |
|-----------|---------|
| Service role key exposure | ✅ CLEAN |
| RLS employer isolation | ✅ CLEAN |
| Auth chain integrity | ✅ CLEAN |
| XSS (dangerouslySetInnerHTML) | ✅ CLEAN |
| XSS (print popup) | ✅ JAVÍTVA |
| URL scheme validation | ✅ JAVÍTVA |
| Share token entropy | ✅ ADEQUATE |
| CSP unsafe-inline | ⚠️ OPEN (P2) |
| Rate limiter serverless compat | ⚠️ OPEN (P2) |
| Security headers | ✅ (1 korláttal) |
| Sensitive data logging | ✅ CLEAN |
