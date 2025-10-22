# Expense Tracker with Payment Notifications - Architecture Document

# never run -  npm run dev and npm run start
# run - npm run build for check typescript build

## 1. Architecture Overview

**Pattern:** Monolithic Full-Stack Next.js with Server-Side Actions

This is a **server-centric architecture** leveraging Next.js App Router with React Server Components (RSC) and Server Actions for all data mutations. The application follows a **three-layer architecture**:

- **Presentation Layer** (Client Components) - React components with Shadcn/UI and Tailwind CSS
- **Business Logic Layer** (Server Actions) - Server-side functions handling business rules and data operations
- **Data Access Layer** (Prisma + Supabase) - Database operations and queries

**Key Flow:**
```
User Interaction → Client Component → Server Action → Prisma → Supabase PostgreSQL
                                    ↓
                              Notification Service (cron/scheduled)
```

**Why this approach?**
- **No API routes needed** - Server Actions provide type-safe, direct server-side mutations
- **Simplified authentication** - NextAuth.js integrates seamlessly with Google OAuth
- **Real-time ready** - Supabase provides real-time subscriptions if needed later
- **Optimal performance** - RSC reduces client bundle size, faster initial loads

---

## 2. Tech Stack & Frameworks

### Core Framework
**Next.js 16 (App Router)**
### Database & ORM
**Supabase (PostgreSQL) + Prisma ORM**
### Authentication
**NextAuth.js v5 (Auth.js)**
### UI & Styling
**Tailwind CSS + Shadcn/UI + Framer Motion**
### Notifications
**Node-cron (for scheduled checks) + React-Email (for templates)**
### Additional Tools
- **Zod** - Runtime validation for forms and Server Actions
- **date-fns** - Date manipulation (lighter than Moment.js)
- **Sonner** - Beautiful toast notifications
- **Zustand** - For state management client side

---

## 3. Function Declarations

### Server Actions (`/lib/actions/`)

```typescript
// expense-actions.ts
export async function createExpense(data: CreateExpenseInput): Promise<ActionResult<Expense>>
export async function updateExpense(id: string, data: UpdateExpenseInput): Promise<ActionResult<Expense>>
export async function deleteExpense(id: string): Promise<ActionResult<void>>
export async function getExpenseById(id: string): Promise<Expense | null>
export async function getUserExpenses(userId: string, filters?: ExpenseFilters): Promise<Expense[]>
export async function getUpcomingPayments(userId: string, daysAhead?: number): Promise<Payment[]>

// payment-actions.ts
export async function markPaymentAsPaid(paymentId: string): Promise<ActionResult<Payment>>
export async function snoozePayment(paymentId: string, snoozeUntil: Date): Promise<ActionResult<Payment>>
export async function getPaymentHistory(expenseId: string): Promise<Payment[]>

// notification-actions.ts
export async function sendPaymentReminder(paymentId: string): Promise<ActionResult<void>>
export async function updateNotificationPreferences(userId: string, prefs: NotificationPrefs): Promise<ActionResult<void>>
export async function getNotificationPreferences(userId: string): Promise<NotificationPrefs>

// auth-actions.ts
export async function getUserProfile(): Promise<User | null>
export async function updateUserProfile(data: UpdateUserInput): Promise<ActionResult<User>>
```

### Utility Functions (`/lib/utils/`)

```typescript
// date-helpers.ts
export function formatExpenseDate(date: Date): string
export function isPaymentDueSoon(dueDate: Date, thresholdDays: number): boolean
export function getNextPaymentDate(expense: Expense): Date | null
export function calculateRecurringDates(startDate: Date, frequency: RecurringFrequency, count: number): Date[]

// validation.ts
export const createExpenseSchema: z.ZodSchema
export const updateExpenseSchema: z.ZodSchema
export const notificationPrefsSchema: z.ZodSchema

// formatting.ts
export function formatCurrency(amount: number, currency: string): string
export function getCurrencySymbol(currency: string): string
```

