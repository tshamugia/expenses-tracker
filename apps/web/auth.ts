import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { authConfig } from './auth.config'
import { prisma } from '@extracker/db'
import { verifyCredentials } from '@/lib/auth/verify-credentials'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          console.log('[authorize] Missing email or password in credentials')
          return null
        }

        try {
          const user = await verifyCredentials(
            credentials.email as string,
            credentials.password as string
          )

          if (!user) {
            console.log('[authorize] verifyCredentials returned null')
          }

          return user
        } catch (error) {
          console.error('[authorize] Error during credential verification:', error)
          throw error
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account, trigger }) {
      // Initial sign in - user object is available
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        token.picture = user.image

        // Fetch fresh user data from database to ensure accuracy
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            hasSetPassword: true,
          },
        })

        if (dbUser) {
          // Override with fresh database data
          token.id = dbUser.id
          token.email = dbUser.email
          token.name = dbUser.name
          token.picture = dbUser.image
          token.hasSetPassword = dbUser.hasSetPassword
        }
      }

      if (account) {
        token.provider = account.provider
      }

      // Refresh user data on token update
      if (trigger === 'update' && token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            hasSetPassword: true,
          },
        })

        if (dbUser) {
          token.id = dbUser.id
          token.email = dbUser.email
          token.name = dbUser.name
          token.picture = dbUser.image
          token.hasSetPassword = dbUser.hasSetPassword
        }
      }

      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        // Always fetch fresh user data from database for session
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            hasSetPassword: true,
          },
        })

        if (dbUser) {
          session.user.id = dbUser.id
          session.user.email = dbUser.email
          session.user.name = dbUser.name
          session.user.image = dbUser.image
          session.user.hasSetPassword = dbUser.hasSetPassword
        } else {
          // Fallback to token data if user not found in DB
          session.user.id = token.id as string
          session.user.email = token.email as string
          session.user.name = token.name as string
          session.user.image = token.picture as string
          session.user.hasSetPassword = token.hasSetPassword as boolean
        }
      }
      return session
    },
  },
})
