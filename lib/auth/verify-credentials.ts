import { compare } from 'bcryptjs'
import prisma from '@/lib/db/prisma'

/**
 * Verify user credentials (used by NextAuth Credentials provider)
 * Separated from auth-actions.ts to avoid circular dependency
 */
export async function verifyCredentials(
  email: string,
  password: string
): Promise<{ id: string; email: string; name: string | null; image: string | null } | null> {
  try {
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

    if (!user || !user.password) {
      return null
    }

    const isValidPassword = await compare(password, user.password)

    if (!isValidPassword) {
      return null
    }

    // Return user without password
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    }
  } catch (error) {
    console.error('Error verifying credentials:', error)
    return null
  }
}
