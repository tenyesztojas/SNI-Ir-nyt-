# Közösségi segítség moderációs politika

**Belső dokumentum – nem nyilvános**
Hatályos: 2026-08-30

---

## 1. Cél és hatály

Ez a dokumentum a VédettSarok Közösségi segítség (KS) moduljához kapcsolódó felhasználói bejelentések kezelésének, moderációjának és adatmegőrzésének belső eljárásrendjét rögzíti. A dokumentum az adminisztrátorok számára kötelező iránymutató.

---

## 2. Bejelentési kategóriák és súlyossági szintek

| Kategória | Érték | Súlyosság | Teendő |
|---|---|---|---|
| Fenyegetés vagy erőszak | `threat_or_violence` | 🚨 Kritikus | Azonnali vizsgálat; szükség esetén hatóság értesítése |
| Gyermekbiztonság | `child_safety` | 🚨 Kritikus | Azonnali vizsgálat; hatóság értesítése kötelező lehet |
| Gyermek személyes adata | `child_personal_data` | 🚨 Kritikus | Tartalom azonnali elrejtése; vizsgálat |
| Adatvédelem / doxxing | `privacy_or_doxxing` | 🚨 Kritikus | Azonnali vizsgálat |
| Veszélyes felajánlás | `dangerous_help_offer` | ⚠️ Magas | 24 órán belüli vizsgálat |
| Átverés / csalás | `fraud_or_scam` | ⚠️ Magas | 24 órán belüli vizsgálat |
| Pénzkérés / kereskedelem | `payment_or_commercial` | ⚠️ Magas | 24 órán belüli vizsgálat |
| Zaklatás | `harassment` | ℹ️ Normál | 72 órán belüli vizsgálat |
| KS visszaélés | `misuse_of_community_help` | ℹ️ Normál | 72 órán belüli vizsgálat |
| Egyéb | `other` | ℹ️ Normál | 72 órán belüli vizsgálat |

---

## 3. Moderációs döntések és jogkövetkezmények

| Döntés | Státusz érték | Leírás |
|---|---|---|
| Vizsgálat alatt | `under_review` | Megkezdett vizsgálat, még nincs döntés |
| Nincs intézkedés | `resolved_no_action` | Bejelentés megalapozatlan vagy nem igazolt |
| Figyelmeztetés küldve | `resolved_warning_sent` | Bejelentett felhasználó figyelmeztetve |
| KS kikapcsolva | `resolved_help_disabled` | A KS funkció az érintett felhasználónál letiltva |
| Profil felfüggesztve | `resolved_profile_suspended` | A közösségi profil felfüggesztve |
| Elutasítva | `rejected` | Rosszhiszemű vagy ismételt alaptalan bejelentés |

**Minden döntésnél kötelező:** írásos indoklás (legalább 1 mondat). Az indoklás az audit naplóba kerül és nem szerkeszthető utólag.

---

## 4. Ideiglenes elrejtés (B opció)

Kritikus bejelentés esetén az adminisztrátor az "Ideiglenes elrejtés" gombbal azonnal elrejtheti a bejelentett tartalmú profil KS blokkját a nyilvános nézetből, a vizsgálat lezárása előtt is. Ez nem jelent végleges döntést; visszavonható. Minden elrejtési/visszaállítási művelet audit naplóba kerül.

---

## 5. Sürgősségi protokoll (kritikus eset)

1. **Azonnal** jelöld "Vizsgálat alatt"-ra és rejtsd el a tartalmat.
2. Ha közvetlen veszély áll fenn (gyermekbántalmazás, fenyegetés, stb.), értesítsd a rendőrséget / hatáskörrel rendelkező hatóságot.
3. A `legal_hold` mezőt állítsd `true`-ra, hogy az adatok ne kerüljenek automatikus anonimizálásra.
4. Dokumentáld az intézkedéseket az audit naplóban.

---

## 6. Adatmegőrzési szabályok

| Súlyosság | Minimális megőrzési idő | legal_hold esetén |
|---|---|---|
| Kritikus | 12 hónap | A `legal_hold` feloldásáig |
| Magas | 6 hónap | A `legal_hold` feloldásáig |
| Normál | 6 hónap | A `legal_hold` feloldásáig |

- Az anonimizálás automatikusan fut (cron: naponta 04:00), ha `retention_until` lejárt és `legal_hold = false`.
- Anonimizálás után 24 hónappal a rekord törlésre kerül.
- A `legal_hold` jelölést csak adminisztrátor állíthatja, indokolt esetben.

---

## 7. Fellebbezési eljárás

- A bejelentett felhasználó a döntésről szóló értesítéstől számított **6 hónapon** belül fellebbezhet.
- A fellebbezés az ügyfélszolgálati e-mail-címen nyújtható be.
- A fellebbezést egy másik adminisztrátor vizsgálja meg (a döntést hozó kizárva).
- A fellebbezési döntést írásban kell rögzíteni az audit naplóban.
- Lehetséges döntések: `upheld` (bejelentett igazát adtuk), `rejected` (eredeti döntés fenntartva).

---

## 8. 112 / hatósági bejelentés

- Az adminisztrátor **köteles** hatóságot értesíteni, ha a bejelentés alapján alapos okkal feltehető, hogy bűncselekmény valósult meg (különösen: gyermekbántalmazás, erőszak, emberkereskedelem).
- A hatósági bejelentést az audit naplóban dokumentálni kell.
- A VédettSarok nem helyettesíti a hatósági eljárást.

---

## 9. Admin push értesítések

| Súlyosság | Értesítés módja |
|---|---|
| Kritikus | Push értesítés, cím: "🚨 KRITIKUS felhasználói jelentés" |
| Magas | Push értesítés, cím: "⚠️ Magas prioritású felhasználói jelentés" |
| Normál | Push értesítés, cím: "ℹ️ Új felhasználói jelentés" |

---

## 10. Felelősségi körök

- **Adminisztrátorok:** bejelentések vizsgálata, döntéshozatal, audit napló karbantartása, legal_hold kezelése.
- **Fejlesztők:** a rendszer technikai megfelelőségének fenntartása, cron futtatás ellenőrzése.
- **Üzemeltető:** eljárásrend felülvizsgálata félévente, hatósági kapcsolattartás.

---

*Következő felülvizsgálat: 2027. február 28.*
