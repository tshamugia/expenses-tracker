import type { NextAuthConfig } from 'next-auth'

/**
 * Auth.js configuration that is Edge-compatible (used by middleware).
 * IMPORTANT: Do NOT import Prisma or any Node.js-only modules here.
 * Providers that need DB access (Credentials) are added in auth.ts.
 */
export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const pathname = nextUrl.pathname

      // Public routes - always allow access
      const publicRoutes = ['/', '/login', '/forgot-password', '/reset-password']
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
  providers: [], // Providers added in auth.ts (Edge runtime can't use Prisma)
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
} satisfies NextAuthConfig
