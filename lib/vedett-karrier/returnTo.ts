/**
 * Védett Karrier – Safe returnTo / next param utility
 *
 * Biztosítja, hogy ?next= paraméter alapú redirect nem mutathat
 * külső URL-re (open redirect védelem).
 *
 * Elfogadott: belső relatív URL, amely /vedett-karrier/-rel kezdődik.
 * Elutasított: http://, https://, //, javascript:, data:, \, üres string, külső domének.
 *
 * Használat a /belepes (login) oldalon:
 *   const next = sanitizeReturnTo(searchParams.next)
 *   redirect(next)
 */

/** Fallback ha nincs valid returnTo */
export const DEFAULT_RETURN_TO = '/vedett-karrier/munkaprofil'

/**
 * Validálja és sanitizálja a returnTo értéket.
 * Ha nem érvényes belső relative URL → DEFAULT_RETURN_TO-t ad vissza.
 *
 * @param raw - A ?next= paraméter értéke (untrusted)
 * @returns Biztonságos belső relatív URL
 */
export function sanitizeReturnTo(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    return DEFAULT_RETURN_TO
  }

  const trimmed = raw.trim()

  // Tiltott: protokollt tartalmazó URL-ek
  // http://, https://, javascript:, data:, stb.
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/i.test(trimmed)) {
    return DEFAULT_RETURN_TO
  }

  // Tiltott: protocol-relative URL (//)
  if (trimmed.startsWith('//')) {
    return DEFAULT_RETURN_TO
  }

  // Tiltott: backslash-alapú bypass (\evil.example)
  if (trimmed.startsWith('\\')) {
    return DEFAULT_RETURN_TO
  }

  // Csak /vedett-karrier/-rel kezdődő belső path fogadható el
  // (kibővíthető más belső prefix-szel ha szükséges)
  if (!trimmed.startsWith('/vedett-karrier')) {
    return DEFAULT_RETURN_TO
  }

  // Tiltott: path traversal
  if (trimmed.includes('..')) {
    return DEFAULT_RETURN_TO
  }

  // Max hossz korlátozás
  if (trimmed.length > 512) {
    return DEFAULT_RETURN_TO
  }

  return trimmed
}

/**
 * Összeállítja a /belepes?next=... redirect URL-t.
 * A next értéket encodeURIComponent-tel kódolja.
 */
export function buildLoginRedirect(intendedPath: string): string {
  const safe = sanitizeReturnTo(intendedPath)
  return `/belepes?next=${encodeURIComponent(safe)}`
}
