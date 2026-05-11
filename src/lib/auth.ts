import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }: any) {
      if (account && account.access_token) {
        token.gToken = account.access_token
      }
      return token
    },
    async session({ session, token }: any) {
      try {
        if (session && session.user && session.user.email) {
          await supabase.from('users').upsert({
            email: session.user.email,
            name: session.user.name,
            image: session.user.image,
            google_id: token.sub,
          }, { onConflict: 'email' })
        }
      } catch (_) {}
      if (session && session.user) {
        session.user.gToken = token.gToken
      }
      return session
    },
    async signIn({ profile }: any) {
      const email = profile && profile.email ? profile.email : ''
      return email.endsWith('@jubelbeer.com') || email === 'george@jubelbeer.com'
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
}
