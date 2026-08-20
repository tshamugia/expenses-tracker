# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ExtraTracker** is a Next.js 16 expense tracking application with payment notifications and recurring payment management. It follows a server-centric architecture using Next.js App Router with React Server Components (RSC) and Server Actions.

**Version**: 0.0.1 (Demo - Pre-production)

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
npm run seed:notifications # Seed notification data for testing
```

All database commands automatically use `.env.local` via `dotenv-cli`.

## Architecture

### Three-Layer Architecture

1. **Presentation Layer** - Client Components (`components/`) with Shadcn/UI and Tailwind CSS
2. **Business Logic Layer** - Server Actions (`lib/actions/`) handling business rules and data operations
3. **Data Access Layer** - Prisma queries (`lib/db/`) and services (`lib/services/`) for database operations

### Data Flow

```
User Interaction → Client Component → Server Action → Prisma/Service → Supabase PostgreSQL
                                                     ↓
                                              Email Service (Resend)
```

### Key Architectural Patterns

- **No REST API**: Server Actions provide type-safe, direct server-side mutations instead of REST/GraphQL endpoints (API routes exist only for auth, cron, and testing)
- **React Server Components (RSC)**: Default for pages and layouts to reduce client bundle size
- **Server Actions**: All CRUD operations are server actions in `lib/actions/` marked with `'use server'`
- **Services Layer**: Complex business logic (email, notifications, currency) abstracted into `lib/services/`
- **Optimistic Updates**: Zustand store (`lib/stores/expense-store.ts`) manages client-side state for instant UI feedback before server confirmation
- **Type Safety**: End-to-end TypeScript with Prisma-generated types and custom view models

## Project Structure

### Core Directories

- `app/` - Next.js App Router pages and layouts
  - `(private)/` - Protected routes with app layout (dashboard, expenses, categories, payments, profile, notifications, settings)
  - `page.tsx` - Public landing page
  - `login/`, `forgot-password/`, `reset-password/`, `set-password/` - Authentication pages
  - `api/` - Minimal API routes (auth, cron, testing only)
- `components/` - React components organized by feature
  - `ui/` - Shadcn/UI base components
  - `expenses/` - Expense-related components (cards, charts, forms, lists)
  - `payments/` - Payment card management components
  - `categories/` - Category management components
  - `notifications/` - Notification UI components
  - `profile/` - User profile and settings components
  - `auth/` - Authentication forms and flows
  - `currency/` - Currency conversion and calculator components
  - `settings/` - Settings pages (theme, notifications, subscription)
  - `layout/` - Header, sidebar, navigation, theme toggle
  - `landing/` - Landing page sections (hero, features, pricing, testimonials)
  - `providers/` - Context providers (theme, session)
- `lib/` - Business logic and utilities
  - `actions/` - Server Actions for all data mutations (CRUD operations)
  - `db/` - Prisma client singleton
  - `services/` - Business logic services (email, notifications, currency)
  - `stores/` - Zustand state management
  - `utils/` - Helper functions (date, currency, validation, card validation)
  - `constants/` - App-wide configuration
  - `auth/` - Authentication utilities (credential verification)
- `types/` - TypeScript type definitions
- `prisma/` - Database schema and seed scripts
- `scripts/` - Utility scripts (database testing, seeding)

### Important Files

- `auth.ts` - Auth.js 5 configuration with NextAuth
- `auth.config.ts` - Auth providers (Google OAuth, Credentials) and route protection
- `lib/db/prisma.ts` - Prisma Client singleton (always import from here)
- `lib/actions/expense-actions.ts` - All expense CRUD operations and queries
- `lib/actions/category-actions.ts` - Category management actions
- `lib/actions/payment-card-actions.ts` - Payment card CRUD operations
- `lib/actions/notification-actions.ts` - Notification management
- `lib/services/notification-service.ts` - Notification business logic and email sending
- `lib/services/email.ts` - Email service abstraction (Resend)
- `lib/services/currency.ts` - Currency conversion service
- `types/expense-types.ts` - Type definitions for Expense domain
- `prisma/schema.prisma` - Complete database schema

## Naming Conventions

### Files & Folders
- Components: `kebab-case` → `expense-card.tsx`, `payment-list.tsx`
- Server Actions: `kebab-case` with `-actions` suffix → `expense-actions.ts`, `category-actions.ts`
- Services: `kebab-case` → `notification-service.ts`, `email.ts`
- Utilities: `kebab-case` with descriptive suffix → `date-helpers.ts`, `currency-helpers.ts`
- Types: `kebab-case` → `expense-types.ts`
- Page routes: Next.js convention → `app/(private)/expenses/page.tsx`

### Functions
- Server Actions: `verbNoun` → `createExpense`, `getUserExpenses`, `updateCategory`
- Database queries: `findBy` prefix → `findExpensesByUserId`, `findCategoryByName`
- Services: `verbNoun` → `sendPaymentReminderEmail`, `convertCurrency`
- Utilities: `verbNoun` or `getX` → `formatCurrency`, `isPaymentDueSoon`, `validateCardNumber`
- React handlers: `handleX` → `handleSubmit`, `handleDelete`, `handleMarkPaid`

### Variables
- Boolean: `is/has/should` prefix → `isLoading`, `hasPaid`, `shouldNotify`, `isRecurring`
- Arrays: Plural nouns → `expenses`, `payments`, `categories`, `notifications`
- Constants: `UPPER_SNAKE_CASE` → `MAX_EXPENSE_AMOUNT`, `DEFAULT_CURRENCY`, `NOTIFICATION_TYPES`
- Components: `PascalCase` → `ExpenseCard`, `PaymentDialog`, `CategoryForm`

### Types & Interfaces
- Interfaces: `PascalCase` → `Expense`, `ExpenseFilters`, `NotificationPreference`
- Type aliases: `PascalCase` → `ActionResult<T>`, `SerializedExpenseWithPayments`
- Enums: `PascalCase` with singular noun → `PaymentStatus`, `RecurringFrequency`, `NotificationType`

## Database Schema

### Core Models

- **User**: Authentication and profile (id, email, name, image, password, hasSetPassword)
- **Account**: OAuth account linkage (Auth.js adapter)
- **Session**: User sessions (Auth.js adapter)
- **VerificationToken**: Email verification tokens (Auth.js adapter)
- **PasswordResetToken**: Password reset tokens with 6-digit codes (email, token, expires, used)
- **Expense**: Expense records (title, amount, currency, category, description, isRecurring, recurrenceRule, startDate, nextDueDate)
- **Payment**: Individual payment instances linked to expenses (dueDate, amount, paid, paidAt, snoozedUntil)
- **Category**: User-defined expense categories (categoryName, color)
- **PaymentCard**: Credit/debit card information (cardholderName, lastFourDigits, expiryMonth, expiryYear, cardBrand, nickname, color)
- **NotificationPreference**: User notification settings (emailEnabled, smsEnabled, pushEnabled, notifyBeforeDays, theme, defaultCurrency, subscriptionPlan, subscriptionStatus)
- **Notification**: In-app notifications (title, message, type, isRead, actionUrl, metadata)

### Important Relations

- User → Expenses (one-to-many)
- User → Categories (one-to-many)
- User → PaymentCards (one-to-many)
- User → Notifications (one-to-many)
- User → NotificationPreference (one-to-one)
- User → Accounts (one-to-many, Auth.js)
- User → Sessions (one-to-many, Auth.js)
- Expense → User (many-to-one)
- Expense → PaymentCard (many-to-one, nullable)
- Expense → Payments (one-to-many with cascade delete)
- Category → User (many-to-one with unique constraint per user)
- PaymentCard → Expenses (one-to-many)

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

- Database models: Use Prisma-generated types (`Expense`, `Payment`, `Category`)
- View models: Use custom types for UI (`ExpenseListItem`, `DashboardData`, `NotificationWithMetadata`)
- Server Actions transform database models → view models with computed fields (isOverdue, isPaid, formattedAmount)

## Common Patterns

### Server Actions

All Server Actions follow this pattern:

```typescript
'use server'

