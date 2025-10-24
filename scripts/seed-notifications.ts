import prisma from '../lib/db/prisma'

async function main() {
  // Get demo user
  const user = await prisma.user.findUnique({
    where: { email: 'demo@local' },
  })

  if (!user) {
    console.error('Demo user not found. Run: npm run prisma:seed')
    process.exit(1)
  }

  console.log('Found demo user:', user.id)

  // Delete existing notifications to avoid duplicates
  await prisma.notification.deleteMany({
    where: { userId: user.id },
  })

  console.log('Existing notifications deleted')

  // Sample notifications
  const notifications = [
    {
      title: 'Payment Due Soon',
      message: 'Your Netflix subscription payment of $15.99 is due in 3 days.',
      type: 'payment',
      actionUrl: '/expenses',
      isRead: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    },
    {
      title: 'Expense Added',
      message: 'You successfully added a new expense: Weekly Groceries ($125.50)',
      type: 'success',
      actionUrl: '/expenses',
      isRead: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    },
    {
      title: 'Overdue Payment',
      message: 'Your Electricity Bill payment is overdue. Please make the payment.',
      type: 'error',
      actionUrl: '/expenses',
      isRead: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
    },
    {
      title: 'Budget Warning',
      message:
        'You have spent 85% of your monthly budget. Consider reducing expenses.',
      type: 'warning',
      actionUrl: '/dashboard',
      isRead: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12), // 12 hours ago
    },
    {
      title: 'Monthly Summary Ready',
      message:
        'Your expense summary for this month is ready. Total expenses: $1,245.50',
      type: 'info',
      actionUrl: '/dashboard',
      isRead: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    },
    {
      title: 'Recurring Payment Scheduled',
      message: 'Your Spotify Premium subscription will be charged tomorrow.',
      type: 'payment',
      actionUrl: '/expenses',
      isRead: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
    },
    {
      title: 'Payment Card Expiring',
      message:
        'Your credit card ending in 4242 will expire next month. Update your payment info.',
      type: 'warning',
      actionUrl: '/payments',
      isRead: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days ago
    },
    {
      title: 'New Expense Category Created',
      message: 'Successfully created new category: Entertainment',
      type: 'success',
      actionUrl: '/categories',
      isRead: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4), // 4 days ago
    },
    {
      title: 'Expense Reminder',
      message: 'Dont forget to log your gym membership payment this month.',
      type: 'info',
      actionUrl: '/expenses',
      isRead: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5), // 5 days ago
    },
    {
      title: 'Weekly Expense Report',
      message:
        'Your total expenses this week: $345.75. This is 12% higher than last week.',
      type: 'info',
      actionUrl: '/dashboard',
      isRead: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7), // 1 week ago
    },
  ]

  // Create notifications
  for (const notification of notifications) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        ...notification,
      },
    })
  }

  console.log(`✅ Seed complete: ${notifications.length} notifications created`)
  console.log(
    `📊 Unread: ${notifications.filter((n) => !n.isRead).length}, Read: ${
      notifications.filter((n) => n.isRead).length
    }`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