### Database Queries (`/lib/db/`)

```typescript
// expense-queries.ts
export async function findExpensesByUserId(userId: string): Promise<Expense[]>
export async function findExpenseWithPayments(expenseId: string): Promise<ExpenseWithPayments | null>
export async function findOverduePayments(userId: string): Promise<Payment[]>

// payment-queries.ts
export async function findUpcomingPaymentsByDate(startDate: Date, endDate: Date): Promise<Payment[]>
export async function findPaymentsByExpense(expenseId: string): Promise<Payment[]>
```

---

## 4. Naming Conventions

### Files & Folders
- **Components:** `kebab-case` → `expense-card.tsx`, `payment-list.tsx`
- **Server Actions:** `kebab-case` with `-actions` suffix → `expense-actions.ts`
- **Utilities:** `kebab-case` with descriptive suffix → `date-helpers.ts`
- **Types:** `kebab-case` → `expense-types.ts`, `payment-types.ts`
- **Page routes:** Next.js convention → `app/expenses/[id]/page.tsx`

### Functions
- **Server Actions:** `verbNoun` → `createExpense`, `getUserExpenses`
- **Queries:** `findBy` prefix → `findExpensesByUserId`
- **Utilities:** `verbNoun` or `getX` → `formatCurrency`, `isPaymentDueSoon`
- **Handlers:** `handleX` → `handleSubmit`, `handleDelete`

### Variables
- **Boolean:** `is/has/should` prefix → `isLoading`, `hasPaid`, `shouldNotify`
- **Arrays:** Plural nouns → `expenses`, `payments`, `notifications`
- **Constants:** `UPPER_SNAKE_CASE` → `MAX_EXPENSE_AMOUNT`, `DEFAULT_CURRENCY`
- **React Components:** `PascalCase` → `ExpenseCard`, `PaymentDialog`

### Types & Interfaces
- **Interfaces:** `PascalCase` with `I` prefix (optional) → `Expense`, `IPayment`
- **Type aliases:** `PascalCase` → `ExpenseFilters`, `ActionResult<T>`
- **Enums:** `PascalCase` with singular noun → `PaymentStatus`, `RecurringFrequency`

---

## 5. Component / Module Structure

