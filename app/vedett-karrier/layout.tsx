import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ReactNode } from 'react'

export const metadata = {
  title: { template: '%s – Védett Karrier', default: 'Védett Karrier' },
  description: 'Munkakörnyezeti preferenciaprofil és karriertámogatás.',
}

export default async function VedettKarrierLayout({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/belepes?next=/vedett-karrier/munkaprofil')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-sni-brand-navy py-2 text-center text-xs font-semibold tracking-wide text-sni-brand-teal">
        Védett Karrier — munkakörnyezeti preferenciaprofil
      </div>
      {children}
    </div>
  )
}
