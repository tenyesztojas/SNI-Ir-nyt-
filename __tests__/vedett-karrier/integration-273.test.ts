/**
 * Védett Karrier – Task #273 Regression Tests
 *
 * Lefedi:
 * 1. VédettKarrier header link → /vedett-karrier
 * 2. /vedett-karrier/lehetosegek auth nélkül megnyitható (layout nem blokkol)
 * 3. /vedett-karrier/munkakorcsaladok auth nélkül megnyitható
 * 4. /vedett-karrier/munkakorcsaladok/[slug] auth nélkül megnyitható
 * 5. /vedett-karrier/munkaprofil authot kér
 * 6. valid returnTo megtartva
 * 7. external returnTo elutasítva
 * 8. protocol-relative returnTo elutasítva
 * 9. landing primary CTA → Munkaprofil
 * 10. landing nem /vedettmunka route-ra irányít
 *
 * Futtatás: node --experimental-strip-types __tests__/vedett-karrier/integration-273.test.ts
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { sanitizeReturnTo, buildLoginRedirect, DEFAULT_RETURN_TO } from '../../lib/vedett-karrier/returnTo.ts'

// ─────────────────────────────────────────────────────────────────────────────
// 1. Header nav link
// ─────────────────────────────────────────────────────────────────────────────

describe('Header nav link (Test #1)', () => {
  it('VédettKarrier nav href értéke /vedett-karrier', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('components/HeaderClient.tsx', 'utf-8')
    // A vedettmunka key-hez tartozó href /vedett-karrier kell legyen
    assert.match(src, /key:\s*"vedettmunka"[^}]*href:\s*"\/vedett-karrier"/)
  })

  it('Nincs /vedettmunka href a vedettmunka key sorában', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('components/HeaderClient.tsx', 'utf-8')
    // A vedettmunka key-es entry ne mutasson /vedettmunka-ra (csak /vedett-karrier)
    const vedettmunkaKeyLine = src
      .split('\n')
      .find(line => line.includes('key: "vedettmunka"'))
    assert.ok(vedettmunkaKeyLine, 'vedettmunka key sor megtalálható')
    assert.ok(
      !vedettmunkaKeyLine.includes('href: "/vedettmunka"'),
      'href nem /vedettmunka'
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2–4. Layout nem blokkol publikus oldalakat
// ─────────────────────────────────────────────────────────────────────────────

describe('Layout nem tartalmaz auth redirect-et (Test #2–4)', () => {
  it('layout.tsx nem hív redirect()-et', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('app/vedett-karrier/layout.tsx', 'utf-8')
    assert.ok(
      !src.includes("redirect('"),
      'layout.tsx nem tartalmaz redirect() hívást'
    )
  })

  it('layout.tsx nem importálja a next/navigation redirect-et', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('app/vedett-karrier/layout.tsx', 'utf-8')
    assert.ok(
      !src.includes("from 'next/navigation'"),
      'layout.tsx nem importál next/navigation-t'
    )
  })

  it('layout.tsx nem importálja a supabase createClient-et', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('app/vedett-karrier/layout.tsx', 'utf-8')
    assert.ok(
      !src.includes('createClient'),
      'layout.tsx nem tartalmaz supabase kliens hívást'
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Privát page saját authot kér
// ─────────────────────────────────────────────────────────────────────────────

describe('Privát page-ek saját auth guard-dal (Test #5)', () => {
  it('munkaprofil/page.tsx tartalmaz redirect-et auth nélküli esetben', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('app/vedett-karrier/munkaprofil/page.tsx', 'utf-8')
    assert.match(src, /redirect\(.*belepes/)
  })

  it('kepessegek/page.tsx tartalmaz redirect-et', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('app/vedett-karrier/kepessegek/page.tsx', 'utf-8')
    assert.match(src, /redirect\(.*belepes/)
  })

  it('karrieriranytu/page.tsx tartalmaz redirect-et', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('app/vedett-karrier/karrieriranytu/page.tsx', 'utf-8')
    assert.match(src, /redirect\(.*belepes/)
  })

  it('preferencialap/page.tsx redirect a helyes /belepes route-ra mutat', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('app/vedett-karrier/preferencialap/page.tsx', 'utf-8')
    // Nem /bejelentkezes (hibás régi path), hanem /belepes
    assert.match(src, /redirect\(.*\/belepes/)
    assert.ok(!src.includes("redirect('/bejelentkezes')"), 'Nem tartalmaz elavult /bejelentkezes redirect-et')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Valid returnTo megtartva (sanitizeReturnTo)
// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizeReturnTo: valid belső URL megtartva (Test #6)', () => {
  it('/vedett-karrier/preferencialap → változatlan', () => {
    assert.equal(sanitizeReturnTo('/vedett-karrier/preferencialap'), '/vedett-karrier/preferencialap')
  })

  it('/vedett-karrier/munkakorcsaladok/adminisztrativ → változatlan', () => {
    assert.equal(
      sanitizeReturnTo('/vedett-karrier/munkakorcsaladok/adminisztrativ'),
      '/vedett-karrier/munkakorcsaladok/adminisztrativ'
    )
  })

  it('/vedett-karrier/kompatibilitas/some-uuid → változatlan', () => {
    assert.equal(
      sanitizeReturnTo('/vedett-karrier/kompatibilitas/abc-123'),
      '/vedett-karrier/kompatibilitas/abc-123'
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. External returnTo elutasítva
// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizeReturnTo: external URL elutasítva (Test #7)', () => {
  it('https://evil.example → fallback', () => {
    assert.equal(sanitizeReturnTo('https://evil.example'), DEFAULT_RETURN_TO)
  })

  it('http://evil.example → fallback', () => {
    assert.equal(sanitizeReturnTo('http://evil.example'), DEFAULT_RETURN_TO)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. Protocol-relative returnTo elutasítva
// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizeReturnTo: protocol-relative és egyéb bypass elutasítva (Test #8)', () => {
  it('//evil.example → fallback', () => {
    assert.equal(sanitizeReturnTo('//evil.example'), DEFAULT_RETURN_TO)
  })

  it('javascript:alert(1) → fallback', () => {
    assert.equal(sanitizeReturnTo('javascript:alert(1)'), DEFAULT_RETURN_TO)
  })

  it('data:text/html,... → fallback', () => {
    assert.equal(sanitizeReturnTo('data:text/html,<script>alert(1)</script>'), DEFAULT_RETURN_TO)
  })

  it('\\evil.example → fallback', () => {
    assert.equal(sanitizeReturnTo('\\evil.example'), DEFAULT_RETURN_TO)
  })

  it('üres string → fallback', () => {
    assert.equal(sanitizeReturnTo(''), DEFAULT_RETURN_TO)
  })

  it('undefined → fallback', () => {
    assert.equal(sanitizeReturnTo(undefined), DEFAULT_RETURN_TO)
  })

  it('nem-vedett-karrier belső path → fallback (pl. /admin)', () => {
    assert.equal(sanitizeReturnTo('/admin'), DEFAULT_RETURN_TO)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. Landing primary CTA → Munkaprofil
// ─────────────────────────────────────────────────────────────────────────────

describe('Landing page primary CTA (Test #9)', () => {
  it('landing page.tsx tartalmazza a /vedett-karrier/munkaprofil CTA-t', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('app/vedett-karrier/page.tsx', 'utf-8')
    assert.match(src, /href="\/vedett-karrier\/munkaprofil"/)
  })

  it('landing primary CTA szövege Munkaprofil-ra utal', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('app/vedett-karrier/page.tsx', 'utf-8')
    assert.match(src, /Munkaprofilomat|Munkaprofilom/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. Landing nem /vedettmunka route-ra irányít
// ─────────────────────────────────────────────────────────────────────────────

describe('Landing nem mutat /vedettmunka CTA-ra (Test #10)', () => {
  it('landing page.tsx primary CTA-ban nincs /vedettmunka/allasok', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('app/vedett-karrier/page.tsx', 'utf-8')
    assert.ok(!src.includes('href="/vedettmunka/allasok"'), 'nincs /vedettmunka/allasok CTA')
  })

  it('landing page.tsx primary CTA-ban nincs /vedettmunka/munkaltatok', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('app/vedett-karrier/page.tsx', 'utf-8')
    assert.ok(!src.includes('href="/vedettmunka/munkaltatok"'), 'nincs /vedettmunka/munkaltatok CTA')
  })

  it('landing page.tsx primary CTA-ban nincs /vedettmunka/oneletrajz', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('app/vedett-karrier/page.tsx', 'utf-8')
    assert.ok(!src.includes('href="/vedettmunka/oneletrajz"'), 'nincs /vedettmunka/oneletrajz CTA')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildLoginRedirect
// ─────────────────────────────────────────────────────────────────────────────

describe('buildLoginRedirect helper', () => {
  it('valid path → /belepes?next=<encoded>', () => {
    const result = buildLoginRedirect('/vedett-karrier/preferencialap')
    assert.equal(result, '/belepes?next=%2Fvedett-karrier%2Fpreferencialap')
  })

  it('invalid path → fallback encode-olva', () => {
    const result = buildLoginRedirect('https://evil.example')
    assert.equal(result, `/belepes?next=${encodeURIComponent(DEFAULT_RETURN_TO)}`)
  })
})
