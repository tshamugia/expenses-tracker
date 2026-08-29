/**
 * Database Connection Verification Script
 * Verifies the Prisma connection (local Docker Postgres via .env.local) and
 * confirms the core tables exist and are queryable.
 * Run with: npm run db:verify
 */

import prisma from '../lib/db/prisma'

async function verifyConnection() {
  console.log('🔍 Verifying database connection (Prisma)...')

  try {
    // Confirm we can reach the server and which database we're on
    const [info] = await prisma.$queryRaw<
      Array<{ database: string; host: string | null; port: number | null }>
    >`SELECT current_database() as database, inet_server_addr()::text as host, inet_server_port() as port`
    console.log(`📍 Connected to database "${info.database}" (${info.host ?? 'local'}:${info.port ?? ''})`)

    // Confirm core tables are present and queryable
    const [userCount, expenseCount, paymentCount, prefCount] = await Promise.all([
      prisma.user.count(),
      prisma.expense.count(),
      prisma.payment.count(),
      prisma.notificationPreference.count(),
    ])

    console.log('\n✅ Database connection verified!')
    console.log('📋 Core tables confirmed:')
    console.log(`   - User: ${userCount}`)
    console.log(`   - Expense: ${expenseCount}`)
    console.log(`   - Payment: ${paymentCount}`)
    console.log(`   - NotificationPreference: ${prefCount}`)

    console.log('\n🎉 All checks passed! Database is ready.')
  } catch (error) {
    console.error('❌ Connection verification failed:', error instanceof Error ? error.message : error)
    console.log('\n💡 Is the local Postgres container running?')
    console.log('   docker compose -f docker-compose.dev.yml up -d db')
    console.log('   Check DATABASE_URL in .env.local points to localhost:5433.')
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

verifyConnection()
