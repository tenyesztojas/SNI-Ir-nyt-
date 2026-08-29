# VédettMunka — Megvalósítási terv

## 1. Fájlstruktúra

```
lib/vedettmunka/
  types.ts            — TypeScript típusok (Employer, JobPost, JobAlert, JobReport, ApplicationLog)
  data.ts             — Szerver oldali adatlekérdezések
  categories.ts       — Kategóriák, szűrők, VédettMunka-specifikus mezők

app/vedettmunka/
  layout.tsx          — VédettMunka layout (saját fejléc sáv)
  page.tsx            — Főoldal / landing
  allasok/
    page.tsx          — Álláslista + szűrők (URL search params alapján)
    [id]/
      page.tsx        — Állásadatlap
  jelentkezes/
    [jobId]/
      page.tsx        — Jelentkezési folyamat
      JelentkezesClient.tsx
  oneletrajz/
    page.tsx          — CV kezdőoldal (ismertető)
    szerkeszto/
      page.tsx        — CV szerkesztő (kliens oldali, localStorage)
      CvSzerkesztoClient.tsx
    elozetes/
      page.tsx        — Előnézet + PDF letöltés gomb
      CvElozetesClient.tsx
  ertesito/
    page.tsx
    ErtesitoClient.tsx
  munkaltatok/
    page.tsx          — Munkáltatói információs oldal
  munkaltatoi-regisztracio/
    page.tsx
    MunkaltatoiRegClient.tsx
  hirdetes-feladas/
    page.tsx          — Csak jóváhagyott munkáltatóknak
    HirdetesClient.tsx
  actions.ts          — Server actions (employer, job, alert, report, application)

app/admin/vedettmunka/
  page.tsx            — Főoldal (KPI + linkek)
  munkaltatok/
    page.tsx
  hirdetesek/
    page.tsx
  jelentesek/
    page.tsx
  jelentkezesek-log/
    page.tsx

app/api/vedettmunka/
  pdf/route.ts        — PDF generálás (POST → Buffer visszaadás, nincs DB tárolás)
  jelentkezes/route.ts — E-mail küldés Resend-del + job_applications_log bejegyzés

supabase/migrations/
  20260829_vedettmunka.sql
```

## 2. Adatbázis migrációk

### Táblák
- **employers** — munkáltatói partnerek (status: pending_review | approved | rejected | suspended)
- **job_posts** — hirdetések (status: draft | submitted | under_review | needs_revision | approved | published | rejected | expired | archived)
- **job_applications_log** — technikai napló, CV tartalom nélkül
- **job_alerts** — állásértesítő beállítások felhasználónként
- **job_reports** — hirdetés jelentések

### RLS szabályok
- employers: saját olvasás/írás; admin ALL
- job_posts: publikus SELECT ha published; employer SELECT/UPDATE saját; admin ALL
- job_applications_log: saját INSERT + SELECT; admin SELECT
- job_alerts: saját CRUD
- job_reports: saját INSERT; admin ALL

## 3. Oldalak

| Route | Mit csinál |
|---|---|
| /vedettmunka | Landing: bemutatás, CTA, kategóriák |
| /vedettmunka/allasok | Álláslista, szűrők URL params-ban |
| /vedettmunka/allasok/[id] | Állásadatlap, VédettMunka-blokkokkal |
| /vedettmunka/jelentkezes/[jobId] | CV feltöltés vagy CV-készítő link, üzenet, adatkezelési beleegyezés, küldés |
| /vedettmunka/oneletrajz | CV készítő ismertető |
| /vedettmunka/oneletrajz/szerkeszto | Lépéses form (10 lépés), localStorage-ban |
| /vedettmunka/oneletrajz/elozetes | Előnézet, PDF letöltés gomb |
| /vedettmunka/ertesito | Értesítő beállítások (bejelentkezett felhasználónak) |
| /vedettmunka/munkaltatok | Munkáltatói info oldal |
| /vedettmunka/munkaltatoi-regisztracio | Munkáltatói regisztráció form |
| /vedettmunka/hirdetes-feladas | Hirdetés feladása (jóváhagyott munkáltatónak) |
| /admin/vedettmunka | Admin főoldal, KPI kártyák |
| /admin/vedettmunka/munkaltatok | Munkáltatók listája, jóváhagyás/elutasítás |
| /admin/vedettmunka/hirdetesek | Hirdetések, jóváhagyás workflow |
| /admin/vedettmunka/jelentesek | Hirdetés jelentések kezelése |
| /admin/vedettmunka/jelentkezesek-log | Technikai napló |

