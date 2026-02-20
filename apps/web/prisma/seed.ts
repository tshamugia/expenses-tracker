import prisma from '../lib/db/prisma'

async function main() {
  // Upsert demo user
  const user = await prisma.user.upsert({
    where: { email: 'demo@local' },
    update: {},
    create: {
      email: 'demo@local',
      name: 'Demo User'
    }
  })

  console.log('Demo user created:', user.id)

  // Delete existing expenses for demo user to avoid duplicates
  await prisma.expense.deleteMany({
    where: { userId: user.id }
  })

  console.log('Existing expenses deleted')

  // Create categories first
  const categories = [
    { categoryName: 'Subscriptions', color: '#3b82f6' },
    { categoryName: 'Groceries', color: '#10b981' },
    { categoryName: 'Utilities', color: '#f59e0b' },
    { categoryName: 'Transportation', color: '#ef4444' },
    { categoryName: 'Entertainment', color: '#8b5cf6' },
    { categoryName: 'Healthcare', color: '#ec4899' },
  ]

  for (const category of categories) {
    await prisma.category.upsert({
      where: {
        userId_categoryName: {
          userId: user.id,
          categoryName: category.categoryName
        }
      },
      update: {},
      create: {
        userId: user.id,
        categoryName: category.categoryName,
        color: category.color
      }
    })
  }

  console.log('Categories created')

  // Create diverse expenses with different categories
  const expenses = [
    {
      title: 'Netflix Subscription',
      amount: 15.99,
      category: 'Subscriptions',
      description: 'Monthly streaming service',
      isRecurring: true,
      nextDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5) // 5 days from now
    },
    {
      title: 'Spotify Premium',
      amount: 9.99,
      category: 'Subscriptions',
      description: 'Music streaming',
      isRecurring: true,
      nextDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10) // 10 days from now
    },
    {
      title: 'Weekly Groceries',
      amount: 125.50,
      category: 'Groceries',
      description: 'Supermarket shopping',
      isRecurring: false,
      nextDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2) // 2 days from now
    },
    {
      title: 'Electricity Bill',
      amount: 89.99,
      category: 'Utilities',
      description: 'Monthly electricity',
      isRecurring: true,
      nextDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 15) // 15 days from now
    },
    {
      title: 'Water Bill',
      amount: 45.00,
      category: 'Utilities',
      description: 'Monthly water bill',
      isRecurring: true,
      nextDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 20) // 20 days from now
    },
    {
      title: 'Gas Station',
      amount: 60.00,
      category: 'Transportation',
      description: 'Fuel for car',
      isRecurring: false,
      nextDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3) // 3 days from now
    },
    {
      title: 'Movie Theater',
      amount: 28.00,
      category: 'Entertainment',
      description: 'Weekend movie tickets',
      isRecurring: false,
      nextDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) // 7 days from now
    },
    {
      title: 'Gym Membership',
      amount: 49.99,
      category: 'Healthcare',
      description: 'Monthly gym access',
      isRecurring: true,
      nextDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 12) // 12 days from now
    },
    {
      title: 'Internet Service',
      amount: 79.99,
      category: 'Utilities',
      description: 'Home internet',
      isRecurring: true,
      nextDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 18) // 18 days from now
    },
    {
      title: 'Public Transport Pass',
      amount: 95.00,
      category: 'Transportation',
      description: 'Monthly metro pass',
      isRecurring: true,
      nextDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 25) // 25 days from now
    },
    {
      title: 'Organic Produce',
      amount: 75.00,
      category: 'Groceries',
      description: 'Farmers market shopping',
      isRecurring: false,
      nextDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 6) // 6 days from now
    },
    {
      title: 'Concert Tickets',
      amount: 120.00,
      category: 'Entertainment',
      description: 'Live music event',
      isRecurring: false,
      nextDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) // 30 days from now
    },
  ]

  for (const expense of expenses) {
    await prisma.expense.create({
      data: {
        userId: user.id,
        title: expense.title,
        amount: expense.amount,
        currency: 'USD',
        category: expense.category,
        description: expense.description,
        isRecurring: expense.isRecurring,
        startDate: new Date(),
        nextDueDate: expense.nextDueDate
      }
    })
  }

  console.log(`Seed complete: ${expenses.length} expenses created`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
