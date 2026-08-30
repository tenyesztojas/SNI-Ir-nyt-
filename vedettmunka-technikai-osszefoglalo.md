# VédettMunka — Technikai összefoglaló (jogi csapat részére)

**Verzió:** 2026-08-30  
**Modul:** VédettMunka (VédettSarok webapplikáción belül)  
**Elkészítő:** Fejlesztői csapat  

---

## 1. A modul célja és MVP-hatóköre

A VédettMunka a VédettSarok webapplikáción belüli specializált álláshirdetési, álláskeresési, önéletrajzkészítő és jelentkezéstovábbító felület. Célja, hogy megváltozott munkaképességű, neurodivergens, illetve egyéb hátrányos helyzetű álláskeresők számára befogadó munkáltatók álláshirdetéseit tegye közzé, és lehetővé tegye az egyszerűsített, CV-alapú jelentkezések technikai továbbítását.

A VédettMunka nem munkaerő-közvetítő szolgáltatás, nem garantál elhelyezkedést, interjúra hívást, munkáltatói válaszadást vagy munkaviszony létrejöttét. A VédettMunka álláshirdetések megjelenítését, önéletrajz készítését és konkrét jelentkezések technikai továbbítását támogatja.

**Az MVP kizárólag az alábbi funkciókat tartalmazza:**

- Álláslistázás és keresés (munkáltató, kategória, helyszín szerint)
- Munkáltatói regisztráció és hirdetésfeladás (admin jóváhagyással)
- Jelentkezési folyamat: CV-fájl csatolása + e-mail továbbítás a munkáltatóhoz
- Kliens oldali önéletrajz-készítő (adatbázis-tárolás nélkül)
- Heti állásértesítő e-mail feliratkozás/leiratkozás
- Hozzájárulási napló (GDPR)
- Admin audit napló

**Az MVP NEM tartalmaz (és nem fog tartalmazni):**

- CV-adatbázist vagy szerver oldali CV-tárolást
- Munkáltatói ATS-rendszert (applicant tracking)
- Jelölt rangsorolást, AI-alapú párosítást
- Diagnózis, fogyatékossági kategória vagy egészségügyi adat gyűjtését
- Online fizetési rendszert
- Munkáltatói jelöltkezelő dashboardot

---

## 2. Adatkezelési architektúra

### 2.1. Személyes adatok és adatáramlás

| Adat | Forrás | Tárolás | Törlési lehetőség |
|---|---|---|---|
| Jelölt neve, e-mail (jelentkezésnél) | Felhasználó inputja | Csak job_applications_log, CV nélkül | Supabase admin / GDPR kérésre |
| CV-fájl | Felhasználó által feltöltött | **Nem tárol szerveren** — közvetlenül e-mailben továbbítódik a munkáltatóhoz, majd memóriából törlődik | — |
| Önéletrajz adatok (CV-készítő) | Felhasználó inputja | Kizárólag a felhasználó böngészőjének localStorage-ában | Felhasználó törli, vagy "Piszkozat törlése" gomb |
| Fénykép (CV-készítő) | Felhasználó inputja | Kizárólag localStorage-ban, base64 | Felhasználó törli |
| Álláshirdetés adatai | Munkáltató inputja | job_posts tábla (Supabase PostgreSQL) | Admin | 
| Munkáltató kapcsolati adatai | Munkáltató inputja | employers tábla (Supabase PostgreSQL) | Admin |
| Hozzájárulási napló | Automatikusan | vm_consent_log tábla | Csak admin |
| Admin audit napló | Automatikusan | vm_admin_audit_log tábla | Csak admin |

### 2.2. Különleges kategóriájú adatok (GDPR 9. cikk)

A modul **nem gyűjt** és **nem tárol** GDPR 9. cikk alá eső különleges kategóriájú adatot (pl. fogyatékosság, egészségi állapot, diagnózis). A befogadói szűrők (pl. `open_to_disabled`, `open_to_neurodivergent`) a **munkáltató nyilatkozatai** saját munkakörnyezetéről — nem a jelölt egészségügyi adatai.

Az önéletrajz-készítő felülete kifejezetten figyelmezteti a felhasználókat: ne töltsenek fel diagnózist, egészségügyi igazolást vagy fogyatékossági dokumentumot.

---

## 3. Adatkezelési jogalapok

| Adatkezelési esemény | Jogalap (GDPR 6. cikk) |
|---|---|
| Munkáltatói regisztráció adatai | 6(1)(b) — szerződés teljesítése |
| Álláshirdetés közzététele | 6(1)(b) — szerződés teljesítése |
| Jelölt adatainak munkáltatóhoz továbbítása | 6(1)(a) — hozzájárulás (explicit checkbox, naplózva) |
| Heti állásértesítő küldése | 6(1)(a) — hozzájárulás (feliratkozás, naplózva) |
| Alkalmazásnapló (job_applications_log) | 6(1)(f) — jogos érdek (visszaélés-elhárítás, technikai hibakeresés) |
| Admin audit napló | 6(1)(f) — jogos érdek (belső kontroll, auditálhatóság) |