export async function actionName(input: InputType): Promise<ActionResult<ReturnType>> {
  try {
    // 1. Get authenticated user
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // 2. Business logic validation
    // 3. Database operation via Prisma
    // 4. Revalidate affected paths
    revalidatePath('/dashboard')

    // 5. Serialize Decimal to number
    const serialized = { ...data, amount: Number(data.amount) }

    // 6. Return success result
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
- React hooks (useState, useEffect, useTransition, etc.)
- Event handlers (onClick, onSubmit, onChange)
- Browser APIs (localStorage, window, document)
- Zustand stores
- Framer Motion animations
- Third-party libraries that require client-side rendering

### Authentication

The app uses Auth.js 5 (NextAuth) with Google OAuth and Credentials providers:

```typescript
// Get session in Server Components
import { auth } from '@/auth'

export default async function Page() {
  const session = await auth()
  if (!session) redirect('/login')

  return <div>Welcome {session.user?.name}</div>
}
```

```typescript
// Get session in Client Components
'use client'
import { useSession } from 'next-auth/react'

export function Component() {
  const { data: session, status } = useSession()
  if (status === 'loading') return <Spinner />
  if (status === 'unauthenticated') redirect('/login')

  return <div>Welcome {session?.user?.name}</div>
}
```

```typescript
// Sign out
import { signOut } from 'next-auth/react'

await signOut({ callbackUrl: '/' })
```

Protected routes are automatically handled by auth.config.ts callbacks. Routes under `/dashboard`, `/expenses`, `/categories`, `/payments`, `/profile`, `/notifications`, and `/settings` require authentication.

## Tech Stack

- **Framework**: Next.js 16.0.0 (App Router, React 19)
- **Database**: Supabase PostgreSQL + Prisma ORM 6.18.0
- **Authentication**: Auth.js 5 (NextAuth) with Google OAuth and Credentials
- **UI**: Tailwind CSS 3 + Shadcn/UI + Framer Motion + next-themes
- **Icons**: Lucide React
- **State Management**: Zustand (client-side optimistic updates)
- **Notifications**: Sonner (toast notifications)
- **Email**: Resend (email notifications and password reset)
- **Charts**: Recharts (dashboard visualizations)
- **Date Handling**: date-fns 4.1.0
- **Password Hashing**: bcryptjs
- **Validation**: Manual validation (Zod not yet implemented)

## Environment Variables

Required in `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
DATABASE_URL=postgresql://postgres:password@db.project.supabase.co:5432/postgres?pgbouncer=true&sslmode=require
DIRECT_URL=postgresql://postgres:password@db.project.supabase.co:5432/postgres?sslmode=require

# Auth.js
AUTH_SECRET=your-auth-secret-here              # Generate with: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Email Service (Resend)
RESEND_API_KEY=re_your_api_key_here           # Optional: emails logged to console if not set

# Cron Job Security (Production)
CRON_SECRET=your-cron-secret-here              # Generate with: openssl rand -base64 32

# Web Push (PWA notifications)
VAPID_PUBLIC_KEY=your-vapid-public-key         # Generate with: npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=your-vapid-private-key       # Keep secret (server-only)
VAPID_SUBJECT=mailto:you@example.com           # Contact URI required by the Web Push spec
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key  # Same as VAPID_PUBLIC_KEY, exposed to the client for subscribe()
```

If VAPID keys are not set, web push is a no-op (in-app + email notifications still work). The `PushSubscription` table is created via `npm run db:add-push` (kept separate from `prisma db push` to avoid dropping the out-of-schema `RefreshToken` table on the live DB).

See `.env.example` for the full template.

### Setting up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Configure OAuth consent screen
6. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
7. Copy Client ID and Client Secret to `.env.local`

### Setting up Resend Email

1. Go to [Resend](https://resend.com/) and create an account
2. Get your API key from the dashboard
3. Add `RESEND_API_KEY` to `.env.local`
4. If not provided, emails will be logged to console (development mode)

## Path Aliases

TypeScript paths are configured with `@/` alias:

```typescript
import prisma from '@/lib/db/prisma'
import { createExpense } from '@/lib/actions/expense-actions'
import { sendEmail } from '@/lib/services/email'
import type { ExpenseListItem } from '@/types/expense-types'
```

## Current Implementation Status (v0.0.1)

### ✅ Completed Features

#### Core Features
- Project setup with TypeScript, Tailwind CSS, Shadcn/UI
- Supabase and Prisma configuration
- Complete database schema with 11 models

#### Authentication & Authorization
- Auth.js 5 (NextAuth) with Google OAuth and Credentials providers
- Login/Register page with beautiful UI/UX
- Password set functionality for OAuth users
- Forgot password with email verification codes (6-digit tokens)
- Password reset flow
- Route protection via auth.config.ts callbacks
- Session management with JWT strategy

#### Expense Management
- Dashboard with expense statistics and charts (Recharts)
- Expense CRUD operations via Server Actions
- Expense form with create/edit/delete functionality
- Payment tracking (mark as paid, payment history)
- Recurring expense support (recurrence rules)
- Expense list with filtering and sorting
- Currency support (GEL, USD, EUR) with conversion
- Expense-to-payment card linkage

#### Categories
- User-defined categories with color coding
- Category CRUD operations
- Category assignment to expenses

#### Payment Cards
- Payment card management (add/edit/delete)
- Card validation (expiry, last 4 digits)
- Card brand detection (Visa, Mastercard, Amex, Discover)
- Card nickname and color customization
- Link expenses to payment cards

#### Notifications
- In-app notification system (bell icon with unread count)
- Email notifications via Resend
- Notification types (info, success, warning, error, payment, expense)
- Notification preferences (email, SMS, push toggles)
- 3-day advance payment reminders
- Overdue payment notifications
- Instant notifications for past/overdue expenses
- Notification detail page with full information
- Mark notifications as read/unread
- Scheduled notification cron job endpoint

#### User Profile & Settings
- User profile management
- Avatar upload placeholder
- Change password functionality
- Theme settings (light/dark/system)
- Currency preference settings
- Notification preference settings
- Subscription plan UI (free/pro/enterprise)

#### UI/UX
- Responsive design (mobile, tablet, desktop)
- Landing page with hero, features, pricing, testimonials, CTA
- Sidebar navigation with active state
- Header with notification bell and user menu
- Framer Motion animations
- Toast notifications (Sonner)
- Dark mode support (next-themes)
- Zustand store for optimistic updates

#### Services & Utilities
- Email service abstraction (Resend)
- Currency conversion service
- Date helpers (date-fns)
- Card validation utilities
- Notification service (email + in-app)

### 🚧 Planned (Future Releases)

- Advanced recurring payment scheduling (RRULE implementation)
- Budget tracking and limits
- Receipt upload with OCR
- Export to CSV/PDF
- Real-time sync with Supabase subscriptions
- SMS and push notifications (currently UI only)
- Multi-language support (i18n)
- Advanced analytics and insights
- Shared expenses (family/team accounts)
- Mobile app (React Native)
- Form validation with Zod
- Advanced filtering and search
- Data backup and restore

## Debugging Tips

- **TypeScript errors**: `npm run build`
- **Database connection**: `npm run db:test` or `npm run db:verify`
- **View database GUI**: `npm run prisma:studio`
- **Check logs**: Server Actions log errors to console (check terminal)
- **Revalidation**: Use `revalidatePath()` after mutations to refresh Server Component data
- **Auth debugging**: Check `auth.ts` and `auth.config.ts` for session handling
- **Email debugging**: If `RESEND_API_KEY` is not set, emails are logged to console

## Deployment Recommendations

### Database
- Use Supabase PostgreSQL (connection pooling via Prisma)
- Run `npm run prisma:push` to sync schema before deployment
- Consider using `npm run prisma:seed` for demo data

### Environment Variables
- Set all required environment variables in production
- Generate secure secrets for `AUTH_SECRET` and `CRON_SECRET`
- Use production URLs for `NEXTAUTH_URL` and Google OAuth redirect URIs

### Cron Jobs
- Set up cron job to call `/api/cron/send-notifications` daily
- Use `CRON_SECRET` for authentication
- Example schedule: `0 9 * * *` (9:00 AM daily)

### Performance
- Enable Next.js caching strategies
- Optimize images with next/image
- Use React Server Components for static content
- Implement ISR (Incremental Static Regeneration) where applicable

### Security
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client
- Use Auth.js built-in CSRF protection
- Implement rate limiting for authentication endpoints
- Validate all user inputs on server side
- Use Prisma parameterized queries (automatic SQL injection prevention)
