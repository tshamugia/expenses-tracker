/**
 * Database Connection Test Script
 * Run with: npx tsx scripts/test-db-connection.ts
 */

import prisma from '../lib/db/prisma'

async function testConnection() {
  console.log('🔍 Testing database connection...\n')

  try {
    // Test 1: Simple query
    console.log('Test 1: Simple query')
    const result = await prisma.$queryRaw`SELECT 1 as test`
    console.log('✅ Database connection successful!')
    console.log('   Result:', result)
    console.log()

    // Test 2: Check User table
    console.log('Test 2: Checking User table')
    const userCount = await prisma.user.count()
    console.log(`✅ Found ${userCount} users in database`)
    console.log()

    // Test 3: Check Expense table
    console.log('Test 3: Checking Expense table')
    const expenseCount = await prisma.expense.count()
    console.log(`✅ Found ${expenseCount} expenses in database`)
    console.log()

    // Test 4: Check specific user (demo user)
    console.log('Test 4: Checking demo user')
    const demoUser = await prisma.user.findUnique({
      where: {
        id: '2e1562f2-dedb-400a-9bc0-a1b647e26e32',
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    })

    if (demoUser) {
      console.log('✅ Demo user found:')
      console.log('   Email:', demoUser.email)
      console.log('   Name:', demoUser.name)
      console.log()
    } else {
      console.log('⚠️  Demo user not found')
      console.log()
    }

    // Test 5: Check expenses for demo user
    console.log('Test 5: Checking expenses for demo user')
    const expenses = await prisma.expense.findMany({
      where: {
        userId: '2e1562f2-dedb-400a-9bc0-a1b647e26e32',
      },
      take: 3,
      select: {
        id: true,
        title: true,
        amount: true,
        nextDueDate: true,
      },
    })

    console.log(`✅ Found ${expenses.length} expenses:`)
    expenses.forEach((exp, idx) => {
      console.log(`   ${idx + 1}. ${exp.title} - $${exp.amount}`)
    })
    console.log()

    console.log('🎉 All tests passed! Database is working correctly.')
  } catch (error) {
    console.error('❌ Database connection failed!')
    console.error()

    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error()

      // Provide helpful diagnostics
      if (error.message.includes("Can't reach database server")) {
        console.log('💡 Possible solutions:')
        console.log('   1. Check if Supabase project is paused (free tier auto-pauses)')
        console.log('      → Go to: https://supabase.com/dashboard')
        console.log('      → Resume your project')
        console.log()
        console.log('   2. Check your internet connection')
        console.log()
        console.log('   3. Verify DATABASE_URL in .env.local:')
        console.log('      DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres')
        console.log()
        console.log('   4. Check Supabase dashboard for database status')
      } else if (error.message.includes('password authentication failed')) {
        console.log('💡 Solution:')
        console.log('   Update your DATABASE_URL and DIRECT_URL with correct password')
        console.log('   Get password from: Supabase Dashboard → Settings → Database')
      }
    } else {
      console.error('Unknown error:', error)
    }

    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
testConnection()
