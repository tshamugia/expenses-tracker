import 'dotenv/config'
import prisma from '../lib/db/prisma'

async function testPrisma() {
  try {
    // Test connection by counting users
    const userCount = await prisma.user.count()
    console.log('✅ Prisma connected successfully!')
    console.log(`📊 User count: ${userCount}`)
    
    // Test raw query
    const result = await prisma.$queryRaw`SELECT 1 as test`
    console.log('✅ Raw query test passed:', result)
  } catch (error) {
    console.error('❌ Prisma connection failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

testPrisma()
