# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ExtraTracker** is a Next.js 16 expense tracking application with payment notifications. It follows a server-centric architecture using Next.js App Router with React Server Components (RSC) and Server Actions.

## Essential Commands

### Development
```bash
npm run dev              # Start development server
npm run build            # Build for production (run this to check TypeScript errors)
npm run start            # Start production server
npm run lint             # Run ESLint
```

**IMPORTANT**: Never run `npm run dev` or `npm run start` directly. Always use `npm run build` to check for TypeScript build errors.

### Database Management
```bash
npm run db:test          # Test database connection
npm run db:verify        # Verify database connection
npm run prisma:generate  # Generate Prisma Client
npm run prisma:push      # Push schema changes to database
npm run prisma:studio    # Open Prisma Studio GUI
npm run prisma:seed      # Seed database with demo data
```

All database commands automatically use `.env.local` via `dotenv-cli`.

## Architecture

### Three-Layer Architecture

1. **Presentation Layer** - Client Components (`components/`) with Shadcn/UI and Tailwind CSS
2. **Business Logic Layer** - Server Actions (`lib/actions/`) handling business rules and data operations
3. **Data Access Layer** - Prisma queries (`lib/db/`) for database operations

### Data Flow

```
User Interaction → Client Component → Server Action → Prisma → Supabase PostgreSQL
```

### Key Architectural Patterns

- **No API Routes**: Server Actions provide type-safe, direct server-side mutations instead of REST/GraphQL endpoints
- **React Server Components (RSC)**: Default for pages and layouts to reduce client bundle size
- **Server Actions**: All CRUD operations are server actions in `lib/actions/` marked with `'use server'`
- **Optimistic Updates**: Zustand store (`lib/stores/expense-store.ts`) manages client-side state for instant UI feedback before server confirmation
- **Type Safety**: End-to-end TypeScript with Prisma-generated types and custom view models

## Project Structure

### Core Directories

- `app/` - Next.js App Router pages and layouts
  - `(dashboard)/` - Protected dashboard routes with sidebar layout
  - `page.tsx` - Public landing page
- `components/` - React components organized by feature
  - `ui/` - Shadcn/UI base components
  - `expenses/` - Expense-related components
  - `layout/` - Header, sidebar, navigation
  - `landing/` - Landing page sections
- `lib/` - Business logic and utilities
  - `actions/` - Server Actions for data mutations (CRUD operations)
  - `db/` - Prisma client and complex queries
  - `stores/` - Zustand state management
  - `utils/` - Helper functions (date, currency, validation)
  - `constants/` - App-wide configuration
  - `animations/` - Framer Motion variants
- `types/` - TypeScript type definitions
- `prisma/` - Database schema and migrations

### Important Files

- `lib/db/prisma.ts` - Prisma Client singleton (always import from here)
- `lib/actions/expense-actions.ts` - All expense CRUD operations and queries
- `types/expense-types.ts` - Type definitions for Expense domain
- `prisma/schema.prisma` - Database schema with User, Expense, Payment, NotificationPreference models

## Naming Conventions

### Files & Folders
- Components: `kebab-case` → `expense-card.tsx`, `payment-list.tsx`
- Server Actions: `kebab-case` with `-actions` suffix → `expense-actions.ts`
- Utilities: `kebab-case` with descriptive suffix → `date-helpers.ts`
- Types: `kebab-case` → `expense-types.ts`
- Page routes: Next.js convention → `app/expenses/[id]/page.tsx`

### Functions
- Server Actions: `verbNoun` → `createExpense`, `getUserExpenses`
- Database queries: `findBy` prefix → `findExpensesByUserId`
- Utilities: `verbNoun` or `getX` → `formatCurrency`, `isPaymentDueSoon`
- React handlers: `handleX` → `handleSubmit`, `handleDelete`

### Variables
- Boolean: `is/has/should` prefix → `isLoading`, `hasPaid`, `shouldNotify`
- Arrays: Plural nouns → `expenses`, `payments`
- Constants: `UPPER_SNAKE_CASE` → `MAX_EXPENSE_AMOUNT`, `DEFAULT_CURRENCY`
- Components: `PascalCase` → `ExpenseCard`, `PaymentDialog`