```
expense-tracker/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx                    # Login page with Google OAuth
│   │   └── layout.tsx                      # Auth layout (centered, minimal)
│   │
│   ├── (dashboard)/
│   │   ├── layout.tsx                      # Main app layout (sidebar, header)
│   │   ├── page.tsx                        # Dashboard homepage (overview stats)
│   │   ├── expenses/
│   │   │   ├── page.tsx                    # Expenses list view
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx                # Expense detail with payment history
│   │   │   │   └── edit/
│   │   │   │       └── page.tsx            # Edit expense form
│   │   │   └── new/
│   │   │       └── page.tsx                # Create new expense
│   │   │
│   │   ├── payments/
│   │   │   └── page.tsx                    # Upcoming payments calendar view
│   │   │
│   │   └── settings/
│   │       └── page.tsx                    # User settings & notification prefs
│   │
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts                # NextAuth configuration
│   │   └── cron/
│   │       └── check-payments/
│   │           └── route.ts                # Scheduled payment checks
│   │
│   ├── layout.tsx                          # Root layout
│   ├── globals.css                         # Global styles + Tailwind imports
│   └── providers.tsx                       # Context providers wrapper
│
├── components/
│   ├── ui/                                 # Shadcn/UI components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   ├── calendar.tsx
│   │   └── ...                             # Other Shadcn components
│   │
│   ├── expenses/
│   │   ├── expense-card.tsx                # Individual expense display card
│   │   ├── expense-form.tsx                # Create/edit expense form
│   │   ├── expense-list.tsx                # List of expenses with filters
│   │   ├── expense-stats.tsx               # Statistics visualization
│   │   └── recurring-settings.tsx          # Recurring payment configuration
│   │
│   ├── payments/
│   │   ├── payment-calendar.tsx            # Calendar view of payments
│   │   ├── payment-item.tsx                # Single payment display
│   │   ├── payment-reminder-badge.tsx      # Due soon indicator
│   │   └── mark-paid-button.tsx            # Quick action button
│   │
│   ├── notifications/
│   │   ├── notification-bell.tsx           # Header notification icon
│   │   ├── notification-list.tsx           # Dropdown notification list
│   │   └── notification-settings.tsx       # Preference configuration
│   │
│   ├── layout/
│   │   ├── sidebar.tsx                     # Navigation sidebar
│   │   ├── header.tsx                      # Top header with user menu
│   │   ├── mobile-nav.tsx                  # Mobile navigation drawer
│   │   └── footer.tsx                      # Optional footer
│   │
│   └── shared/
│       ├── loading-skeleton.tsx            # Skeleton loaders
│       ├── empty-state.tsx                 # Empty state illustrations
│       ├── error-boundary.tsx              # Error handling component
│       └── animated-container.tsx          # Framer Motion wrapper
│
├── lib/
│   ├── actions/
│   │   ├── expense-actions.ts              # Expense CRUD operations
│   │   ├── payment-actions.ts              # Payment operations
│   │   ├── notification-actions.ts         # Notification operations
│   │   └── user-actions.ts                 # User profile operations
│   │
│   ├── db/
│   │   ├── prisma.ts                       # Prisma client singleton
│   │   ├── expense-queries.ts              # Complex expense queries
│   │   └── payment-queries.ts              # Complex payment queries
│   │
│   ├── auth/
│   │   ├── auth-config.ts                  # NextAuth configuration
│   │   ├── auth-helpers.ts                 # Auth utility functions
│   │   └── middleware.ts                   # Auth middleware
│   │
│   ├── email/
│   │   ├── templates/
│   │   │   ├── payment-reminder.tsx        # Payment reminder email
│   │   │   └── payment-overdue.tsx         # Overdue payment email
│   │   └── send-email.ts                   # Email sending logic
│   │
│   ├── utils/
│   │   ├── date-helpers.ts                 # Date manipulation utilities
│   │   ├── currency-helpers.ts             # Currency formatting
│   │   ├── validation.ts                   # Zod schemas
│   │   └── cn.ts                           # Tailwind class merger
│   │
│   └── constants/
│       ├── app-config.ts                   # App-wide configuration
│       ├── currencies.ts                   # Supported currencies
│       └── frequencies.ts                  # Recurring frequencies
│
├── prisma/
│   ├── schema.prisma                       # Database schema
│   ├── migrations/                         # Migration history
│   └── seed.ts                             # Database seeding script
│
├── types/
│   ├── expense-types.ts                    # Expense-related types
│   ├── payment-types.ts                    # Payment-related types
│   ├── user-types.ts                       # User-related types
│   └── global.d.ts                         # Global type declarations
│
├── hooks/
│   ├── use-expenses.ts                     # Expense data hooks
│   ├── use-payments.ts                     # Payment data hooks
│   ├── use-notifications.ts                # Notification hooks
│   └── use-toast.ts                        # Toast notification hook
│
├── public/
│   ├── icons/                              # App icons
│   └── images/                             # Static images
│
├── .env.local                              # Environment variables
├── .env.example                            # Environment template
├── next.config.js                          # Next.js configuration
├── tailwind.config.ts                      # Tailwind configuration
├── tsconfig.json                           # TypeScript configuration
├── package.json                            # Dependencies
└── README.md                               # Project documentation
```

### Module Responsibility Breakdown

**`/app` Directory:**
- Handles routing and page rendering
- Server Components for initial data fetching
- Minimal client-side logic

**`/components` Directory:**
- Reusable UI components
- Organized by feature domain
- `ui/` contains base Shadcn components

