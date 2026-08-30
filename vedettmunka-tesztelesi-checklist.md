# VédettMunka — Tesztelési checklist (élesítés előtt)

**Verzió:** 2026-08-30  
Kézzel elvégzendő tesztsorozat élesítés előtt. Minden sort jelöljön meg az elvégzés dátumával és nevével.

---

## A. Környezet és konfiguráció

- [ ] `CRON_SECRET` be van állítva Vercel environment variables-ben (Production)
- [ ] `NEXT_PUBLIC_SITE_URL` be van állítva (pl. `https://vedettsarok.hu`)
- [ ] `RESEND_API_KEY` érvényes és a `vedettsarok.hu` domain hitelesített Resend-ben
- [ ] `supabase/migrations/20260830_vedettmunka_legal.sql` lefutott a produkciós DB-n
- [ ] `supabase/migrations/20260829_vedettmunka.sql` lefutott a produkciós DB-n
- [ ] A `vm_consent_log`, `vm_admin_audit_log` táblák léteznek
- [ ] Az `employers.privacy_policy_url` oszlop létezik

---

## B. Munkáltatói regisztráció

- [ ] Regisztrációs form megnyílik: `/vedettmunka/munkaltatoi-regisztracio`
- [ ] Kötelező mezők hiányában a form nem küldhető el
- [ ] `privacy_policy_url` mező kötelező, érvénytelen URL esetén hibát ad
- [ ] Sikeres beküldés után admin értesítő e-mail megérkezik
- [ ] A beküldött munkáltató megjelenik az admin felületen: `/admin/vedettmunka/munkaltatok`
- [ ] Admin `vm_consent_log`-ban megjelenik az `employer_terms_acceptance` és `employer_fair_selection_acceptance` bejegyzés

---

## C. Admin: munkáltató jóváhagyás

- [ ] `privacy_policy_url` nélküli munkáltatónál az "Jóváhagyás" gomb hibát ad (szerver oldali guard)
- [ ] `privacy_policy_url`-lel rendelkező munkáltatónál a jóváhagyás sikeres
- [ ] Jóváhagyás/elutasítás/felfüggesztés bejegyzés megjelenik `vm_admin_audit_log`-ban

---

## D. Hirdetés feladása és jóváhagyása

- [ ] Jóváhagyott munkáltató fel tud adni hirdetést
- [ ] A hirdetés `submitted` státuszba kerül, admin e-mailt kap
- [ ] Admin közzéteszi a hirdetést — a közzététel nem lehetséges, ha a munkáltatónak nincs `privacy_policy_url`
- [ ] Közzétett hirdetés megjelenik a listán: `/vedettmunka/allasok`
- [ ] `vm_admin_audit_log`-ban megjelenik a `job_status_changed` bejegyzés

---

## E. Jelentkezési folyamat

- [ ] Bejelentkezett felhasználó el tudja indítani a jelentkezést: `/vedettmunka/jelentkezes/[jobId]`
- [ ] A munkáltató adatkezelési tájékoztató linkje megjelenik (ha van)
- [ ] Ha a munkáltatónak nincs `privacy_policy_url`, figyelmeztető szöveg jelenik meg
- [ ] Hozzájárulás checkbox be nem jelölve esetén a form nem küldhető el
- [ ] PDF, DOC, DOCX formátum elfogadott; más formátum szerver oldali hibát ad (400)
- [ ] 5 MB feletti fájl szerver oldali hibát ad
- [ ] Sikeres küldés után a munkáltató e-mailben megkapja a jelölés adatait és CV-t
- [ ] `job_applications_log`-ban megjelenik a küldési napló (CV tartalom nélkül)
- [ ] `vm_consent_log`-ban megjelenik a `job_application_data_forwarding` bejegyzés

---

## F. CV-készítő

- [ ] Szerkesztő megnyílik: `/vedettmunka/oneletrajz/szerkeszto`
- [ ] Adatvédelmi tájékoztató banner látható a szerkesztő tetején
- [ ] Fotó feltöltés: JPG/PNG/WEBP elfogadott; GIF/BMP/PDF hibát ad
- [ ] Fotó feltöltés: 2 MB felett hibaüzenet jelenik meg
- [ ] "Piszkozat törlése erről az eszközről" gomb törli a `vm_cv_draft` kulcsot és visszaállítja az üres állapotot
- [ ] Az előnézeten a kép megfelelően jelenik meg (nem nyújtott)
- [ ] PDF letöltés sikeres; a letöltött PDF tartalmazza az összes beírt adatot
- [ ] Az előnézeti oldalon is megjelenik az adatvédelmi tájékoztató

---

## G. Állásértesítő (feliratkozás / leiratkozás)

- [ ] Bejelentkezett felhasználó feliratkozhat: `/vedettmunka/ertesito`
- [ ] Feliratkozás után `vm_consent_log`-ban megjelenik a `job_alert_subscribe` bejegyzés
- [ ] Landing page CTA (`/vedettmunka`): vendégnek login gomb, feliratkozónak "Bekapcsolva" badge jelenik meg
- [ ] "Feliratkozom" gomb a landing page-en bekapcsolja az értesítőt
- [ ] "Leiratkozom" gomb a landing page-en kikapcsolja az értesítőt

---

## H. Cron route-ok

### Lejárat cron tesztelése
```bash
curl -H "Authorization: Bearer <CRON_SECRET>" \
  https://vedettsarok.hu/api/cron/expire-vedettmunka-jobs
```
- [ ] Válasz: `{"ok":true,"expired":<szám>}`
- [ ] Ha nincs `expires_at`-on túl hirdetés: `{"ok":true,"expired":0}`
- [ ] Jogosulatlan hívás (rossz token): 401-et ad

### Heti értesítő cron tesztelése
```bash
curl -H "Authorization: Bearer <CRON_SECRET>" \
  https://vedettsarok.hu/api/cron/send-weekly-job-alerts
```
- [ ] Válasz: `{"ok":true,"sent":<szám>,...}`
- [ ] Az e-mail megérkezik a tesztelő postaládájába
- [ ] Az e-mail tartalmazza a leiratkozási linket

### Egy kattintásos leiratkozás tesztelése
- [ ] A leiratkozási link az e-mailből működik (302-re irányít, `job_alerts.enabled = false` lesz)
- [ ] Érvénytelen token esetén 403-at ad
- [ ] Visszairányítás után a `/vedettmunka/ertesito?leiratkozas=ok` oldalon megjelenik a sikeres leiratkozás üzenete

---

## I. Admin audit log ellenőrzése

```sql
SELECT action_type, target_type, created_at
FROM vm_admin_audit_log
ORDER BY created_at DESC
LIMIT 20;
```
- [ ] A fenti tesztek során végrehajtott admin műveletek megjelennek a naplóban

---

## J. TypeScript build ellenőrzés

```bash
cd <projektmappa>
npx tsc --noEmit
npm run build
```
- [ ] `tsc --noEmit` hibátlanul lefut
- [ ] `npm run build` hibátlanul lefut
- [ ] Nincsenek `any` típushibák az új fájlokban

---

## K. CSP (Content Security Policy) ellenőrzés

- [ ] `/vedettmunka/oneletrajz/elozetes` oldalon a PDF-generálás nem dob CSP hibát (böngésző konzol)
- [ ] A cdnjs.cloudflare.com domain engedélyezett a `script-src`-ben (`next.config.mjs`)

---

*Checklist vége. Minden sor pipálása után az élesítés elvégezhető.*