---

## 4. Hozzájárulási napló (vm_consent_log)

Minden hozzájárulási esemény naplózásra kerül a `vm_consent_log` táblában, beleértve:

- **job_application_data_forwarding**: Jelölt hozzájárulása adatainak munkáltatóhoz továbbításához, a munkáltató adatkezelési tájékoztatója linkjével együtt
- **job_alert_subscribe**: Állásértesítő feliratkozás
- **employer_terms_acceptance**: Munkáltató általános feltételek elfogadása
- **employer_fair_selection_acceptance**: Munkáltató esélyegyenlőségi nyilatkozat elfogadása

A napló tartalmazza: felhasználói azonosítót (ha hitelesített), hirdetés azonosítóját, munkáltatói azonosítót, elfogadás időbélyegét, a munkáltató adatkezelési tájékoztató URL-jét.

---

## 5. Munkáltatói adatkezelési tájékoztató

A munkáltatói regisztráció kötelező eleme az adatkezelési tájékoztató URL-je (`privacy_policy_url`). Admin jóváhagyás és hirdetés-közzétételkizárólag akkor lehetséges, ha ez az URL meg van adva. A jelölt a jelentkezési felületen explicit linket kap a munkáltató saját adatkezelési tájékoztatójához.

---

## 6. Technikai infrastruktúra

| Komponens | Megoldás |
|---|---|
| Frontend | Next.js 14.2.5 (App Router, Server Components, Server Actions) |
| Backend | Supabase (PostgreSQL + RLS + Auth) |
| Hosting | Vercel |
| E-mail küldés | Resend API |
| CV-fájl tárolás | **Nincs** — Buffer memóriában, közvetlen e-mail csatolmány |
| Önéletrajz adat | localStorage (böngésző, szerver nem látja) |
| PDF generálás | html2pdf.js (kliens oldali, CDN-ről töltve) |
| Cron | Vercel Cron Jobs |
| Admin auth | Supabase RLS (role = 'admin' a profiles táblában) |

### Ismert technikai adósság

- **html2pdf.js CDN**: A PDF-generáló könyvtár cdnjs.cloudflare.com-ról töltődik be. Éles környezethez ajánlott npm csomagra migrálni (`npm install html2pdf.js`) és a CSP-t ennek megfelelően frissíteni. Az élesítés blokkolója ez nem, de Q1-es fejlesztési prioritás.

---

## 7. Cron automatizálás

| Cron | Futásidő | Leírás |
|---|---|---|
| `/api/cron/expire-vedettmunka-jobs` | Naponta 03:00 | `expires_at` dátumot meghaladó hirdetések státuszát `expired`-re állítja |
| `/api/cron/send-weekly-job-alerts` | Hétfőnként 07:00 | Heti e-mail az aktív állásértesítő feliratkozóknak |

Mindkét cron hívást a Vercel hitelesíti `CRON_SECRET` Bearer token segítségével. Manuálisan is meghívhatók curl-lel teszteléshez.

**Szükséges Vercel env változók:**
- `CRON_SECRET` — véletlenszerű hosszú string (pl. `openssl rand -hex 32`)
- `NEXT_PUBLIC_SITE_URL` — pl. `https://vedettsarok.hu`

---

## 8. Leiratkozás (egy kattintás)

A heti értesítő e-mail tartalmaz egy személyre szóló leiratkozási linket:
`/api/vedettmunka/ertesito/leiratkozas?uid=<uuid>&token=<hmac>`

A token HMAC-SHA256 aláírással kötött a felhasználói azonosítóhoz és a `CRON_SECRET`-hez. Nincs adatbázisban tárolt token — a link lejárat nélküli, de érvénytelenné válik, ha a CRON_SECRET megváltozik.

---

## 9. Admin jogosultságok

Az admin szerepkör a `profiles.role = 'admin'` mezőn alapul (Supabase RLS). Admin funkciók:
- Munkáltatók jóváhagyása / elutasítása / felfüggesztése
- Hirdetések közzétételének jóváhagyása
- Hirdetésjelentések kezelése
- Összes lépés naplózódik a `vm_admin_audit_log` táblában

---

## 10. Élesítés előtti teendők

Lásd a külön tesztelési checklisten (`vedettmunka-tesztelesi-checklist.md`).

A kötelező lépések:
1. `CRON_SECRET` és `NEXT_PUBLIC_SITE_URL` env változók beállítása Vercel-ben
2. `supabase/migrations/20260830_vedettmunka_legal.sql` futtatása a produkciós adatbázison
3. Legalább egy tesztjelentkezés lebonyolítása és a `vm_consent_log` ellenőrzése
4. Munkáltató regisztráció tesztelése privacy_policy_url mezővel
5. Admin jóváhagyási folyamat végig tesztelése

---

*Dokumentum vége. Technikai kérdések: fejlesztői csapat.*
