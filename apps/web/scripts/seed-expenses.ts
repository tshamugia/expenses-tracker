import { createClient } from '@supabase/supabase-js'

// Use server-side environment variables
const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function seedExpenses() {
  console.log('🌱 Seeding expenses...')

  // First, get the demo user
  const { data: users, error: userError } = await supabase
    .from('User')
    .select('id')
    .eq('email', 'demo@extracker.local')
    .limit(1)

  if (userError || !users || users.length === 0) {
    console.error('❌ Demo user not found')
    return
  }

  const userId = users[0].id
  console.log('✅ Found user:', userId)

  // Sample expenses data
  const expenses = [
    {
      userId,
      title: 'Netflix Subscription',
      amount: 15.99,
      currency: 'USD',
      description: 'Monthly streaming service',
      category: 'Entertainment',
      isRecurring: true,
      startDate: new Date('2024-01-01'),
      nextDueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
    },
    {
      userId,
      title: 'Spotify Premium',
      amount: 10.99,
      currency: 'USD',
      description: 'Music streaming',
      category: 'Entertainment',
      isRecurring: true,
      startDate: new Date('2024-01-01'),
      nextDueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
    },
    {
      userId,
      title: 'AWS Cloud Services',
      amount: 89.50,
      currency: 'USD',
      description: 'Monthly hosting costs',
      category: 'Business',
      isRecurring: true,
      startDate: new Date('2024-01-01'),
      nextDueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    },
    {
      userId,
      title: 'Office Rent',
      amount: 1200.00,
      currency: 'USD',
      description: 'Monthly office space',
      category: 'Business',
      isRecurring: true,
      startDate: new Date('2024-01-01'),
      nextDueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days overdue
    },
    {
      userId,
      title: 'Internet Service',
      amount: 65.00,
      currency: 'USD',
      description: 'High-speed fiber internet',
      category: 'Utilities',
      isRecurring: true,
      startDate: new Date('2024-01-01'),
      nextDueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
    },
    {
      userId,
      title: 'Electricity Bill',
      amount: 125.30,
      currency: 'USD',
      description: 'Monthly power bill',
      category: 'Utilities',
      isRecurring: true,
      startDate: new Date('2024-01-01'),
      nextDueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    },
    {
      userId,
      title: 'Gym Membership',
      amount: 45.00,
      currency: 'USD',
      description: '24/7 fitness center',
      category: 'Health',
      isRecurring: true,
      startDate: new Date('2024-01-01'),
      nextDueDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // 20 days from now
    },
    {
      userId,
      title: 'Car Insurance',
      amount: 180.00,
      currency: 'USD',
      description: 'Monthly auto insurance',
      category: 'Insurance',
      isRecurring: true,
      startDate: new Date('2024-01-01'),
      nextDueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days overdue
    },
    {
      userId,
      title: 'Adobe Creative Cloud',
      amount: 54.99,
      currency: 'USD',
      description: 'Design software subscription',
      category: 'Software',
      isRecurring: true,
      startDate: new Date('2024-01-01'),
      nextDueDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000), // 12 days from now
    },
    {
      userId,
      title: 'Mobile Phone Plan',
      amount: 70.00,
      currency: 'USD',
      description: 'Unlimited data plan',
      category: 'Utilities',
      isRecurring: true,
      startDate: new Date('2024-01-01'),
      nextDueDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000), // 8 days from now
    },
  ]

  // Delete existing expenses for clean slate
  const { error: deleteError } = await supabase
    .from('Expense')
    .delete()
    .eq('userId', userId)

  if (deleteError) {
    console.error('⚠️  Error deleting old expenses:', deleteError)
  } else {
    console.log('🗑️  Cleared existing expenses')
  }

  // Insert new expenses
  const { data, error } = await supabase
    .from('Expense')
    .insert(expenses)
    .select()

  if (error) {
    console.error('❌ Error seeding expenses:', error)
    return
  }

  console.log(`✅ Successfully seeded ${data?.length || 0} expenses!`)
  console.log('\n📊 Expense Summary:')
  console.log(`   Total Amount: $${expenses.reduce((sum, e) => sum + e.amount, 0).toFixed(2)}`)
  console.log(`   Categories: ${[...new Set(expenses.map(e => e.category))].join(', ')}`)
  console.log(`   Recurring: ${expenses.filter(e => e.isRecurring).length}/${expenses.length}`)
  
  // Count overdue
  const overdue = expenses.filter(e => e.nextDueDate < new Date()).length
  console.log(`   Overdue: ${overdue}`)
  console.log('\n🎉 Database seeded successfully!')
}

seedExpenses()
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
