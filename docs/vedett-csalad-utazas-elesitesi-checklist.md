# Védett Család – gyermekutazás: élesítési ellenőrzőlista

Jelölés: **[KÉZI JÓVÁHAGYÁS]** = csak felelős személy döntése után hajtható végre.
Állapot (2026-10-14): a kód nincs commitolva; a `20261014_child_travel_status.sql`
migráció SEHOL nincs alkalmazva; valódi Supabase- és böngészős teszt nem történt.

## 1. Git-változások ellenőrzése
- `git status` és `git diff --stat` — csak a Védett Család / Védett Útvonal-integráció fájljai legyenek benne.
- NE kerüljön commitba: `tsconfig*.tsbuildinfo`, `_to_delete/`, `app/dev/`, `supabase/.temp/`, VPS zip-ek, natív `.idea/`, a `capacitor.config.ts` localhost-beállítása.
- Futtasd: `node --test __tests__/family/*.test.ts` (elvárt: 87/87) és `npx tsc --noEmit` (elvárt: 0 hiba).

## 2. Biztonságos commit **[KÉZI JÓVÁHAGYÁS]**
- Fájlonként `git add <fájl>` (soha `git add .`), majd egy commit. Push csak külön jóváhagyás után.

## 3. Staging adatbázis előkészítése **[KÉZI JÓVÁHAGYÁS]**
- Friss staging mentés (Supabase Dashboard → Database → Backups).
- Tesztfelhasználók: Szülő-A (owner, A család), Gondviselő-A1 (`can_view_schedule`), Gondviselő-A2 (jogosultság nélkül), Gyermek-A (aktív gyermekfiók), Szülő-B + Gyermek-B (B család), valamint egy kijelentkezett böngésző.

## 4. SQL-migráció tesztelése (staging) **[KÉZI JÓVÁHAGYÁS]**
- SQL Editorban a fájl teljes tartalma; másodszori futtatás se adjon hibát (idempotencia).
- Ellenőrzés: a `child_travel_statuses` tábla, a `child_travel_statuses_select_via_family` policy és a `set_child_travel_status` függvény létezik.

## 5. Jogosultsági tesztek (staging)
- Gyermek-A: saját mai programjára depart/help/arrive működik; Gyermek-B programjának ID-jával → `travel_item_not_found`.
- Gyermek-A: szülői műveletek (program létrehozás/szerkesztés/törlés, meghívás) elutasítva.
- Szülő-A látja Gyermek-A állapotát; Gyermek-B-ét nem (`/api/family/travel-status?children=<B id>` → üres `statuses`).
- Gondviselő-A1 lát, Gondviselő-A2 nem; jogosultság visszavonása után A1 sem.
- Gyermekfiók inaktiválása után a gyermek nem módosíthat és nem lát (`travel_not_child`).
- Kijelentkezve: API → 401; RPC anon-ként → permission denied; közvetlen insert/update/delete authenticated-ként → elutasítva.

## 6. Gyermekfiókos böngészős próba (telefonon)
- Kártya adatai = napirend; hiányzó adatnál „Nincs megadva”; „Útvonal megtervezése” a helyes indulási és célkoordinátával nyílik.
- Elindultam → újratöltés után „Úton vagyok”; dupla kattintás egy utat rögzít.
- Segítséget kérek → Megérkeztem: a szülőnél a segítségkérés ideje megmarad.
- Két lapon: az egyiken lezárva, a másikon gombnyomás → hibaüzenet + friss állapot.
- Repülőgép-mód mentés közben → hibaüzenet, nincs hamis siker.
- Ha megoldható, éjfél körüli próba: a „Tegnap megkezdett utazás” lezárható.

## 7. Szülői böngészős próba
- Az új állapot ~45 mp-en belül megjelenik; háttérbe tett lapon nincs lekérdezés (DevTools → Network).
- Segítségkérés pirosan kiemelve, „nem vészhelyzeti értesítés” szöveggel; hálózati hibánál „frissítés nem sikerült”.

## 8. Production migráció **[KÉZI JÓVÁHAGYÁS]**
- Csak a sikeres 4–7. lépés után; előtte production mentés. Ugyanaz a fájl, változtatás nélkül.

## 9. Kódtelepítés **[KÉZI JÓVÁHAGYÁS]**
- A migráció UTÁN deploy (a kód migráció nélkül is biztonságos: a gombok hibaüzenetet adnak, a szülői sáv üres).

## 10. Éles működés ellenőrzése
- Saját tesztcsaláddal az 5. és 6. pont rövidített ismétlése; a Supabase logokban ne legyen ismétlődő RPC-hiba.

## 11. Hibakezelés és visszaállítás **[KÉZI JÓVÁHAGYÁS]**
- Kódhiba: az előző deploy visszaállítása (az adatok megmaradnak).
- Adatbázis (ADATVESZTÉSSEL JÁR): előtte exportáld a táblát, majd
  `drop function if exists public.set_child_travel_status(uuid, text); drop table if exists public.child_travel_statuses;`
