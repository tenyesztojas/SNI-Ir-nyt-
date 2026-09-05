# VédettKarrier – Job Board Drift Audit
Dátum: 2026-09-04
Célja: dokumentálni a régi álláshirdetős modell (`/vedettmunka`) és az új karrierprofilos
modell (`/vedett-karrier`) közötti eltéréseket; azonosítani az élő, de már elavult
cross-linkeket és duplikált funkcionális egységeket.

---

## 1. Modellváltás összefoglalója

### Régi modell (`/vedettmunka`)

```
Munkáltató → álláshirdetés feladása → nyilvános állások lista →
User böngészik → User jelentkezik → (Önéletrajz csatolható)
```

Kulcseleme: **a munkáltató tesz közzé, a user reagál.**
A rendszer hasonló bármely hagyományos álláshirdetési portálhoz.

### Új modell (`/vedett-karrier`, Sprint 1–6)

```
Munkáltató → munkakör feltérképezése (VKMM) → munkakör-térkép →
Lehetőség létrehozása (opcionális) →

User → Munkaprofil kitöltése (VKMM, 51 aldimenzió) →
Képességtérkép → Karrieriránytű → Kompatibilitási Térkép →
Önálló döntés → Preferencialap megosztása (opcionális)
```

Kulcseleme: **a user építi a saját profilját, a rendszer segít tájékozottan dönteni.**
Nincs AI matching, nincs suitability score, nincs employer-oldalú szűrés usereken.

---

## 2. Route-by-route drift táblázat

| Régi route | Régi funkció | Új megfelelő | Státusz |
|---|---|---|---|
| `/vedettmunka` | landing, hero, álláslista CTA | `/vedett-karrier` (hiányzik) | Drift: új landing nincs |
| `/vedettmunka/allasok` | publikus állások böngészése | `/vedett-karrier/lehetosegek` | Párhuzamos – mindkettő él |
| `/vedettmunka/allasok/[id]` | álláshirdetés detail | `/vedett-karrier/lehetosegek/[id]` | Párhuzamos |
| `/vedettmunka/hirdetes-feladas` | munkáltató hirdet | `/vedett-karrier/munkaltato/lehetosegek/new` | Modell eltérés: régi = hirdetés, új = lehetőség munkakörre |
| `/vedettmunka/hirdetes-feladas/koszonjuk` | megerősítő oldal | nincs új megfelelő | Legacy |
| `/vedettmunka/jelentkezes/[jobId]` | user jelentkezési form | nincs közvetlen megfelelő | Modell eltérés: új rendszerben nincs in-app jelentkezési form |
| `/vedettmunka/karrieriranytu` | kliens-oldali quiz (self-assess) | `/vedett-karrier/karrieriranytu` | Duplikált! Teljesen eltérő implementáció |
| `/vedettmunka/munkaltatoi-regisztracio` | munkáltató regisztrál | `/vedett-karrier/munkaltato` (részhiány) | Cross-link hiba: `/vedett-karrier/munkaltato` rossz URL-re mutat |
| `/vedettmunka/munkaltatok` | munkáltató-lista | nincs új megfelelő | Legacy, modell-eltérés |
| `/vedettmunka/munkaprofil` | user egyszerű önbemutatója | `/vedett-karrier/munkaprofil` | Duplikált! Teljesen eltérő adatmodell |
| `/vedettmunka/oneletrajz` | CV szerkesztő | nincs új megfelelő (Preferencialap más) | Legacy feature |
| `/vedettmunka/oneletrajz/szerkeszto` | CV szerkesztő | – | Legacy feature |
| `/vedettmunka/oneletrajz/elozetes` | CV előnézet | – | Legacy feature |
| `/vedettmunka/ertesito` | állásértesítő beállítása | nincs új megfelelő | Legacy feature |

---

## 3. Kritikus duplikációk

### 3a. Karrieriránytű duplikáció

**Régi:** `/vedettmunka/karrieriranytu`
- Kliens-side React quiz (`KarrieriranytClient`)
- Egyszerű preferenciakérdések, nincs DB mentés látható
- Nincs discovery engine

**Új:** `/vedett-karrier/karrieriranytu`
- Server Component
- `assembleDiscoveryInput` → `runCareerDiscovery` engine
- Képességtérkép + érdeklődés + munkakörcsaládok kombinálva
- DB-ből olvassa a user skill/interest adatokat

**Teendő:** A régi oldal elavult. Megőrzendő (legacy constraint), de a nav és
minden CTA az újra mutasson.

### 3b. Munkaprofil duplikáció

**Régi:** `/vedettmunka/munkaprofil`
- `getMyWorkProfile()` a `lib/vedettmunka/data` modulból
- Egyszerű szöveges önbemutató, preferencialistával
- Önéletrajzhoz csatolható

**Új:** `/vedett-karrier/munkaprofil`
- `getOrCreateCareerProfile()` + `loadSavedDimensions()`
- 51 aldimenzió, VKMM seed alapú wizard
- SHA-256 version hash, completion_pct
- Kompatibilitási motor inputja

**Teendő:** Teljesen eltérő adatmodell – nem migrálható 1:1. A régi megőrzendő
(legacy constraint), az új a canonical.

---

## 4. Élő cross-linkek az elavult rendszerre

Az alábbi helyek a `vedett-karrier` új rendszerből mutatnak vissza a legacyre:

| Fájl | Sor (kb.) | Link | Probléma |
|---|---|---|---|
| `app/vedett-karrier/munkaltato/page.tsx` | ~42 | `href="/vedettmunka/munkaltato/regisztracio"` | 404 – helytelen URL (a helyes: `/vedettmunka/munkaltatoi-regisztracio`) |

Az alábbi helyek a legacy rendszerből mutatnak az újra (helyes, ha szándékos):
– Nincs ilyen azonosítva az auditban.

---

## 5. Modell-eltérések: ami a régi rendszerben volt, az újban nincs

| Régi funkció | Státusz az újban | Megjegyzés |
|---|---|---|
| In-app jelentkezési form | **Nincs** | Az új rendszer lehetőség-kártyán közvetíti a módot (e-mail, URL, útmutató) |
| Önéletrajz-szerkesztő | **Nincs** | Preferencialap más célú – nem önéletrajz |
| Állásértesítő | **Nincs** | Nem tervezett a Sprint 1–6 keretein belül |
| Munkáltató-lista publikus oldala | **Nincs** | Az új rendszerben munkáltatók nem közvetlenül böngészhetők |
| Álláshirdetés-feladás munkáltató részéről | **Részben** | Új: munkakör feltérképezése → lehetőség létrehozása; ez más szándékú |

---

## 6. Összefoglalás

A `vedettmunka` és `vedett-karrier` rendszerek jelenleg párhuzamosan futnak, egymástól
függetlenül. A nav "VédettKarrier" linkje a régi rendszerre mutat, ezért a Sprint 1–6
funkciói de facto rejtve maradnak a user előtt.

Az integráció első lépése (PRODUCT_INTEGRATION_PLAN.md, Lépés 1) a nav javítása.
A legacy `/vedettmunka` rendszer törlése NEM része ennek a sprintnek (legacy constraint).
