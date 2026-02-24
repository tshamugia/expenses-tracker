/**
 * Test specific credentials against the database
 * Run with: npx dotenv -e ../../.env.local -- tsx scripts/test-login.ts
 */

import { prisma } from '../src/client'
import { compare } from 'bcryptjs'

const TEST_EMAIL = 't.shamugia@tsgroup.ge'
const TEST_PASSWORD = 'Passw0rd!@#'

async function testLogin() {
  console.log('=== Testing Login Flow ===\n')
  console.log(`Email: ${TEST_EMAIL}`)
  console.log(`Password: ${TEST_PASSWORD}\n`)

  try {
    // Step 1: Find user
    console.log('Step 1: Finding user by email...')
    const user = await prisma.user.findUnique({
      where: { email: TEST_EMAIL },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        password: true,
        hasSetPassword: true,
      },
    })

    if (!user) {
      console.log('  RESULT: User NOT FOUND')
      return
    }

    console.log(`  RESULT: User found`)
    console.log(`  ID: ${user.id}`)
    console.log(`  Name: ${user.name}`)
    console.log(`  Has password: ${!!user.password}`)
    console.log(`  hasSetPassword: ${user.hasSetPassword}`)
    console.log()

    // Step 2: Check password
    if (!user.password) {
      console.log('Step 2: FAIL - User has no password set (OAuth-only user)')
      return
    }

    console.log('Step 2: Comparing password with bcryptjs...')
    console.log(`  Hash: ${user.password}`)
    console.log(`  Hash prefix: ${user.password.substring(0, 7)}`)
    console.log(`  Hash length: ${user.password.length}`)

    const isValid = await compare(TEST_PASSWORD, user.password)
    console.log(`  RESULT: ${isValid ? 'PASSWORD MATCHES' : 'PASSWORD DOES NOT MATCH'}`)
    console.log()

    // Step 3: Simulate what authorize() returns
    if (isValid) {
      const result = {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      }
      console.log('Step 3: authorize() would return:')
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log('Step 3: authorize() would return: null')
      console.log()
      console.log('*** PASSWORD IS WRONG! The stored hash does not match the provided password. ***')
    }

  } catch (error) {
    console.error('ERROR:', error)
  } finally {
    await prisma.$disconnect()
  }
}

testLogin()
