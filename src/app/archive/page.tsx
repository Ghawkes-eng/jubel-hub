'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import AppNav from '@/components/layout/AppNav'

export default function ArchivePage() {
  const { status } = useSession()
  const router = useRouter()
  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])

  return (
    <AppNav>
      <div className="text-center py-16 text-muted">
        <div className="text-3xl mb-3">📂</div>
        <div className="font-semibold text-lg mb-2">Archive</div>
        <p className="text-sm">Past catch-ups will appear here once you complete your first Weekly Agenda meeting.</p>
      </div>
    </AppNav>
  )
}
