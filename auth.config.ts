import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { verifyCredentials } from '@/lib/auth/verify-credentials'

export const authConfig = {
  // Required for self-hosted / non-Vercel production (next start, Docker).
  // Without this, Auth.js refuses to infer the host in production and every
  // auth request fails with a "problem with the server configuration" error.
  trustHost: true,
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
          return null
        }

        const user = await verifyCredentials(
          credentials.email as string,
          credentials.password as string
        )

        return user
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const pathname = nextUrl.pathname

      // Public routes - always allow access
      const publicRoutes = ['/', '/login', '/forgot-password', '/reset-password', '/verify-email']
      if (publicRoutes.some(route => pathname.startsWith(route))) {
        return true
      }

      // Set-password page - only for logged-in users
      if (pathname.startsWith('/set-password')) {
        return isLoggedIn
      }

      // Protected routes - require authentication
      const protectedRoutes = [
        '/dashboard',
        '/plan',
        '/income',
        '/expenses',
        '/categories',
        '/payments',
        '/profile',
        '/notifications',
        '/settings',
      ]

      const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route))

      if (isProtectedRoute) {
        return isLoggedIn
      }

      // Default: allow access
      return true
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
} satisfies NextAuthConfig
