# Védett Karrier – UX & Accessibility Review

**Dátum:** 2026-09-03
**Scope:** Sprint 6 UI fájlok + sprint 1–5 meglévő route-ok
**Módszer:** Kód audit (JSX elemzés) — live böngészős teszt nem végzett (dev server nem indult)

---

## 1. Accessibility (a11y) — Findings

### P2-A01 — Hiányzó `aria-label` akciógombokon

**Fájl:** `PreferenceDocumentViewer.tsx`

A PDF, Megosztás, Megosztás visszavonása és Törlés gombok csak szöveges tartalommal rendelkeznek — ez önmagában elfogadható, mivel a szöveg leíró. Azonban a PDF gombnak van `title` attribútuma (`title="PDF / Nyomtatás"`), ami screen reader-en felolvasódik. Ez rendben van, de következetlen a többi gombhoz képest.

```tsx
<button title="PDF / Nyomtatás">PDF</button>        // title van
<button>Megosztás visszavonása</button>             // szöveges, OK
<button>Megosztás</button>                          // szöveges, OK
<button>Törlés</button>                             // szöveges, OK
```

**Értékelés:** MINOR. A szöveges gombok screen reader-en olvashatók. A `title` attribútum a PDF gombon informatív, nem blokkoló.

### P2-A02 — Hiányzó `aria-expanded` az expand/collapse gombon

**Fájl:** `PreferenceDocumentViewer.tsx`

```tsx
<button type="button" onClick={() => setExpanded(v => !v)}>
  {doc.title_hu}
</button>
```

A gomb toggolja az `expanded` állapotot, de nincs `aria-expanded={expanded}` attribútuma. Screen reader felhasználók nem tudják, hogy a gomb összecsukott vagy kinyitott tartalmat vezérel.

**Fix (ajánlott post-pilot):**
```tsx
<button type="button" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
```

### P2-A03 — Törlés megerősítő `confirm()` dialog

**Fájl:** `PreferenceDocumentViewer.tsx` line 94

```typescript
if (!confirm('Biztosan törlöd ezt a Preferencialapot?')) return
```

`window.confirm()` böngésző natív dialog-ja — keyboard-accessible, de:
- Nem stylable, brand-independent
- Screen reader által felolvasott (ez jó)
- Néhány böngészőben (pl. Chrome extension context) blokkolható

**Értékelés:** Closed pilot számára elfogadható. Post-pilot: custom modal ajánlott.

### P3-A01 — Print popup: popup-blocker

**Fájl:** `PreferenceDocumentViewer.tsx` `handlePrint()`

```typescript
const win = window.open('', '_blank')
if (!win) return
```

`if (!win) return` — csendes failure, a user nem kap visszajelzést, ha a böngésző blokkolta a popup-ot.

**Fix (ajánlott):** toast/alert üzenet, ha `win` null.

### P3-A02 — Megosztott oldal: nincs `<main>` landmark

**Fájl:** `megosztas/[token]/page.tsx`

```tsx
<main className="max-w-2xl mx-auto px-4 py-10">
```

`<main>` landmark van ✅. A többi VK route-on is van `<main>` — rendben.

### P3-A03 — Hiányzó focus management navigáció után

A Next.js App Router alapból nem menedzseli a focus-t oldalváltáskor. Ez ismert Next.js limitáció, nem VK-specifikus. Screen reader felhasználók számára ajánlott `focus()` hívás az `<h1>`-re route váltás után.

---

## 2. UX — Findings

### P2-U01 — Employer opportunity form: nincs kliensoldali validáció

**Fájl:** `munkaltato/lehetosegek/new/page.tsx`

Az opportunity creation form inline Server Action-t használ — a validáció szerveren történik (Zod). Ha a user rossz adatot küld, az oldal újratöltődik hibaüzenettel.

**Probléma:** Nincs kliensoldali validáció (pl. `required` attribútumok, HTML5 validáció). A `description_hu` textarea nem `required`, bár szerveren kötelező.

**Értékelés:** Closed pilot esetén elfogadható (employer-flow korlátozott számú userrel). Post-pilot: React Hook Form vagy HTML5 `required` ajánlott.

### P2-U02 — Nincs redirect mentés után

**Fájl:** `munkaltato/lehetosegek/new/page.tsx`

A form submission után a Server Action `OpportunityActionResult` visszaad, de az oldal nem irányít át az új opportunity management oldalára. A user manuálisan kell, hogy navigáljon.

**Értékelés:** P2 UX. `redirect('/vedett-karrier/munkaltato/lehetosegek/' + data.id)` ajánlott.

### P3-U01 — Loading state: csak `disabled` attribútum

**Fájl:** `PreferenceDocumentViewer.tsx`

```tsx
<button disabled={loading}>Megosztás</button>
```

A `loading` állapot vizuálisan a `disabled` gombon keresztül jelzett — nincs spinner vagy szövegváltozás. Elfogadható, de UX javítható.

### P3-U02 — Preferencialap: nincs explicit "Újragenerálás" flow

Ha a user megváltoztatja a karrierprofil adatait, a már mentett Preferencialap elavulhat. Nincs UI figyelmeztetés ("A profil változott, generáld újra"). Post-pilot feature.

### P3-U03 — Opportunity list: nincs üres állapot

**Fájl:** `lehetosegek/page.tsx`

Ha nincs aktív lehetőség, az oldal üres listát mutat. Nincs "Jelenleg nincs aktív lehetőség" üzenet. Minor UX.

---

## 3. Responsive Design

A Tailwind utility class-ok mobile-first alapon vannak alkalmazva. A `max-w-2xl mx-auto px-4` container pattern konzisztens az összes VK oldalon. Nincs horizontal overflow detektálva a kód auditjából.

---

## 4. Privacy UX — Pozitív találatok

| Elem | Értékelés |
|------|-----------|
| Preferencialap megosztási oldal amber warning banner | ✅ Jó |
| Opportunity detail: "csak neked látható önértékelési eszköz" szöveg | ✅ Jó |
| EMAIL metódus: e-mail cím szövegként jelenik meg (nem href=mailto:) | ✅ Privacy-preserving |
| Share URL: "A munkáltató NEM kap automatikus hozzáférést" | ✅ Jó |
| Opportunity detail: "A Védett Karrier nem közvetíti a profiladatodat" | ✅ Jó |

---

## 5. Összefoglalás

| Kategória | Legfontosabb finding | Severity |
|-----------|---------------------|---------|
| aria-expanded hiánya | `PreferenceDocumentViewer` expand gomb | P2 |
| Kliensoldali validáció hiánya | Employer opportunity form | P2 |
| Redirect mentés után | Employer form success flow | P2 |
| Popup blocker silent failure | PDF print | P3 |
| `window.confirm()` törlés | Post-pilot custom modal | P3 |
| Privacy UX szövegek | Átfogóan jók | ✅ |

**Összítélet:** A rendszer closed pilot számára UX-szempontból READY. Az accessibility hiányok (ARIA) post-pilot fejlesztési listán szerepeljenek. Publikus produkció előtt `aria-expanded` fix ajánlott.
