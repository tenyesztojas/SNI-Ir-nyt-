import type { ReactNode } from 'react'

export const metadata = {
  title: { template: '%s – Védett Karrier', default: 'Védett Karrier' },
  description: 'Munkakörnyezeti preferenciaprofil és karriertámogatás.',
}

/**
 * Védett Karrier gyökér layout.
 *
 * Auth-ellenőrzés NINCS itt — minden privát page saját redirect()-et tartalmaz
 * a helyes ?next= paraméterrel. Ez lehetővé teszi, hogy publikus oldalak
 * (/vedett-karrier, /lehetosegek, /munkakorcsaladok) auth nélkül elérhetők legyenek.
 *
 * Publikus route-ok (auth nélkül elérhetők):
 *   /vedett-karrier
 *   /vedett-karrier/lehetosegek
 *   /vedett-karrier/lehetosegek/[id]
 *   /vedett-karrier/munkakorcsaladok
 *   /vedett-karrier/munkakorcsaladok/[slug]
 *   /vedett-karrier/preferencialap/megosztas/[token]
 *
 * Privát route-ok (saját page-szintű auth guard-dal):
 *   /vedett-karrier/munkaprofil
 *   /vedett-karrier/kepessegek
 *   /vedett-karrier/karrieriranytu
 *   /vedett-karrier/preferencialap
 *   /vedett-karrier/kompatibilitas/[jobRoleId]
 *   /vedett-karrier/munkaltato/*
 */
export default function VedettKarrierLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-sni-brand-navy py-2 text-center text-xs font-semibold tracking-wide text-sni-brand-teal">
        Védett Karrier — munkakörnyezeti preferenciaprofil
      </div>
      {children}
    </div>
  )
}
