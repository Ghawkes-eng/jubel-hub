import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from './api/auth/[...nextauth]/route'
import SignInPage from './auth/signin/page'

export default async function Home() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/notes')
  return <SignInPage />
}
