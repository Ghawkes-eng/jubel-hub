import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { SessionProvider } from './providers'
import { authOptions } from './api/auth/[...nextauth]/route'
import './globals.css'

export const metadata: Metadata = {
  title: 'Jubel Hub',
  description: 'Weekly catch-up and workstream management',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  return (
    <html lang="en">
      <body>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
