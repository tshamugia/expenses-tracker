import { auth } from '@/auth'
import { redirect } from 'next/navigation'

/**
 * Get the authenticated user session
 * Redirects to /login if not authenticated
 * Use this in Server Components for protected routes
 */
export async function getAuthSession() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login')
  }

  return session
}

/**
 * Get the authenticated user ID
 * Redirects to /login if not authenticated
 * Convenience function for when you only need the user ID
 */
export async function getAuthUserId(): Promise<string> {
  const session = await getAuthSession()
  return session.user.id
}
