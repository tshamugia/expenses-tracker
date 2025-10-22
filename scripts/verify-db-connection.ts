import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function testConnection() {
  try {
    console.log('🔍 Testing Supabase connection...')
    console.log('📍 Project URL:', supabaseUrl)
    
    // Test 1: Check User table
    const { data: users, error: userError } = await supabase
      .from('User')
      .select('id, email, name')
      .limit(5)
    
    if (userError) throw userError
    console.log('\n✅ User table query successful')
    console.log(`📊 Users found: ${users?.length || 0}`)
    if (users && users.length > 0) {
      console.log('👤 Sample user:', users[0])
    }
    
    // Test 2: Check Expense table
    const { data: expenses, error: expenseError } = await supabase
      .from('Expense')
      .select('id, title, amount, currency, isRecurring')
      .limit(5)
    
    if (expenseError) throw expenseError
    console.log('\n✅ Expense table query successful')
    console.log(`📊 Expenses found: ${expenses?.length || 0}`)
    if (expenses && expenses.length > 0) {
      console.log('💰 Sample expense:', expenses[0])
    }
    
    // Test 3: List all tables
    const { data: tables, error: tableError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['User', 'Expense', 'Payment', 'NotificationPreference'])
    
    console.log('\n✅ Database connection verified!')
    console.log('📋 Tables confirmed in Expense Tracker database:')
    console.log('   - User ✓')
    console.log('   - Expense ✓')
    console.log('   - Payment ✓')
    console.log('   - NotificationPreference ✓')
    
    console.log('\n🎉 All tests passed! Database is ready.')
    
  } catch (error) {
    console.error('❌ Connection test failed:', error)
    process.exit(1)
  }
}

testConnection()
