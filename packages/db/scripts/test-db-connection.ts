/**
 * Database Connection Test Script
 * Run with: pnpm run db:test
 */

import { prisma } from '../src/client'

async function testConnection() {
  console.log('Testing database connection...\n')

  try {
    // Test 1: Simple query
    console.log('Test 1: Simple query')
    const result = await prisma.$queryRaw`SELECT 1 as test`
    console.log('Database connection successful!')
    console.log('   Result:', result)
    console.log()

    // Test 2: Check User table
    console.log('Test 2: Checking User table')
    const userCount = await prisma.user.count()
    console.log(`Found ${userCount} users in database`)
    console.log()

    console.log('All tests passed! Database is working correctly.')
  } catch (error) {
    console.error('Database connection failed!')
    console.error()

    if (error instanceof Error) {
      console.error('Error message:', error.message)
    } else {
      console.error('Unknown error:', error)
    }

    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

testConnection()
