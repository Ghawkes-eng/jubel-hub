'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import Image from 'next/image'

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID || '1WVmXCL9mf7zLCT-gRtBCyUu9A7xLlPikkJ5lYYsbuXc'

const TABS = [
  { href:'/notes',       label:'Notes'         },
  { href:'/workstreams', label:'Workstreams'    },
  { href:'/agenda',      label:'Weekly Agenda'  },
  { href:'/actions',     label:'Actions'        },
  { href:'/archive',     label:'Archive'        },
]

export default function AppNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F5]">
      {/* Top nav — Jubel black */}
      <nav style={{background:'#111111'}} className="flex items-stretch px-4 gap-0 sticky top-0 z-20 shadow-sm">
        {/* Logo */}
        <div className="flex items-center pr-5 mr-1 border-r border-white/10">
          <div className="flex items-center gap-2">
            <span style={{color:'#F4631E', fontSize:20}}>🍺</span>
            <span className="text-white font-black text-sm tracking-wide">JUBEL HUB</span>
          </div>
        </div>

        {/* Tabs */}
        {TABS.map(t => {
          const active = pathname.startsWith(t.href)
          return (
            <Link key={t.href} href={t.href}
              className="px-4 py-3.5 text-sm font-medium transition-colors whitespace-nowrap no-underline"
              style={{
                color: active ? '#F4631E' : '#999999',
                borderBottom: `2px solid ${active ? '#F4631E' : 'transparent'}`,
              }}>
              {t.label}
            </Link>
          )
        })}

        <div className="flex-1" />

        {/* Quick links */}
        <a href={`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`}
          target="_blank" rel="noreferrer"
          className="text-[#666] text-xs flex items-center px-3 hover:text-white transition-colors no-underline">
          📊 Sheet
        </a>
        <a href="https://drive.google.com/drive/folders/14nv5jcuScSZ_0BkZJ5piaz6_0S2nVQFi"
          target="_blank" rel="noreferrer"
          className="text-[#666] text-xs flex items-center px-3 hover:text-white transition-colors no-underline">
          📁 Drive
        </a>

        {/* User */}
        {session?.user && (
          <div className="flex items-center gap-2 pl-3 border-l border-white/10 ml-2">
            {session.user.image && (
              <Image src={session.user.image} alt="" width={26} height={26} className="rounded-full" />
            )}
            <button onClick={() => signOut()}
              className="text-[#666] text-xs hover:text-white transition-colors cursor-pointer bg-transparent border-none">
              Sign out
            </button>
          </div>
        )}
      </nav>

      {/* Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-6">
        {children}
      </main>
    </div>
  )
}
