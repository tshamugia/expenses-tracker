const { PrismaClient } = require('@prisma/client');

// Test with session mode (port 6543)
const sessionUrl = 'postgresql://postgres:s9NZGpm9tZttih7P@db.doxoldhuxlnjxqdgfmqk.supabase.co:6543/postgres?sslmode=require';

const prisma = new PrismaClient({
  datasources: {
    db: { url: sessionUrl }
  }
});

async function test() {
  try {
    console.log('Testing connection with port 6543 (session mode)...');
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Connection successful!', result);
    
    const users = await prisma.user.count();
    console.log(`✅ Found ${users} users in database`);
  } catch (error) {
    console.log('❌ Connection failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();
