import NextAuth, { NextAuthOptions } from 'next-auth'
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
          scope: [
            'openid', 'email', 'profile',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.compose',
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/spreadsheets',
          ].join(' '),
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }: any) {
      if (account) {
        token.googleToken = account.access_token
        token.googleId = profile?.sub
      }
      return token
    },
    async session({ session, token }: any) {
      // Upsert user — wrapped so any error never breaks the session
      try {
        if (session?.user?.email) {
          await supabase.from('users').upsert({
            email: session.user.email,
            name: session.user.name,
            image: session.user.image,
            google_id: token.googleId,
          }, { onConflict: 'email' })
        }
      } catch (_) {}
      // Attach Google token to session — using spread to avoid mutation issues
      return Object.assign({}, session, {
        googleToken: token.googleToken,
        googleId: token.googleId,
      })
    },
    async signIn({ profile }: any) {
      const email = profile?.email ?? ''
      return email.endsWith('@jubelbeer.com') || email === 'george@jubelbeer.com'
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
}
