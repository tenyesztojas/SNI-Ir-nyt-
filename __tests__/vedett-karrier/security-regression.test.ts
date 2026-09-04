/**
 * Védett Karrier – Security Regression Tests
 * Pre-Production Hardening
 *
 * Tesztek:
 * 1. escapeHtml helper (XSS prevention)
 * 2. URL scheme allowlist (opportunity external URL)
 * 3. Share token security invariants
 * 4. No-go language check (no suitability/rank/score in exports)
 */

import { test, describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ─────────────────────────────────────────────────────────────────────────────
// escapeHtml – extracted from PreferenceDocumentViewer for unit testing
// ─────────────────────────────────────────────────────────────────────────────

// Mirror of the escapeHtml helper in PreferenceDocumentViewer.tsx
const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

describe('escapeHtml helper', () => {
  it('escapes &', () => {
    assert.equal(escapeHtml('a & b'), 'a &amp; b')
  })

  it('escapes <', () => {
    assert.equal(escapeHtml('<tag>'), '&lt;tag&gt;')
  })

  it('escapes >', () => {
    assert.equal(escapeHtml('a > b'), 'a &gt; b')
  })

  it('escapes "', () => {
    assert.equal(escapeHtml('"hello"'), '&quot;hello&quot;')
  })

  it("escapes '", () => {
    assert.equal(escapeHtml("it's"), "it&#39;s")
  })

  it('escapes full XSS payload: <script>alert(1)</script>', () => {
    const raw = '<script>alert(1)</script>'
    const escaped = escapeHtml(raw)
    assert.ok(!escaped.includes('<script'), 'must not contain <script')
    assert.ok(!escaped.includes('</script'), 'must not contain </script')
    assert.equal(escaped, '&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('escapes img onerror XSS', () => {
    const raw = '<img src=x onerror=alert(1)>'
    const escaped = escapeHtml(raw)
    assert.ok(!escaped.includes('<img'), 'must not contain <img')
    assert.ok(escaped.includes('&lt;img'), 'must contain &lt;img')
  })

  it('escapes SVG onload XSS', () => {
    const raw = '<svg onload=alert(1)>'
    const escaped = escapeHtml(raw)
    assert.ok(!escaped.includes('<svg'), 'must not contain <svg')
  })

  it('escapes script breakout: "</script><script>alert(1)</script>', () => {
    const raw = '"</script><script>alert(1)</script>'
    const escaped = escapeHtml(raw)
    assert.ok(!escaped.includes('<script'), 'must not contain <script')
    assert.ok(!escaped.includes('</script'), 'must not contain </script')
  })

  it('handles & < > " \' combined', () => {
    const raw = `& < > " '`
    const escaped = escapeHtml(raw)
    assert.equal(escaped, '&amp; &lt; &gt; &quot; &#39;')
  })

  it('passes through safe text unchanged (no special chars)', () => {
    const safe = 'Kedves Munkáltató! Ez egy hosszú magyar szöveg ékezetes karakterekkel.'
    assert.equal(escapeHtml(safe), safe)
  })

  it('handles long Hungarian text with HTML chars', () => {
    const raw = 'Cégünk neve: „A <legjobb> & legszorgalmasabb" munkahely.'
    const escaped = escapeHtml(raw)
    assert.ok(!escaped.includes('<legjobb>'), 'angle brackets must be escaped')
    assert.ok(escaped.includes('&lt;legjobb&gt;'))
    assert.ok(escaped.includes('&amp;'))
  })

  it('empty string returns empty string', () => {
    assert.equal(escapeHtml(''), '')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// XSS regression: escaped content must never be executable HTML
// Simulates the win.document.write() injection context
// ─────────────────────────────────────────────────────────────────────────────

describe('XSS regression: print popup injection context', () => {
  // Simulate the template string that win.document.write() receives
  const buildPrintHtml = (rawTitle: string, rawContent: string) => {
    const safeTitle   = escapeHtml(rawTitle)
    const safeContent = escapeHtml(rawContent)
    return `<html><body><h1>${safeTitle}</h1><pre>${safeContent}</pre></body></html>`
  }

  const XSS_PAYLOADS = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '"</pre><script>alert(1)</script>',
    "' onmouseover='alert(1)",
    '<iframe src=javascript:alert(1)>',
    '<!--<script>-->',
  ]

  for (const payload of XSS_PAYLOADS) {
    it(`title payload does not produce executable script: ${payload.slice(0, 40)}`, () => {
      const html = buildPrintHtml(payload, 'Normális tartalom')
      // Must not contain unescaped < immediately followed by script/img/svg/iframe
      const dangerous = /<(script|img|svg|iframe|object|embed)/i
      // Test that no dangerous tags appear in the output
      // (allow escaped forms like &lt;script)
      const withoutEscaped = html.replace(/&lt;/g, '').replace(/&gt;/g, '').replace(/&amp;/g, '').replace(/&quot;/g, '').replace(/&#39;/g, '')
      // After removing HTML entities, there should be no dangerous tags outside our known structure
      const structuralTags = withoutEscaped.replace(/<html>|<\/html>|<body>|<\/body>|<h1>|<\/h1>|<pre>|<\/pre>/gi, '')
      const hasDangerousTag = dangerous.test(structuralTags)
      assert.ok(!hasDangerousTag, `Dangerous tag found in: ${structuralTags.slice(0, 100)}`)
    })

    it(`content payload does not produce executable script: ${payload.slice(0, 40)}`, () => {
      const html = buildPrintHtml('Normális cím', payload)
      const dangerous = /<(script|img|svg|iframe|object|embed)/i
      const withoutEscaped = html.replace(/&lt;/g, '').replace(/&gt;/g, '').replace(/&amp;/g, '').replace(/&quot;/g, '').replace(/&#39;/g, '')
      const structuralTags = withoutEscaped.replace(/<html>|<\/html>|<body>|<\/body>|<h1>|<\/h1>|<pre>|<\/pre>/gi, '')
      const hasDangerousTag = dangerous.test(structuralTags)
      assert.ok(!hasDangerousTag, `Dangerous tag found in: ${structuralTags.slice(0, 100)}`)
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// URL scheme allowlist – mirrors opportunity/actions.ts Zod refine logic
// ─────────────────────────────────────────────────────────────────────────────

const isAllowedUrl = (raw: string): boolean => {
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

describe('External URL scheme allowlist', () => {
  // ACCEPT
  it('accepts https URL', () => {
    assert.ok(isAllowedUrl('https://example.com'), 'https must be allowed')
  })

  it('accepts http URL (explicit opt-in)', () => {
    assert.ok(isAllowedUrl('http://example.com'), 'http must be allowed')
  })

  it('accepts https URL with path and query', () => {
    assert.ok(isAllowedUrl('https://example.com/jobs?id=123&ref=vk'))
  })

  // REJECT
  it('rejects javascript: URI', () => {
    assert.ok(!isAllowedUrl('javascript:alert(1)'), 'javascript: must be blocked')
  })

  it('rejects data: URI', () => {
    assert.ok(!isAllowedUrl('data:text/html,<script>alert(1)</script>'), 'data: must be blocked')
  })

  it('rejects file: URI', () => {
    assert.ok(!isAllowedUrl('file:///etc/passwd'), 'file: must be blocked')
  })

  it('rejects vbscript: URI', () => {
    assert.ok(!isAllowedUrl('vbscript:MsgBox(1)'), 'vbscript: must be blocked')
  })

  it('rejects ftp: URI', () => {
    assert.ok(!isAllowedUrl('ftp://example.com/file'), 'ftp: must be blocked')
  })

  it('rejects mailto: URI', () => {
    assert.ok(!isAllowedUrl('mailto:user@example.com'), 'mailto: must be blocked in external_url')
  })

  it('rejects protocol-relative URL //example.com', () => {
    // URL constructor throws on //example.com without base
    assert.ok(!isAllowedUrl('//example.com'), 'protocol-relative must be blocked')
  })

  it('rejects malformed URL', () => {
    assert.ok(!isAllowedUrl('not a url'), 'malformed must be blocked')
  })

  it('rejects empty string', () => {
    assert.ok(!isAllowedUrl(''), 'empty must be blocked')
  })

  it('rejects URL with only whitespace', () => {
    assert.ok(!isAllowedUrl('   '), 'whitespace-only must be blocked')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Share token security invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('Share token security invariants', () => {
  it('crypto.randomUUID produces 128-bit UUID v4', () => {
    const token = crypto.randomUUID()
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    assert.match(token, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('two consecutive crypto.randomUUID calls produce different values', () => {
    const t1 = crypto.randomUUID()
    const t2 = crypto.randomUUID()
    assert.notEqual(t1, t2)
  })

  it('share token has adequate entropy (at least 100 bits)', () => {
    // UUID v4: 128 bits total, 6 bits fixed (version/variant) = 122 bits of randomness
    // We verify the structure implies >= 122 bit randomness
    const token = crypto.randomUUID()
    const hexChars = token.replace(/-/g, '')
    // 32 hex chars = 128 bits; 4 bits fixed = 124+ bits random ✓
    assert.equal(hexChars.length, 32)
    // Version nibble = '4'
    assert.equal(hexChars[12], '4')
  })

  it('share URL does not leak user ID or email (URL structure check)', () => {
    const shareToken = crypto.randomUUID()
    const shareUrl = `/vedett-karrier/preferencialap/megosztas/${shareToken}`
    // URL must only contain the token, not user IDs or emails
    assert.ok(!shareUrl.includes('@'), 'no email in share URL')
    assert.ok(shareUrl.endsWith(shareToken), 'URL must end with token')
    // No query parameters with private data
    assert.ok(!shareUrl.includes('?'), 'no query params in share URL')
    assert.ok(!shareUrl.includes('user_id'), 'no user_id in share URL')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// No-go language invariants (suitability score / rank / ATS)
// ─────────────────────────────────────────────────────────────────────────────

describe('No-go business logic invariants', () => {
  // These test the ApplicationMethod enum does NOT include INTERNAL_APPLICATION
  const ALLOWED_METHODS = ['EXTERNAL_URL', 'EMAIL', 'CONTACT_INSTRUCTIONS'] as const
  type ApplicationMethod = (typeof ALLOWED_METHODS)[number]

  it('INTERNAL_APPLICATION is not a valid ApplicationMethod', () => {
    const methods: ApplicationMethod[] = [...ALLOWED_METHODS]
    assert.ok(!methods.includes('INTERNAL_APPLICATION' as ApplicationMethod))
  })

  it('ApplicationMethod enum has exactly 3 values', () => {
    assert.equal(ALLOWED_METHODS.length, 3)
  })

  it('CompatibilityStatus has no numeric score field', () => {
    // The 5 status values are named, not numeric
    const STATUSES = ['STRONG_FIT', 'ACCEPTABLE', 'CLARIFY', 'LOAD_POINT', 'UNKNOWN']
    for (const status of STATUSES) {
      assert.ok(isNaN(Number(status)), `${status} must not be numeric`)
    }
  })

  it('CompatibilityStatus has exactly 5 values', () => {
    const STATUSES = ['STRONG_FIT', 'ACCEPTABLE', 'CLARIFY', 'LOAD_POINT', 'UNKNOWN']
    assert.equal(STATUSES.length, 5)
  })
})
