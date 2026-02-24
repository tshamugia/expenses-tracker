/**
 * Debug Auth Script - Check users with passwords and test bcryptjs
 * Run with: dotenv -e ../../.env.local -- tsx scripts/debug-auth.ts
 */

import { prisma } from '../src/client'
import { hash, compare } from 'bcryptjs'

async function debugAuth() {
  console.log('=== Auth Debug Script ===\n')

  try {
    // 1. Check all users
    console.log('1. Checking all users:')
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        hasSetPassword: true,
        accounts: {
          select: {
            provider: true,
          },
        },
      },
    })

    for (const user of users) {
      const hasPassword = !!user.password
      const passwordLength = user.password?.length || 0
      const providers = user.accounts.map(a => a.provider).join(', ') || 'none (credentials only)'
      console.log(`  - ${user.email}`)
      console.log(`    Name: ${user.name || 'N/A'}`)
      console.log(`    Has password: ${hasPassword} (hash length: ${passwordLength})`)
      console.log(`    hasSetPassword flag: ${user.hasSetPassword}`)
      console.log(`    OAuth providers: ${providers}`)
      console.log()
    }

    // 2. Test bcryptjs
    console.log('2. Testing bcryptjs:')
    const testPassword = 'testPassword123'
    const hashed = await hash(testPassword, 12)
    console.log(`  Hash of "${testPassword}": ${hashed}`)
    const isValid = await compare(testPassword, hashed)
    console.log(`  Compare result: ${isValid}`)
    const isInvalid = await compare('wrongPassword', hashed)
    console.log(`  Compare with wrong password: ${isInvalid}`)
    console.log()

    // 3. Test verify for users with passwords
    console.log('3. Testing password verification for users with passwords:')
    const usersWithPassword = users.filter(u => u.password)
    if (usersWithPassword.length === 0) {
      console.log('  *** NO USERS HAVE PASSWORDS SET ***')
      console.log('  This is why login fails! Users need to sign up with email/password first.')
    } else {
      for (const user of usersWithPassword) {
        console.log(`  User: ${user.email}`)
        console.log(`  Password hash starts with: ${user.password!.substring(0, 10)}...`)
        // Test that the hash is a valid bcrypt hash
        const isBcryptHash = user.password!.startsWith('$2a$') || user.password!.startsWith('$2b$') || user.password!.startsWith('$2y$')
        console.log(`  Is valid bcrypt hash format: ${isBcryptHash}`)
        console.log()
      }
    }

    console.log('=== Debug Complete ===')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

debugAuth()
