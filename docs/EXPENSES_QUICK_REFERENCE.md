# Expenses Page - Quick Reference & Code Snippets

## 🎯 Quick Start

### 1. Basic Component Usage

```tsx
import { ExpensesPage } from '@/components/expenses/expenses-page'

export default function Page() {
  return (
    <ExpensesPage
      initialExpenses={[]}
      onCreateExpense={handleCreate}
      onUpdateExpense={handleUpdate}
      onDeleteExpense={handleDelete}
      onMarkPaidExpense={handleMarkPaid}
    />
  )
}
```

---

## 🎬 Framer Motion Snippets

### Modal Animation (Used in ExpenseForm)

```tsx
import { motion, AnimatePresence } from 'framer-motion'
import { modalBackdrop, modalContent } from '@/lib/animations/variants'

<AnimatePresence mode="wait">
  {isOpen && (
    <>
      {/* Backdrop */}
      <motion.div
        variants={modalBackdrop}
        initial="initial"
        animate="animate"
        exit="exit"
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <motion.div
        variants={modalContent}
        initial="initial"
        animate="animate"
        exit="exit"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      >
        {/* Your form content */}
      </motion.div>
    </>
  )}
</AnimatePresence>
```

### List Item Animation

```tsx
import { motion } from 'framer-motion'
import { listContainer, expenseItemEntry } from '@/lib/animations/variants'

<motion.div variants={listContainer} initial="initial" animate="animate">
  <AnimatePresence mode="popLayout">
    {expenses.map((expense) => (
      <motion.div
        key={expense.id}
        variants={expenseItemEntry}
        initial="initial"
        animate="animate"
        exit="exit"
        layout
      >
        <ExpenseCard expense={expense} />
      </motion.div>
    ))}
  </AnimatePresence>
</motion.div>
```

### Button Hover Animation

```tsx
import { motion } from 'framer-motion'
import { editButtonHover, deleteButtonHover } from '@/lib/animations/variants'

{/* Edit Button */}
<motion.button
  variants={editButtonHover}
  whileHover="whileHover"
  whileTap="whileTap"
  onClick={handleEdit}
>
  Edit
</motion.button>

{/* Delete Button */}
<motion.button
  variants={deleteButtonHover}
  whileHover="whileHover"
  whileTap="whileTap"
  onClick={handleDelete}
>
  Delete
</motion.button>
```

### Page Load Animation

```tsx
import { motion } from 'framer-motion'
import { fadeIn } from '@/lib/animations/variants'

<motion.div
  variants={fadeIn}
  initial="initial"
  animate="animate"
  className="w-full"
>
  {/* Page content */}
</motion.div>
```

---

## 💾 Server Actions Integration

### Creating Server Actions

```typescript
// lib/actions/expense-actions.ts
'use server'

import { prisma } from '@/lib/db/prisma'
import { revalidatePath } from 'next/cache'

export async function createExpense(
  userId: string,
  data: ExpenseFormData
) {
  try {
    const expense = await prisma.expense.create({
      data: {
        userId,
        title: data.title,
        amount: data.amount,
        category: data.category,
        nextDueDate: new Date(data.date),
        isRecurring: false,
      },
    })

    revalidatePath('/expenses')
    return { success: true, data: expense }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
```

### Using Server Actions in Component

```tsx
'use client'

import { createExpense } from '@/lib/actions/expense-actions'

export function ExpensesPage() {
  const handleCreateExpense = async (data: ExpenseFormData) => {
    const result = await createExpense(userId, data)
    if (result.success) {
      // Update UI or show success toast
    }
  }

  return (
    <ExpenseForm
      onSubmit={handleCreateExpense}
      // ... other props
    />
  )
}
```

---

## 🔍 Filtering & Search Logic

### Combined Filter

```typescript
const filteredExpenses = useMemo(() => {
  return expenses.filter((expense) => {
    // Search filter
    const matchesSearch = expense.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase())

    // Category filter
    const matchesCategory =
      selectedCategory === 'All Categories' ||
      expense.category === selectedCategory

    // Status filter
    const matchesStatus =
      selectedStatus === 'all' ||
      (selectedStatus === 'paid' && expense.isPaid) ||
      (selectedStatus === 'pending' && !expense.isPaid && !expense.isOverdue) ||
      (selectedStatus === 'overdue' && expense.isOverdue)

    return matchesSearch && matchesCategory && matchesStatus
  })
}, [expenses, searchQuery, selectedCategory, selectedStatus])
```

### Statistics Calculation

```typescript
const stats = useMemo(() => {
  return {
    total: expenses.reduce((sum, e) => sum + e.amount, 0),
    paid: expenses
      .filter((e) => e.isPaid)
      .reduce((sum, e) => sum + e.amount, 0),
    pending: expenses
      .filter((e) => !e.isPaid && !e.isOverdue)
      .reduce((sum, e) => sum + e.amount, 0),
    overdue: expenses
      .filter((e) => e.isOverdue)
      .reduce((sum, e) => sum + e.amount, 0),
  }
}, [expenses])
```

---

## 🎨 Custom Animations

### Creating a Custom Animation Variant

```typescript
// lib/animations/variants.ts
export const customExpenseEntry: Variants = {
  initial: {
    opacity: 0,
    y: 20,
    x: -20,
    rotate: -5,
  },
  animate: {
    opacity: 1,
    y: 0,
    x: 0,
    rotate: 0,
  },
  exit: {
    opacity: 0,
    y: -20,
    x: 20,
    rotate: 5,
  },
}
```

