'use client'
/**
 * Védett Karrier – PreferenceDocumentViewer (Client Component)
 * Sprint 6
 *
 * Megjelenít egy mentett Preferencialapot.
 * PDF export: window.print() – böngésző print dialógusa, nincs npm dependency.
 * Megosztás: shareDocument / unshareDocument server action hívása.
 *
 * KRITIKUS:
 * - NEM küld user adatot munkáltatónak
 * - User explicit dönt a megosztásról
 * - Employer NEM fér hozzá (server-side RLS garantálja)
 */

import { useState } from 'react'
import { shareDocument, unshareDocument, deletePreferenceDocument } from '../../../lib/vedett-karrier/preferencialap/actions'
import type { PreferenceDocumentRow } from '../../../lib/vedett-karrier/types/preferencialap'

interface Props {
  doc: PreferenceDocumentRow
}

export default function PreferenceDocumentViewer({ doc }: Props) {
  const [expanded, setExpanded]       = useState(false)
  const [isShared, setIsShared]       = useState(doc.is_shared)
  const [shareToken, setShareToken]   = useState<string | null>(doc.share_token)
  const [loading, setLoading]         = useState(false)
  const [deleted, setDeleted]         = useState(false)

  if (deleted) return null

  const shareUrl = shareToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/vedett-karrier/preferencialap/megosztas/${shareToken}`
    : null

  // HTML-escape minden user-kontrollált stringet, mielőtt win.document.write()-ba kerül.
  // Nélküle: <script> a title_hu-ban vagy generated_text_hu-ban XSS-t okozna a popup ablakban.
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  const handlePrint = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const safeTitle   = escapeHtml(doc.title_hu)
    const safeDate    = escapeHtml(new Date(doc.updated_at).toLocaleDateString('hu-HU'))
    const safeContent = escapeHtml(doc.generated_text_hu)
    win.document.write(`
      <!DOCTYPE html>
      <html lang="hu">
      <head>
        <meta charset="UTF-8">
        <title>${safeTitle}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 13px; line-height: 1.6; padding: 2cm; color: #1a1a1a; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          .meta { font-size: 11px; color: #666; margin-bottom: 20px; }
          pre { font-family: inherit; white-space: pre-wrap; font-size: 12px; }
          .footer { margin-top: 30px; font-size: 10px; color: #999; border-top: 1px solid #ddd; padding-top: 10px; }
        </style>
      </head>
      <body>
        <h1>${safeTitle}</h1>
        <div class="meta">
          Védett Karrier – Preferencialap &nbsp;|&nbsp; Dátum: ${safeDate}
        </div>
        <pre>${safeContent}</pre>
        <div class="footer">
          Ez a dokumentum kizárólag tájékoztatási célra készült. Nem alkalmassági értékelés.
          A Védett Karrier rendszerből exportálva.
        </div>
      </body>
      </html>
    `)
    win.document.close()
    win.focus()
    win.print()
    win.close()
  }

  const handleShare = async () => {
    setLoading(true)
    const result = await shareDocument(doc.id)
    if (result.ok && result.shareToken) {
      setIsShared(true)
      setShareToken(result.shareToken)
    }
    setLoading(false)
  }

  const handleUnshare = async () => {
    setLoading(true)
    const result = await unshareDocument(doc.id)
    if (result.ok) {
      setIsShared(false)
      setShareToken(null)
    }
    setLoading(false)
  }

  const handleDelete = async () => {
    if (!confirm('Biztosan törlöd ezt a Preferencialapot?')) return
    setLoading(true)
    const result = await deletePreferenceDocument(doc.id)
    if (result.ok) setDeleted(true)
    setLoading(false)
  }

  return (
    <li className="border border-gray-200 rounded-lg p-4 bg-white">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-base font-medium text-gray-900 hover:underline text-left"
          >
            {doc.title_hu}
          </button>
          <div className="text-xs text-gray-400 mt-0.5">
            Frissítve: {new Date(doc.updated_at).toLocaleDateString('hu-HU')} &nbsp;·&nbsp;
            {doc.selected_dimension_codes.length} dimenzió
            {isShared && <span className="ml-2 text-teal-600">● Megosztva</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <button
            type="button"
            onClick={handlePrint}
            className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
            title="PDF / Nyomtatás"
          >
            PDF
          </button>
          {isShared ? (
            <button
              type="button"
              onClick={handleUnshare}
              disabled={loading}
              className="text-xs px-2 py-1 border border-amber-300 text-amber-700 rounded hover:bg-amber-50"
            >
              Megosztás visszavonása
            </button>
          ) : (
            <button
              type="button"
              onClick={handleShare}
              disabled={loading}
              className="text-xs px-2 py-1 border border-teal-400 text-teal-700 rounded hover:bg-teal-50"
            >
              Megosztás
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="text-xs px-2 py-1 border border-red-200 text-red-500 rounded hover:bg-red-50"
          >
            Törlés
          </button>
        </div>
      </div>

      {/* Megosztott link */}
      {isShared && shareUrl && (
        <div className="mt-3 p-2 bg-teal-50 border border-teal-200 rounded text-xs">
          <span className="font-medium text-teal-800">Megosztási link:</span>{' '}
          <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline break-all">
            {shareUrl}
          </a>
          <p className="mt-1 text-teal-600">
            Ez a link bárki számára elérhető, akivel megosztod. A munkáltató NEM kap automatikus hozzáférést.
          </p>
        </div>
      )}

      {/* Szöveg (expandálható) */}
      {expanded && (
        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">
            {doc.generated_text_hu}
          </pre>
        </div>
      )}
    </li>
  )
}
