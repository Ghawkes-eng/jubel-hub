import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

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
      if (account) {
        token.gToken = account.access_token
      }
      return token
    },
    async session({ session, token }: any) {
      if (session?.user) {
        session.user.gToken = token.gToken
      }
      return session
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
