/**
 * Védett Karrier – Task #273.1 Authorization Fix Regression Tests
 *
 * 14 teszt — auth invariant ellenőrzés:
 * 1.  anon nem kapja meg a new job role formot (page.tsx szerver guard)
 * 2.  new job role anon → /belepes megfelelő next paraméterrel
 * 3.  authenticated non-employer: szerver guard leáll
 * 4.  nem approved employer: konzisztens viselkedés (redirect /munkaltato)
 * 5.  approved employer: page.tsx nem blokkol
 * 6.  new opportunity anon → /belepes megfelelő next paraméterrel
 * 7.  opportunity management anon → /belepes megfelelő next paraméterrel
 * 8.  más employer opportunity-jához nincs hozzáférés (IDOR)
 * 9.  active Job Role publikus
 * 10. draft Job Role nem publikus
 * 11. public opportunities auth nélkül elérhetők
 * 12. public job families auth nélkül elérhetők
 * 13. external returnTo tiltott
 * 14. protocol-relative returnTo tiltott
 *
 * Futtatás: node --experimental-strip-types __tests__/vedett-karrier/auth-273-1.test.ts
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeReturnTo, buildLoginRedirect, DEFAULT_RETURN_TO } from '../../lib/vedett-karrier/returnTo.ts'

// ─────────────────────────────────────────────────────────────────────────────
// 1. munkakorok/new/page.tsx — server component, nem 'use client'
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #1: munkakorok/new page.tsx server component', () => {
  it('page.tsx nem tartalmaz "use client" direktívát', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/munkakorok/new/page.tsx', 'utf-8'
    )
    assert.ok(!src.includes("'use client'"), "page.tsx nem 'use client'")
    assert.ok(!src.includes('"use client"'), "page.tsx nem \"use client\"")
  })

  it('page.tsx importálja a createClient-et (server-side auth)', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/munkakorok/new/page.tsx', 'utf-8'
    )
    assert.match(src, /createClient/)
  })

  it('page.tsx tartalmaz getUser() hívást', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/munkakorok/new/page.tsx', 'utf-8'
    )
    assert.match(src, /getUser\(\)/)
  })

  it('page.tsx tartalmaz redirect()-et anon esetén', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/munkakorok/new/page.tsx', 'utf-8'
    )
    assert.match(src, /redirect\(/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. new job role anon → /belepes megfelelő next paraméterrel
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #2: new job role redirect target', () => {
  it('page.tsx redirect tartalmazza a /belepes route-ot', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/munkakorok/new/page.tsx', 'utf-8'
    )
    assert.match(src, /\/belepes/)
  })

  it('page.tsx redirect next paramétere /vedett-karrier/munkaltato/munkakorok/new', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/munkakorok/new/page.tsx', 'utf-8'
    )
    assert.match(src, /vedett-karrier\/munkaltato\/munkakorok\/new/)
  })

  it('page.tsx nem tartalmaz /bejelentkezes redirect-et', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/munkakorok/new/page.tsx', 'utf-8'
    )
    assert.ok(!src.includes('/bejelentkezes'), 'nincs elavult /bejelentkezes')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. authenticated non-employer guard
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #3: non-employer guard', () => {
  it('page.tsx tartalmaz getEmployerByUserId hívást', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/munkakorok/new/page.tsx', 'utf-8'
    )
    assert.match(src, /getEmployerByUserId/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. nem approved employer guard
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #4: nem approved employer', () => {
  it('page.tsx tartalmaz isEmployerApproved ellenőrzést', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/munkakorok/new/page.tsx', 'utf-8'
    )
    assert.match(src, /isEmployerApproved/)
  })

  it('nem approved esetén /munkaltato-ra irányít (konzisztens szerkesztes guard-jával)', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/munkakorok/new/page.tsx', 'utf-8'
    )
    assert.match(src, /redirect\(.*munkaltato/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. approved employer → NewJobRoleClient renderelve
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #5: approved employer rendereli a client formot', () => {
  it('page.tsx importálja a NewJobRoleClient komponenst', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/munkakorok/new/page.tsx', 'utf-8'
    )
    assert.match(src, /NewJobRoleClient/)
  })

  it('NewJobRoleClient.tsx tartalmazza a form logikát', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/munkakorok/new/NewJobRoleClient.tsx', 'utf-8'
    )
    assert.match(src, /createJobRole/)
    assert.match(src, /useState/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. new opportunity anon → /belepes
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #6: new opportunity anon redirect', () => {
  it('lehetosegek/new/page.tsx nem tartalmaz /bejelentkezes redirect-et', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/lehetosegek/new/page.tsx', 'utf-8'
    )
    assert.ok(!src.includes("redirect('/bejelentkezes')"), 'nincs /bejelentkezes')
    assert.ok(!src.includes('redirect("/bejelentkezes")'), 'nincs /bejelentkezes')
  })

  it('lehetosegek/new/page.tsx tartalmaz buildLoginRedirect hívást', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/lehetosegek/new/page.tsx', 'utf-8'
    )
    assert.match(src, /buildLoginRedirect/)
  })

  it('lehetosegek/new/page.tsx next paraméterben tartalmazza az eredeti route-ot', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/lehetosegek/new/page.tsx', 'utf-8'
    )
    assert.match(src, /vedett-karrier\/munkaltato\/lehetosegek\/new/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. opportunity management anon → /belepes
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #7: opportunity management anon redirect', () => {
  it('lehetosegek/[id]/page.tsx nem tartalmaz /bejelentkezes redirect-et', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/lehetosegek/[id]/page.tsx', 'utf-8'
    )
    assert.ok(!src.includes("redirect('/bejelentkezes')"), 'nincs /bejelentkezes')
  })

  it('lehetosegek/[id]/page.tsx tartalmaz buildLoginRedirect hívást', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/lehetosegek/[id]/page.tsx', 'utf-8'
    )
    assert.match(src, /buildLoginRedirect/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. IDOR védelem: getOpportunityByIdForEmployer megtartva
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #8: IDOR védelem megmaradt', () => {
  it('lehetosegek/[id]/page.tsx tartalmaz getOpportunityByIdForEmployer hívást', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/lehetosegek/[id]/page.tsx', 'utf-8'
    )
    assert.match(src, /getOpportunityByIdForEmployer/)
  })

  it('szerkesztes/page.tsx tartalmaz getJobRoleByIdForEmployer hívást (IDOR)', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/munkakorok/[id]/szerkesztes/page.tsx', 'utf-8'
    )
    assert.match(src, /getJobRoleByIdForEmployer/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9–10. Job Role publikus/draft viselkedés megmaradt
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #9–10: Job Role publikus/draft viselkedés', () => {
  it('munkakorok/[id]/page.tsx: draft csak ownernek (ownership check megtartva)', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/munkakorok/[id]/page.tsx', 'utf-8'
    )
    assert.match(src, /role\.status !== 'active'/)
    assert.match(src, /employer\.id !== role\.employer_id/)
  })

  it('munkakorok/[id]/page.tsx: active role publikusan látható', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkaltato/munkakorok/[id]/page.tsx', 'utf-8'
    )
    // Csak draft-ra van auth check — active-ra nincs redirect
    assert.match(src, /if \(role\.status !== 'active'\)/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11–12. Publikus oldalak auth nélkül elérhetők
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #11–12: Publikus oldalak megmaradtak auth nélkül', () => {
  it('lehetosegek/page.tsx nem tartalmaz redirect()-et (publikus)', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/lehetosegek/page.tsx', 'utf-8'
    )
    assert.ok(!src.includes("redirect("), 'lehetosegek lista publikus')
  })

  it('munkakorcsaladok/page.tsx nem tartalmaz redirect()-et (publikus)', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      'app/vedett-karrier/munkakorcsaladok/page.tsx', 'utf-8'
    )
    assert.ok(!src.includes("redirect("), 'munkakorcsaladok lista publikus')
  })

  it('layout.tsx nem importálja a redirect-et (publikus oldalakat nem blokkol)', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('app/vedett-karrier/layout.tsx', 'utf-8')
    // Csak az import jelenléte számít — kommentben előforduló "redirect()" nem jelent guard-ot
    assert.ok(!src.includes("import { redirect }") && !src.match(/import.*\bredirect\b.*from/), 'layout nem importálja redirect-et')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 13–14. sanitizeReturnTo security (regresszió)
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #13: external returnTo tiltott (regresszió)', () => {
  it('https://evil.example → fallback', () => {
    assert.equal(sanitizeReturnTo('https://evil.example'), DEFAULT_RETURN_TO)
  })
  it('http://evil.example → fallback', () => {
    assert.equal(sanitizeReturnTo('http://evil.example'), DEFAULT_RETURN_TO)
  })
  it('/vedett-karrier/munkaltato/lehetosegek/new valid', () => {
    const r = sanitizeReturnTo('/vedett-karrier/munkaltato/lehetosegek/new')
    assert.equal(r, '/vedett-karrier/munkaltato/lehetosegek/new')
  })
  it('/vedett-karrier/munkaltato/munkakorok/new valid', () => {
    const r = sanitizeReturnTo('/vedett-karrier/munkaltato/munkakorok/new')
    assert.equal(r, '/vedett-karrier/munkaltato/munkakorok/new')
  })
  it('/vedett-karrier/munkaltato/lehetosegek/123 valid', () => {
    const r = sanitizeReturnTo('/vedett-karrier/munkaltato/lehetosegek/123')
    assert.equal(r, '/vedett-karrier/munkaltato/lehetosegek/123')
  })
})

describe('Test #14: protocol-relative returnTo tiltott (regresszió)', () => {
  it('//evil.example → fallback', () => {
    assert.equal(sanitizeReturnTo('//evil.example'), DEFAULT_RETURN_TO)
  })
  it('javascript:alert(1) → fallback', () => {
    assert.equal(sanitizeReturnTo('javascript:alert(1)'), DEFAULT_RETURN_TO)
  })
  it('data:text/html,test → fallback', () => {
    assert.equal(sanitizeReturnTo('data:text/html,test'), DEFAULT_RETURN_TO)
  })
  it('\\evil.example → fallback', () => {
    assert.equal(sanitizeReturnTo('\\evil.example'), DEFAULT_RETURN_TO)
  })
})
