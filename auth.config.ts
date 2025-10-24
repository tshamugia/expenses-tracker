import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'

export const authConfig = {
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
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnDashboard = nextUrl.pathname.startsWith('/dashboard')
      const isOnExpenses = nextUrl.pathname.startsWith('/expenses')
      const isOnCategories = nextUrl.pathname.startsWith('/categories')
      const isOnPayments = nextUrl.pathname.startsWith('/payments')
      const isOnProfile = nextUrl.pathname.startsWith('/profile')
      const isOnNotifications = nextUrl.pathname.startsWith('/notifications')

      const protectedRoutes = [
        isOnDashboard,
        isOnExpenses,
        isOnCategories,
        isOnPayments,
        isOnProfile,
        isOnNotifications,
      ]

      if (protectedRoutes.some((route) => route)) {
        if (isLoggedIn) return true
        return false // Redirect unauthenticated users to login page
      } else if (isLoggedIn) {
        return true
      }

      return true
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
} satisfies NextAuthConfig
