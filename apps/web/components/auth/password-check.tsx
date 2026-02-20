'use client'

import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Component to check if user has set a password and redirect to set-password page if not
 * Should be placed in protected layouts (like dashboard layout)
 */
export function PasswordCheck() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Only check when session is loaded
    if (status === 'loading') return

    // Don't redirect if already on set-password page
    if (pathname?.startsWith('/set-password')) return

    // If user is logged in but hasn't set a password, redirect to set-password page
    if (session?.user && session.user.hasSetPassword === false) {
      router.push('/set-password')
    }
  }, [session, status, router, pathname])

  // This component doesn't render anything
  return null
}