## 4. Munkáltatói jóváhagyás

1. Munkáltató kitölti a regisztrációs formot → `employers` sor létrejön (`pending_review`)
2. Admin e-mail értesítést kap (Resend)
3. Admin az `/admin/vedettmunka/munkaltatok` oldalon látja → jóváhagyja/elutasítja
4. Jóváhagyott munkáltató belépve látja a „Hirdetés feladása" menüpontot

## 5. Hirdetésjóváhagyás

1. Jóváhagyott munkáltató kitölti a hirdetés formot → `job_posts` sor (`submitted`)
2. Admin e-mail értesítés
3. Admin megtekinti, jóváhagyja (`approved` → `published`) vagy visszaküldi javításra (`needs_revision`) vagy elutasítja (`rejected`)
4. Publikált hirdetés megjelenik az álláslista oldalon

## 6. Jelentkezés folyamata

1. Felhasználó kattint: „Jelentkezem" az álláshirdetésen
2. `GET /vedettmunka/jelentkezes/[jobId]` — betölti a hirdetés adatait
3. Felhasználó feltölt PDF/DOCX CV-t VAGY megnyitja a CV-készítőt
4. Ír rövid üzenetet (opcionális)
5. Elfogadja az adatkezelési nyilatkozatot
6. `POST /api/vedettmunka/jelentkezes`:
   - Resend e-mailt küld a munkáltató `application_email`-jére (CV melléklet + üzenet)
   - Létrehozza a `job_applications_log` bejegyzést (CV tartalom nélkül)
   - CV fájlt nem menti el tartósan
7. Visszajelzés: „Jelentkezésedet továbbítottuk."

## 7. CV ideiglenes feldolgozás

- CV adatok **kizárólag localStorage-ban** tárolódnak a kitöltés során
- PDF generáláskor: `POST /api/vedettmunka/pdf` → JSON body → szerver generálja → Buffer visszaküldés → böngésző letölti
- Fotó: base64 data URL formában kerül a PDF API-ba, szerveren nem marad
- Jelentkezéskor feltöltött CV (PDF/DOCX): az API route memóriában veszi át, e-mailben mellékletként elküldi, majd eldobja

## 8. PDF önéletrajz generálás

- Library: `@react-pdf/renderer` (szerver oldali renderelés)
- API route: `POST /api/vedettmunka/pdf` — JSON body-ban kapja a CV adatokat + fotó base64
- `renderToBuffer(CvDocument)` → `Buffer` → Response `application/pdf`
- Design: fehér + sötétkék/türkiz, bal sáv névvel, jobb oldal szekciókkal, A4, nyomtatható

## 9. Fotófeltöltés

- Client komponens: `react-easy-crop` könyvtár
- Crop: 3:4 portré arány
- A kivágott kép canvas-ból base64 JPEG-ként kerül a localStorage-ba
- PDF generáláskor a base64 string megy a szervernek (POST body-ban)
- Nincs szerveren tárolás

## 10. Állásértesítő

- `job_alerts` tábla: felhasználónként 1 sor, szűrési feltételek JSONB-ban
- Új hirdetés publikálásakor az `adminToggleJobStatus` action meghívja a `notifyAlerts()` helper-t
- `notifyAlerts()`: lekérdezi a releváns `job_alerts` sorokat, Resend e-mailt küld

## npm csomagok (telepítendő)

```bash
npm install @react-pdf/renderer react-easy-crop
npm install -D @types/react-easy-crop
```

## Tesztelési checklist

- [ ] Munkáltató regisztrál → admin jóváhagyja
- [ ] Jóváhagyott munkáltató hirdetést küld be → admin jóváhagyja → megjelenik az álláslistán
- [ ] Álláskereső szűrőkkel keres
- [ ] Álláskereső megnyitja az állásadatlapot
- [ ] Álláskereső rákattint „Jelentkezem" → feltölt CV-t → üzenetet ír → elküldi
- [ ] E-mail megérkezik a munkáltatóhoz
- [ ] CV nem marad tárolva
- [ ] CV-készítő: kitölt 10 lépést → előnézet → PDF letöltés
- [ ] Fotófeltöltés → crop → bekerül a PDF-be
- [ ] Állásértesítő: beállítja → új releváns hirdetés publikálásakor kap e-mailt
- [ ] Hirdetés jelentése → admin kezeli
- [ ] Admin: jóváhagyás, elutasítás, felfüggesztés minden entitásnál
