import NextAuth from 'next-auth'
import { authConfig } from './auth.config'

const { auth } = NextAuth(authConfig)

export default auth

export const config = {
  // Match all routes except:
  // - API routes (handled by route handlers directly)
  // - Static files
  // - Image optimization
  // - Favicon and other static assets
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)',
  ],
}
