import prisma from '../lib/db/prisma'

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'demo@local' },
    update: {},
    create: {
      email: 'demo@local',
      name: 'Demo User'
    }
  })

  await prisma.expense.create({
    data: {
      userId: user.id,
      title: 'Demo Subscription',
      amount: 9.99,
      currency: 'USD',
      description: 'Monthly demo subscription',
      isRecurring: true,
      startDate: new Date(),
      nextDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
    }
  })

  console.log('Seed complete')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
