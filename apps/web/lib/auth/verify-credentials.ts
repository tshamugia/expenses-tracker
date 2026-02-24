import { compare } from 'bcryptjs'
import { prisma } from '@extracker/db'

/**
 * Verify user credentials (used by NextAuth Credentials provider)
 * Separated from auth-actions.ts to avoid circular dependency
 */
export async function verifyCredentials(
  email: string,
  password: string
): Promise<{ id: string; email: string; name: string | null; image: string | null } | null> {
  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      password: true,
    },
  })

  if (!user) {
    console.log('[verifyCredentials] No user found for email:', email)
    return null
  }

  if (!user.password) {
    console.log('[verifyCredentials] User has no password (OAuth-only):', email)
    return null
  }

  const isValidPassword = await compare(password, user.password)

  if (!isValidPassword) {
    console.log('[verifyCredentials] Password mismatch for:', email)
    return null
  }

  // Return user without password
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
  }
}