### Types & Interfaces
- Interfaces: `PascalCase` → `Expense`, `ExpenseFilters`
- Type aliases: `PascalCase` → `ActionResult<T>`, `SerializedExpenseWithPayments`
- Enums: `PascalCase` with singular noun → `PaymentStatus`, `RecurringFrequency`

## Database Schema

### Core Models

- **User**: Authentication and profile (id, email, name, image)
- **Expense**: Expense records (title, amount, currency, category, recurring settings)
- **Payment**: Individual payment instances linked to expenses (dueDate, paid, paidAt, snoozedUntil)
- **NotificationPreference**: User notification settings (emailEnabled, notifyBeforeDays)

### Important Relations

- User → Expenses (one-to-many)
- Expense → Payments (one-to-many with cascade delete)
- User → NotificationPreference (one-to-one)

## Type System Patterns

### Decimal to Number Conversion

Prisma returns `Decimal` types for currency amounts. Always convert to `number` for client components:

```typescript
// Server Action returns Serialized types
export type SerializedExpense = Omit<Expense, 'amount'> & {
  amount: number
}

// In Server Actions
const serialized = {
  ...expense,
  amount: Number(expense.amount), // Convert Decimal to number
}
```

### View Models vs Database Models

- Database models: Use Prisma-generated types (`Expense`, `Payment`)
- View models: Use custom types for UI (`ExpenseListItem`, `DashboardData`)
- Server Actions transform database models → view models with computed fields (isOverdue, isPaid)

## Common Patterns

### Server Actions

All Server Actions follow this pattern:

```typescript
'use server'

export async function actionName(input: InputType): Promise<ActionResult<ReturnType>> {
  try {
    // 1. Business logic validation
    // 2. Database operation via Prisma
    // 3. Revalidate affected paths
    // 4. Serialize Decimal to number
    // 5. Return success result
    return { success: true, data: serialized }
  } catch (error) {
    console.error('Error in actionName:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error message'
    }
  }
}
```

### Optimistic Updates

Use Zustand store for instant UI feedback:

```typescript
// 1. Optimistic update
useExpenseStore.getState().optimisticMarkPaid(id)

// 2. Server action
const result = await markExpensePaid(id)

// 3. Revert on error (revalidatePath handles success case)
if (!result.success) {
  toast.error(result.error)
}
```

### React Server Components

Pages and layouts are Server Components by default. Add `'use client'` only when using:
- React hooks (useState, useEffect, etc.)
- Event handlers
- Browser APIs
- Zustand stores
- Framer Motion animations

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: Supabase PostgreSQL + Prisma ORM
- **UI**: Tailwind CSS + Shadcn/UI + Framer Motion
- **State Management**: Zustand (client-side)
- **Notifications**: Sonner (toast notifications)
- **Validation**: Zod (planned)
- **Date Handling**: date-fns (planned)

## Environment Variables

Required in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
DIRECT_URL=
```

See `.env.example` for the full template.

## Path Aliases

TypeScript paths are configured with `@/` alias:

```typescript
import prisma from '@/lib/db/prisma'
import { createExpense } from '@/lib/actions/expense-actions'
import type { ExpenseListItem } from '@/types/expense-types'
```

## Current Implementation Status

### Completed (Phase 1)
- ✅ Project setup with TypeScript, Tailwind, Shadcn/UI
- ✅ Supabase and Prisma configuration
- ✅ Database schema with User, Expense, Payment models
- ✅ Server Actions for expense CRUD operations
- ✅ Dashboard with expense stats and list
- ✅ Expense form with create/edit/delete functionality
- ✅ Zustand store for optimistic updates
- ✅ Framer Motion animations
- ✅ Landing page

### Planned (Future Phases)
- Authentication with NextAuth.js
- Payment reminder notifications
- Recurring payment scheduling
- Category management and filtering
- Budget tracking
- Receipt upload with OCR
- Export to CSV/PDF
- Real-time sync with Supabase subscriptions

## Debugging Tips

- Check TypeScript errors: `npm run build`
- Test database connection: `npm run db:test`
- View database in GUI: `npm run prisma:studio`
- Server Actions log errors to console (check terminal)
- Use `revalidatePath()` after mutations to refresh Server Component data