**`/lib` Directory:**
- Business logic and server-side operations
- Database queries and mutations
- Utility functions and helpers

**`/types` Directory:**
- Centralized type definitions
- Shared across client and server

**`/hooks` Directory:**
- Custom React hooks
- Client-side data fetching and state

---

## 6. Future Enhancements

### Phase 2 (Post-MVP)
🔹 **Expense Categories & Tags** - Organize expenses with custom categories and color-coded tags  
🔹 **Budget Tracking** - Set monthly budgets and get alerts when approaching limits  
🔹 **Receipt Upload** - Attach photos/PDFs to expenses with OCR extraction  
🔹 **Export to CSV/PDF** - Generate reports for tax or accounting purposes  

### Phase 3 (Scaling)
🔹 **Multi-User Support** - Shared expenses for households or teams  
🔹 **Real-time Sync** - Use Supabase real-time for instant updates across devices  
🔹 **Mobile App** - React Native app sharing business logic  
🔹 **Analytics Dashboard** - Spending trends, category breakdowns, yearly comparisons  

### Phase 4 (Advanced)
🔹 **AI-Powered Insights** - Suggest ways to save based on spending patterns  
🔹 **Bank Integration** - Connect bank accounts for automatic expense import (Plaid API)  
🔹 **Multi-Currency Support** - Handle expenses in different currencies with conversion  
🔹 **Payment Gateway Integration** - Direct payment from the app (Stripe/PayPal)  

### Infrastructure Improvements
🔹 **Migration to Background Jobs** - Move cron jobs to Inngest or BullMQ for reliability  
🔹 **Redis Caching** - Cache frequent queries for better performance  
🔹 **Observability** - Add Sentry for error tracking, PostHog for analytics  
🔹 **E2E Testing** - Playwright tests for critical user flows  

---

## Key Architectural Decisions Explained

### ✅ Why Server Actions over API Routes?
- **Type-safety:** Direct function calls with full TypeScript support
- **Less boilerplate:** No need for request/response handling
- **Better DX:** Collocate server logic with components
- **Performance:** Automatic request deduplication

### ✅ Why Prisma over Raw SQL?
- **Type-safe queries:** Catch errors at compile time
- **Migration management:** Version-controlled schema changes
- **Developer productivity:** Auto-complete and IntelliSense
- **Trade-off:** Slight performance overhead (negligible for this scale)

### ✅ Why Framer Motion for Animations?
- **Declarative API:** Easy-to-read animation code
- **Performance:** GPU-accelerated, 60fps animations
- **React-native:** Hooks-based, fits Next.js patterns
- **Alternative:** GSAP for more complex animations if needed

### ✅ Why NextAuth over Supabase Auth?
- **Provider flexibility:** Easy to add more OAuth providers later
- **Session management:** Built-in JWT and database sessions
- **Middleware integration:** Protect routes easily
- **Trade-off:** Could use Supabase Auth to reduce dependencies

---

## Getting Started Checklist

1. ✅ Set up Next.js project with TypeScript
2. ✅ Configure Tailwind CSS and Shadcn/UI
3. ✅ Set up Supabase project and get credentials
4. ✅ Initialize Prisma and create schema
5. ✅ Configure NextAuth with Google provider
6. ✅ Create base layout components (header, sidebar)
7. ✅ Implement authentication flow
8. ✅ Build expense CRUD operations
9. ✅ Add payment scheduling logic
10. ✅ Implement notification system
11. ✅ Add animations with Framer Motion
12. ✅ Set up cron job for payment reminders
13. ✅ Test and deploy

---

**This architecture is designed to be:**
- ✅ **Simple** - No unnecessary abstractions
- ✅ **Scalable** - Easy to add features without refactoring
- ✅ **Maintainable** - Clear separation of concerns
- ✅ **Type-safe** - End-to-end TypeScript safety
- ✅ **Developer-friendly** - Modern DX with great tooling