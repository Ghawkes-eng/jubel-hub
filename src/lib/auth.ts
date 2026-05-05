import NextAuth, { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function refreshAccessToken(token: any) {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type:    'refresh_token',
        refresh_token: token.refreshToken,
      }),
    })
    const refreshed = await res.json()
    if (!res.ok) throw refreshed
    return {
      ...token,
      accessToken:  refreshed.access_token,
      expiresAt:    Math.floor(Date.now() / 1000) + refreshed.expires_in,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    }
  } catch (e) {
    console.error('Token refresh error:', e)
    return { ...token, error: 'RefreshAccessTokenError' }
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            'openid', 'email', 'profile',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.compose',
            'https://www.googleapis.com/auth/calendar.readonly',
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
    async jwt({ token, account, profile }) {
      if (account) {
        return {
          ...token,
          accessToken:  account.access_token,
          refreshToken: account.refresh_token,
          expiresAt:    account.expires_at,
          googleId:     profile?.sub,
        }
      }
      if (Date.now() < (token.expiresAt as number) * 1000 - 60000) {
        return token
      }
      return refreshAccessToken(token)
    },

    async session({ session, token }) {
    (session as any).accessToken  = token.accessToken
(session as any).refreshToken = token.refreshToken
(session as any).googleId     = token.googleId
      if (token.error) (session as any).error = token.error

      if (session.user?.email) {
        await supabase.from('users').upsert({
          email:     session.user.email,
          name:      session.user.name,
          image:     session.user.image,
          google_id: session.googleId,
        }, { onConflict: 'email' })
      }
      return session
    },

    async signIn({ profile }) {
      const email = profile?.email ?? ''
      return email.endsWith('@jubelbeer.com') || email === 'george@jubelbeer.com'
    },
  },
  pages: {
    signIn: '/auth/signin',
    error:  '/auth/error',
  },
}