### Using Custom Variant

```tsx
<motion.div
  variants={customExpenseEntry}
  initial="initial"
  animate="animate"
  exit="exit"
>
  <ExpenseCard {...props} />
</motion.div>
```

---

## 📝 Form Validation Example

### Client-Side Validation

```typescript
const validateForm = (data: ExpenseFormData) => {
  const errors: Record<string, string> = {}

  if (!data.title.trim()) {
    errors.title = 'Title is required'
  }

  if (data.amount <= 0) {
    errors.amount = 'Amount must be positive'
  }

  if (!data.category) {
    errors.category = 'Category is required'
  }

  const date = new Date(data.date)
  if (isNaN(date.getTime())) {
    errors.date = 'Invalid date'
  }

  return errors
}
```

### Display Errors

```tsx
{touched.title && errors.title && (
  <motion.p
    initial={{ opacity: 0, y: -5 }}
    animate={{ opacity: 1, y: 0 }}
    className="text-sm text-red-500 mt-1"
  >
    {errors.title}
  </motion.p>
)}
```

---

## 🔄 State Management Patterns

### Optimistic Update Pattern

```typescript
const handleDeleteExpense = async (id: string) => {
  // 1. Optimistic update - immediate UI change
  setExpenses((prev) => prev.filter((e) => e.id !== id))

  try {
    // 2. API call
    await deleteExpense(id)
  } catch (error) {
    // 3. Rollback on error
    const deletedExpense = expenses.find((e) => e.id === id)
    if (deletedExpense) {
      setExpenses((prev) => [...prev, deletedExpense])
    }
  }
}
```

### Loading State Management

```typescript
const [isSubmitting, setIsSubmitting] = useState(false)

const handleSubmit = async () => {
  setIsSubmitting(true)
  try {
    await onSubmit()
  } catch (error) {
    console.error(error)
  } finally {
    setIsSubmitting(false)
  }
}
```

---

## 🎯 Type Definitions

### ExpenseListItem Type

```typescript
interface ExpenseListItem {
  id: string
  title: string
  amount: number
  currency: string
  category: string | null
  nextDueDate: Date | null
  isOverdue: boolean
  isPaid: boolean
  isRecurring: boolean
}
```

### ExpenseFormData Type

```typescript
interface ExpenseFormData {
  title: string
  amount: number
  category: string
  date: string
  notes?: string
}
```

---

## 🎪 Layout Variations

### Compact Card View

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  {expenses.map((expense) => (
    <ExpenseCard key={expense.id} expense={expense} />
  ))}
</div>
```

### Table View (Alternative)

```tsx
<table className="w-full">
  <thead>
    <tr>
      <th>Name</th>
      <th>Amount</th>
      <th>Category</th>
      <th>Status</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {expenses.map((expense) => (
      <tr key={expense.id}>
        <td>{expense.title}</td>
        <td>${expense.amount}</td>
        <td>{expense.category}</td>
        <td>{expense.isPaid ? 'Paid' : 'Pending'}</td>
        <td>{/* Actions */}</td>
      </tr>
    ))}
  </tbody>
</table>
```

---

## 🚀 Performance Tips

### 1. Use useMemo for Expensive Calculations

```typescript
const filteredExpenses = useMemo(() => {
  // Filter logic
}, [expenses, filters])
```

### 2. Separate Form State from List State

```typescript
const [expenses, setExpenses] = useState([])
const [formData, setFormData] = useState({})
// Don't mix UI state with data state
```

### 3. Use AnimatePresence for Exit Animations

```tsx
<AnimatePresence mode="popLayout">
  {items.map((item) => (
    <motion.div key={item.id} exit={{ opacity: 0 }}>
      {item}
    </motion.div>
  ))}
</AnimatePresence>
```

### 4. Limit Rerenderers with Controlled Props

```tsx
// Bad: Re-renders on every parent render
<ExpenseForm {...allProps} />

// Good: Only essential props
<ExpenseForm
  isOpen={isOpen}
  onClose={onClose}
  onSubmit={onSubmit}
/>
```

---

## 🐛 Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Animations not playing | Check `AnimatePresence`, verify variants are correct |
| Form not validating | Ensure validation function returns errors object |
| Filters not working | Check `useMemo` dependencies include all filters |
| Delete not working | Verify `onDelete` callback is passed and called |
| Loading state stuck | Ensure `finally` block resets loading state |
| Optimistic update fails | Implement rollback logic in catch block |

---

## 📚 Resources

- [Framer Motion Docs](https://www.framer.com/motion/)
- [Next.js Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions)
- [Tailwind CSS](https://tailwindcss.com)
- [Shadcn/UI](https://ui.shadcn.com)

---

## ✅ Checklist for Integration

- [ ] Copy all component files to your project
- [ ] Update `lib/animations/variants.ts` with new animations
- [ ] Create `/app/expenses/page.tsx` route
- [ ] Connect API endpoints or Server Actions
- [ ] Add navigation links to expenses page
- [ ] Test all CRUD operations
- [ ] Verify animations in different browsers
- [ ] Test responsive design on mobile
- [ ] Implement error handling
- [ ] Add success notifications/toasts
