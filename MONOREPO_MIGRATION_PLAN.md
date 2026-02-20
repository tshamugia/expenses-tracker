# ExtraTracker Monorepo Migration Plan

## Nx Monorepo with Elysia.js API, React Native Mobile & Next.js Web

**Created**: 2026-02-21
**Current Version**: 0.0.1 (Demo)
**Target Architecture**: Nx Monorepo with 3 apps + shared packages

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Shared Packages Design](#4-shared-packages-design)
5. [Elysia.js API Design](#5-elysiajs-api-design)
6. [React Native Mobile App](#6-react-native-mobile-app)
7. [Authentication Strategy](#7-authentication-strategy)
8. [Migration Phases](#8-migration-phases)
9. [API Endpoints Specification](#9-api-endpoints-specification)
10. [Mobile Feature Parity Matrix](#10-mobile-feature-parity-matrix)
11. [DevOps & Deployment](#11-devops--deployment)
12. [Risk & Mitigation](#12-risk--mitigation)

---

## 1. Architecture Overview

### Current Architecture (Web Only)

```
Browser → Next.js (Server Actions) → Prisma → Supabase PostgreSQL
                                       ↓
                                 Resend (Email)
```

### Target Architecture (Monorepo)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Nx Monorepo                              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   apps/web   │  │   apps/api   │  │    apps/mobile       │  │
│  │   Next.js 16 │  │  Elysia.js   │  │  React Native (Expo) │  │
│  │   (existing) │  │  on Bun      │  │                      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│         │    Server       │     REST API         │  Eden Treaty │
│         │    Actions      │     (JSON)           │  (type-safe) │
│         │                 │                      │              │
│  ┌──────┴─────────────────┴──────────────────────┘              │
│  │                                                              │
│  │  ┌────────────────┐ ┌──────────────┐ ┌─────────────────┐   │
│  │  │ packages/db    │ │ packages/    │ │ packages/       │   │
│  │  │ Prisma Schema  │ │ shared-types │ │ core            │   │
│  │  │ Client         │ │ TypeScript   │ │ Business Logic  │   │
│  │  │ Migrations     │ │ Interfaces   │ │ Validation      │   │
│  │  └───────┬────────┘ └──────────────┘ └─────────────────┘   │
│  │          │                                                   │
│  └──────────┼───────────────────────────────────────────────────┘
│             │                                                    │
└─────────────┼────────────────────────────────────────────────────┘
              │
    ┌─────────▼──────────┐
    │  Supabase           │
    │  PostgreSQL          │
    │  (existing database) │
    └─────────────────────┘
```

### Data Flow

```
Web App:
  Browser → Next.js Server Actions → Prisma → Supabase PostgreSQL
  (unchanged — Server Actions remain for web)

Mobile App:
  React Native → Eden Treaty Client → Elysia.js API → Prisma → Supabase PostgreSQL

Shared:
  Both apps use the same database, same Prisma schema, same business logic
```

---

## 2. Tech Stack

### Monorepo Tooling

| Tool          | Purpose                      | Version   |
|---------------|------------------------------|-----------|
| **Nx**        | Monorepo orchestration       | ^20.x     |
| **pnpm**      | Package manager (workspaces) | ^9.x      |
| **TypeScript** | Type safety across all apps  | ^5.x      |

### apps/web (Existing Next.js App)

| Technology      | Purpose                  | Version     |
|-----------------|--------------------------|-------------|
| Next.js         | Web framework            | 16.0.0      |
| React           | UI library               | 19.2.0      |
| Auth.js         | Web authentication       | 5.x (beta)  |
| Tailwind CSS    | Styling                  | 3.x         |
| Shadcn/UI       | Component library        | latest      |
| Zustand         | Client state management  | 5.x         |
| Framer Motion   | Animations               | 12.x        |
| Recharts        | Dashboard charts         | 3.x         |
| Sonner          | Toast notifications      | 2.x         |
| next-themes     | Theme management         | 0.4.x       |

### apps/api (New Elysia.js Backend)

| Technology       | Purpose                      | Version  |
|------------------|------------------------------|----------|
| **Elysia.js**    | HTTP framework               | ^1.2     |
| **Bun**          | Runtime                      | ^1.1     |
| **Eden Treaty**  | End-to-end type-safe client  | ^1.2     |
| **@elysiajs/jwt** | JWT authentication          | ^1.2     |
| **@elysiajs/cors** | CORS handling              | ^1.2     |
| **@elysiajs/swagger** | OpenAPI docs generation | ^1.2    |
| **@elysiajs/bearer** | Bearer token extraction  | ^1.2     |
| Prisma Client    | Database ORM                 | 6.18.0   |
| bcryptjs         | Password hashing             | 3.x      |
| Resend           | Email service                | 6.x      |

### apps/mobile (New React Native App)

| Technology          | Purpose                     | Version  |
|---------------------|-----------------------------|----------|
| **React Native**    | Mobile framework            | 0.76+    |
| **Expo**            | Development toolchain       | ^52      |
| **Expo Router**     | File-based navigation       | ^4       |
| **Eden Treaty**     | Type-safe API client        | ^1.2     |
| **Zustand**         | State management (shared)   | 5.x      |
| **TanStack Query**  | Server state & caching      | ^5       |
| **React Native Paper** or **Tamagui** | UI components | latest |
| **expo-secure-store** | Secure token storage      | latest   |
| **expo-notifications** | Push notifications       | latest   |
| date-fns            | Date utilities (shared)     | 4.x      |

### Shared Packages

| Package              | Purpose                               |
|----------------------|---------------------------------------|
| `@extracker/db`      | Prisma schema, client, migrations     |
| `@extracker/types`   | Shared TypeScript types & interfaces  |
| `@extracker/core`    | Business logic, validation, helpers   |
| `@extracker/config`  | Shared ESLint, TypeScript configs     |

### Infrastructure (Unchanged)

| Service            | Purpose                    |
|--------------------|----------------------------|
| **Supabase**       | PostgreSQL database        |
| **Resend**         | Email notifications        |
| **Google OAuth**   | Social authentication      |

---

## 3. Monorepo Structure

```
extracker/
├── apps/
│   ├── web/                          # Next.js 16 web app (existing, moved)
│   │   ├── app/                      # App Router pages
│   │   │   ├── (private)/            # Protected routes
│   │   │   ├── api/auth/             # Auth.js route handlers only
│   │   │   ├── login/
│   │   │   └── page.tsx              # Landing page
│   │   ├── components/               # React components
│   │   ├── lib/
│   │   │   ├── actions/              # Server Actions (web-only)
│   │   │   ├── stores/               # Zustand stores (web-only)
│   │   │   └── auth/                 # Auth.js helpers (web-only)
│   │   ├── public/
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── api/                          # Elysia.js API server (new)
│   │   ├── src/
│   │   │   ├── index.ts              # Elysia app entry point
│   │   │   ├── routes/               # API route modules
│   │   │   │   ├── auth.routes.ts    # POST /auth/login, /auth/register, /auth/refresh
│   │   │   │   ├── expense.routes.ts # CRUD /expenses
│   │   │   │   ├── category.routes.ts # CRUD /categories
│   │   │   │   ├── payment-card.routes.ts # CRUD /payment-cards
│   │   │   │   ├── notification.routes.ts # /notifications
│   │   │   │   ├── dashboard.routes.ts # GET /dashboard
│   │   │   │   ├── settings.routes.ts  # /settings
│   │   │   │   └── currency.routes.ts  # /currency
│   │   │   ├── middleware/
│   │   │   │   ├── auth.middleware.ts  # JWT verification
│   │   │   │   ├── rate-limit.ts      # Rate limiting
│   │   │   │   └── error-handler.ts   # Global error handling
│   │   │   ├── plugins/
│   │   │   │   ├── jwt.plugin.ts      # JWT configuration
│   │   │   │   ├── cors.plugin.ts     # CORS configuration
│   │   │   │   └── swagger.plugin.ts  # OpenAPI documentation
│   │   │   └── utils/
│   │   │       └── response.ts        # Standardized API responses
│   │   ├── tsconfig.json
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   └── mobile/                        # React Native + Expo (new)
│       ├── app/                       # Expo Router (file-based)
│       │   ├── (tabs)/                # Tab navigation
│       │   │   ├── index.tsx          # Dashboard tab
│       │   │   ├── expenses.tsx       # Expenses tab
│       │   │   ├── notifications.tsx  # Notifications tab
│       │   │   └── profile.tsx        # Profile tab
│       │   ├── expense/
│       │   │   ├── [id].tsx           # Expense detail
│       │   │   └── create.tsx         # Create expense
│       │   ├── categories/
│       │   │   └── index.tsx          # Manage categories
│       │   ├── payment-cards/
│       │   │   └── index.tsx          # Manage cards
│       │   ├── settings/
│       │   │   └── index.tsx          # Settings
│       │   ├── login.tsx              # Login screen
│       │   ├── register.tsx           # Register screen
│       │   └── _layout.tsx            # Root layout
│       ├── components/                # Mobile components
│       │   ├── ui/                    # Base UI components
│       │   ├── expenses/              # Expense components
│       │   ├── dashboard/             # Dashboard widgets
│       │   └── common/                # Shared mobile components
│       ├── lib/
│       │   ├── api/                   # Eden Treaty client setup
│       │   │   └── client.ts          # API client instance
│       │   ├── stores/                # Zustand stores (mobile)
│       │   ├── hooks/                 # TanStack Query hooks
│       │   │   ├── use-expenses.ts
│       │   │   ├── use-categories.ts
│       │   │   ├── use-notifications.ts
│       │   │   └── use-dashboard.ts
│       │   └── utils/
│       │       └── secure-storage.ts  # Token storage
│       ├── assets/                    # Images, fonts
│       ├── app.json                   # Expo config
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   ├── db/                            # Shared database package
│   │   ├── prisma/
│   │   │   ├── schema.prisma          # Single source of truth
│   │   │   ├── migrations/            # Database migrations
│   │   │   └── seed.ts                # Seed scripts
│   │   ├── src/
│   │   │   ├── client.ts              # Prisma Client singleton
│   │   │   └── index.ts              # Export client
│   │   ├── scripts/                   # DB utility scripts
│   │   ├── tsconfig.json
│   │   └── package.json               # name: @extracker/db
│   │
│   ├── shared-types/                  # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── expense.types.ts       # Expense domain types
│   │   │   ├── category.types.ts      # Category types
│   │   │   ├── payment-card.types.ts  # Payment card types
│   │   │   ├── notification.types.ts  # Notification types
│   │   │   ├── settings.types.ts      # Settings types
│   │   │   ├── user.types.ts          # User types
│   │   │   ├── api.types.ts           # API request/response types
│   │   │   ├── common.types.ts        # ActionResult<T>, pagination, etc.
│   │   │   └── index.ts               # Barrel export
│   │   ├── tsconfig.json
│   │   └── package.json               # name: @extracker/types
│   │
│   ├── core/                          # Shared business logic
│   │   ├── src/
│   │   │   ├── validation/
│   │   │   │   ├── expense.validation.ts   # Expense input validation
│   │   │   │   ├── category.validation.ts  # Category validation
│   │   │   │   ├── card.validation.ts      # Card validation (Luhn, brand)
│   │   │   │   ├── auth.validation.ts      # Email, password rules
│   │   │   │   └── index.ts
│   │   │   ├── helpers/
│   │   │   │   ├── date.helpers.ts         # isOverdue, isDueSoon, formatDate
│   │   │   │   ├── currency.helpers.ts     # formatCurrency, convertAmount
│   │   │   │   ├── expense.helpers.ts      # computeExpenseStatus
│   │   │   │   └── index.ts
│   │   │   ├── constants/
│   │   │   │   ├── currencies.ts           # GEL, USD, EUR definitions
│   │   │   │   ├── notification-types.ts   # Notification type constants
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── package.json               # name: @extracker/core
│   │
│   └── config/                        # Shared configs
│       ├── eslint/
│       │   └── base.js                # Base ESLint config
│       ├── typescript/
│       │   └── base.json              # Base tsconfig
│       └── package.json               # name: @extracker/config
│
├── nx.json                            # Nx workspace config
├── pnpm-workspace.yaml                # pnpm workspace definition
├── package.json                       # Root package.json
├── tsconfig.base.json                 # Root TypeScript config
├── .env.local                         # Environment variables (gitignored)
├── .env.example                       # Env template
├── docker-compose.yml                 # Local dev services
├── CLAUDE.md                          # AI development guide
└── MONOREPO_MIGRATION_PLAN.md         # This document
```

---

## 4. Shared Packages Design

### @extracker/db

Prisma schema and client shared by `apps/web` and `apps/api`.

```typescript
// packages/db/src/client.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export { PrismaClient } from '@prisma/client'
export type * from '@prisma/client'
```

Usage in both apps:
```typescript
import { prisma } from '@extracker/db'
import type { Expense, Payment } from '@extracker/db'
```

### @extracker/types

All shared types extracted from existing `types/` directory. Both web and mobile import from here.

```typescript
// packages/shared-types/src/common.types.ts
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

// API-specific types (used by Elysia + Eden Treaty + mobile)
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface ApiErrorResponse {
  success: false
  error: string
  code: string
  statusCode: number
}
```

### @extracker/core

Portable business logic (no framework dependencies — works in Node.js, Bun, and React Native).

```typescript
// packages/core/src/validation/expense.validation.ts
export function validateExpenseInput(input: CreateExpenseInput): ValidationResult {
  const errors: string[] = []
  if (!input.title?.trim()) errors.push('Title is required')
  if (input.amount <= 0) errors.push('Amount must be positive')
  if (input.amount > 999999999.99) errors.push('Amount exceeds maximum')
  if (!['GEL', 'USD', 'EUR'].includes(input.currency)) errors.push('Invalid currency')
  return { valid: errors.length === 0, errors }
}

// packages/core/src/helpers/date.helpers.ts
export function isOverdue(date: Date | string): boolean { ... }
export function isDueSoon(date: Date | string, thresholdDays = 3): boolean { ... }
export function formatRelativeDate(date: Date | string): string { ... }
```

---

## 5. Elysia.js API Design

### App Entry Point

```typescript
// apps/api/src/index.ts
import { Elysia } from 'elysia'
import { swagger } from '@elysiajs/swagger'
import { cors } from '@elysiajs/cors'
import { jwt } from '@elysiajs/jwt'
import { bearer } from '@elysiajs/bearer'

import { authRoutes } from './routes/auth.routes'
import { expenseRoutes } from './routes/expense.routes'
import { categoryRoutes } from './routes/category.routes'
import { paymentCardRoutes } from './routes/payment-card.routes'
import { notificationRoutes } from './routes/notification.routes'
import { dashboardRoutes } from './routes/dashboard.routes'
import { settingsRoutes } from './routes/settings.routes'
import { currencyRoutes } from './routes/currency.routes'

const app = new Elysia()
  .use(swagger({
    documentation: {
      info: { title: 'ExtraTracker API', version: '1.0.0' },
      tags: [
        { name: 'Auth', description: 'Authentication endpoints' },
        { name: 'Expenses', description: 'Expense management' },
        { name: 'Categories', description: 'Category management' },
        { name: 'Payment Cards', description: 'Payment card management' },
        { name: 'Notifications', description: 'Notification management' },
        { name: 'Dashboard', description: 'Dashboard data' },
        { name: 'Settings', description: 'User settings' },
        { name: 'Currency', description: 'Currency rates' },
      ]
    }
  }))
  .use(cors({
    origin: [
      'http://localhost:3000',      // Next.js web
      'exp://localhost:8081',       // Expo dev
    ],
    credentials: true,
  }))
  .use(jwt({
    name: 'jwt',
    secret: process.env.JWT_SECRET!,
    exp: '7d',
  }))
  .use(bearer())
  .use(authRoutes)
  .use(expenseRoutes)
  .use(categoryRoutes)
  .use(paymentCardRoutes)
  .use(notificationRoutes)
  .use(dashboardRoutes)
  .use(settingsRoutes)
  .use(currencyRoutes)
  .listen(4000)

export type App = typeof app  // Eden Treaty uses this for type inference

console.log(`ExtraTracker API running at http://localhost:${app.server?.port}`)
```

### Route Module Example

```typescript
// apps/api/src/routes/expense.routes.ts
import { Elysia, t } from 'elysia'
import { prisma } from '@extracker/db'
import { validateExpenseInput } from '@extracker/core'
import { authMiddleware } from '../middleware/auth.middleware'

export const expenseRoutes = new Elysia({ prefix: '/expenses' })
  .use(authMiddleware)

  .get('/', async ({ userId, query }) => {
    const { category, isRecurring, page = 1, pageSize = 20 } = query
    const expenses = await prisma.expense.findMany({
      where: { userId, category, isRecurring },
      include: { payments: true, paymentCard: true },
      orderBy: { nextDueDate: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })
    return {
      success: true,
      data: expenses.map(e => ({ ...e, amount: Number(e.amount) }))
    }
  }, {
    query: t.Object({
      category: t.Optional(t.String()),
      isRecurring: t.Optional(t.Boolean()),
      page: t.Optional(t.Numeric()),
      pageSize: t.Optional(t.Numeric()),
    })
  })

  .post('/', async ({ userId, body }) => {
    const validation = validateExpenseInput(body)
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') }
    }
    const expense = await prisma.expense.create({
      data: { ...body, userId },
      include: { payments: true },
    })
    return { success: true, data: { ...expense, amount: Number(expense.amount) } }
  }, {
    body: t.Object({
      title: t.String(),
      amount: t.Number(),
      currency: t.Optional(t.String()),
      category: t.Optional(t.String()),
      description: t.Optional(t.String()),
      isRecurring: t.Optional(t.Boolean()),
      recurrenceRule: t.Optional(t.String()),
      startDate: t.Optional(t.String()),
      nextDueDate: t.Optional(t.String()),
      paymentCardId: t.Optional(t.String()),
    })
  })

  .patch('/:id', async ({ userId, params, body }) => { /* update */ })
  .delete('/:id', async ({ userId, params }) => { /* delete */ })
  .post('/:id/mark-paid', async ({ userId, params }) => { /* mark paid */ })
```

### Auth Middleware

```typescript
// apps/api/src/middleware/auth.middleware.ts
import { Elysia } from 'elysia'

export const authMiddleware = new Elysia({ name: 'auth' })
  .derive(async ({ jwt, bearer, set }) => {
    const token = bearer
    if (!token) {
      set.status = 401
      throw new Error('Unauthorized')
    }

    const payload = await jwt.verify(token)
    if (!payload) {
      set.status = 401
      throw new Error('Invalid token')
    }

    return { userId: payload.sub as string }
  })
```

---

## 6. React Native Mobile App

### Eden Treaty Client Setup

```typescript
// apps/mobile/lib/api/client.ts
import { treaty } from '@elysiajs/eden'
import type { App } from '@extracker/api'  // Type import from Elysia app
import * as SecureStore from 'expo-secure-store'

const API_URL = __DEV__
  ? 'http://localhost:4000'
  : 'https://api.extracker.com'

export const api = treaty<App>(API_URL, {
  headers: async () => {
    const token = await SecureStore.getItemAsync('access_token')
    return { Authorization: token ? `Bearer ${token}` : '' }
  }
})
```

### TanStack Query Hooks

```typescript
// apps/mobile/lib/hooks/use-expenses.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'

export function useExpenses(filters?: { category?: string }) {
  return useQuery({
    queryKey: ['expenses', filters],
    queryFn: async () => {
      const { data, error } = await api.expenses.get({ query: filters })
      if (error) throw error
      return data
    },
  })
}

export function useCreateExpense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateExpenseInput) => {
      const { data, error } = await api.expenses.post(input)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
```

### Navigation Structure (Expo Router)

```
Mobile App Navigation:
├── (auth)                    # Auth group (unauthenticated)
│   ├── login.tsx
│   ├── register.tsx
│   └── forgot-password.tsx
├── (tabs)                    # Main tab navigation (authenticated)
│   ├── index.tsx             # Dashboard (home)
│   ├── expenses.tsx          # Expense list
│   ├── notifications.tsx     # Notification center
│   └── profile.tsx           # Profile & settings
├── expense/
│   ├── create.tsx            # Create expense (modal)
│   ├── [id].tsx              # Expense detail
│   └── [id]/edit.tsx         # Edit expense
├── categories/index.tsx      # Category management
├── payment-cards/index.tsx   # Card management
└── settings/index.tsx        # Full settings page
```

---

## 7. Authentication Strategy

### Web App (Unchanged)

- Auth.js 5 (NextAuth) with Google OAuth + Credentials
- JWT session strategy
- Session cookies managed by Auth.js

### Mobile App (New - JWT via Elysia)

```
Login Flow:
  1. User enters email/password OR taps Google Sign-In
  2. POST /auth/login → Elysia validates credentials → returns { accessToken, refreshToken }
  3. Tokens stored in expo-secure-store (encrypted device storage)
  4. Eden Treaty client attaches accessToken to all requests
  5. On 401 → auto-refresh using refreshToken → retry request

Google OAuth on Mobile:
  1. Expo AuthSession opens Google consent screen
  2. Receives Google ID token
  3. POST /auth/google → Elysia verifies with Google → returns { accessToken, refreshToken }
  4. Same token flow as credentials

Token Schema:
  accessToken:  JWT, 15 min expiry, contains { sub: userId, email }
  refreshToken: Opaque token, 30 day expiry, stored in database
```

### Database Addition for Refresh Tokens

```prisma
model RefreshToken {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid
  token     String   @unique
  expiresAt DateTime
  revoked   Boolean  @default(false)
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([token])
}
```

---

## 8. Migration Phases

### Phase 0: Preparation (Week 1)

**Goal**: Set up Nx monorepo structure without breaking the existing web app.

| # | Task | Details |
|---|------|---------|
| 0.1 | Install Nx globally | `npm i -g nx` |
| 0.2 | Initialize Nx workspace | `npx create-nx-workspace@latest extracker-mono --preset=ts` |
| 0.3 | Configure pnpm workspaces | Create `pnpm-workspace.yaml` with apps/* and packages/* |
| 0.4 | Set up `tsconfig.base.json` | Root TypeScript config with path aliases |
| 0.5 | Create `packages/config` | Shared ESLint and TypeScript configs |
| 0.6 | Move existing app to `apps/web` | Relocate all current files, update imports |
| 0.7 | Verify web app builds | `nx run web:build` must pass |
| 0.8 | Update CLAUDE.md | Add monorepo commands and structure |

**Deliverable**: Existing web app runs unchanged inside Nx monorepo.

---

### Phase 1: Extract Shared Packages (Week 2)

**Goal**: Pull out reusable code into shared packages.

| # | Task | Details |
|---|------|---------|
| 1.1 | Create `@extracker/db` | Move `prisma/` → `packages/db/prisma/`, move `lib/db/prisma.ts` → `packages/db/src/client.ts` |
| 1.2 | Create `@extracker/types` | Move `types/*.ts` → `packages/shared-types/src/`, create barrel exports |
| 1.3 | Create `@extracker/core` | Move `lib/utils/date-helpers.ts`, `currency-helpers.ts`, `card-validation.ts` → `packages/core/src/` |
| 1.4 | Move validation logic | Extract validation from Server Actions → `packages/core/src/validation/` |
| 1.5 | Move constants | Move `lib/constants/` → `packages/core/src/constants/` |
| 1.6 | Update web app imports | Replace `@/types/`, `@/lib/utils/`, `@/lib/db/prisma` with `@extracker/*` |
| 1.7 | Verify web app builds | All imports resolve, `nx run web:build` passes |
| 1.8 | Add package build tasks | Configure `nx` build pipeline for packages |

**Deliverable**: Shared packages extracted. Web app uses `@extracker/db`, `@extracker/types`, `@extracker/core`.

---

### Phase 2: Elysia.js API Server (Weeks 3-5)

**Goal**: Build the complete REST API for mobile consumption.

#### Week 3: Foundation

| # | Task | Details |
|---|------|---------|
| 2.1 | Scaffold `apps/api` | Initialize Elysia.js project with Bun |
| 2.2 | Configure plugins | JWT, CORS, Swagger, Bearer plugins |
| 2.3 | Set up auth middleware | JWT verification, userId extraction |
| 2.4 | Build auth routes | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/google` |
| 2.5 | Add RefreshToken model | Update Prisma schema, run migration |
| 2.6 | Build password reset routes | `POST /auth/forgot-password`, `/auth/verify-code`, `/auth/reset-password` |
| 2.7 | Set up error handling | Global error handler with consistent error responses |
| 2.8 | Test auth flow | Register → Login → Access protected route → Refresh token |

#### Week 4: Core CRUD Endpoints

| # | Task | Details |
|---|------|---------|
| 2.9  | Expense routes | `GET`, `POST`, `PATCH /:id`, `DELETE /:id`, `POST /:id/mark-paid` |
| 2.10 | Category routes | `GET`, `POST`, `PATCH /:id`, `DELETE /:id` |
| 2.11 | Payment card routes | `GET`, `GET /:id/with-stats`, `POST`, `PATCH /:id`, `DELETE /:id` |
| 2.12 | Notification routes | `GET`, `GET /stats`, `PATCH /:id/read`, `POST /read-all`, `DELETE /:id`, `DELETE /read` |
| 2.13 | Dashboard route | `GET /dashboard` — stats, upcoming, category breakdown |
| 2.14 | Settings routes | `GET /settings`, `PATCH /settings` |
| 2.15 | Currency routes | `GET /currency/rates` |
| 2.16 | Export App type | `export type App = typeof app` for Eden Treaty |

#### Week 5: Polish & Testing

| # | Task | Details |
|---|------|---------|
| 2.17 | Add request validation | Elysia `t.Object()` schemas on all routes |
| 2.18 | Add rate limiting | Per-IP and per-user rate limits |
| 2.19 | Add pagination | Cursor-based or offset pagination on list endpoints |
| 2.20 | Swagger docs review | Verify all endpoints documented |
| 2.21 | Integration testing | Test all endpoints with Bun test runner |
| 2.22 | Docker setup | `Dockerfile` for API server |

**Deliverable**: Fully functional REST API with Swagger docs at `http://localhost:4000/swagger`.

---

### Phase 3: React Native Mobile App — Foundation (Weeks 6-8)

**Goal**: Build mobile app with core screens and navigation.

#### Week 6: Project Setup & Auth

| # | Task | Details |
|---|------|---------|
| 3.1  | Scaffold Expo app | `npx create-expo-app@latest apps/mobile` |
| 3.2  | Configure Expo Router | File-based navigation with auth guard |
| 3.3  | Set up Eden Treaty client | Type-safe API client with token management |
| 3.4  | Set up TanStack Query | QueryClient provider, default options |
| 3.5  | Set up Zustand stores | Auth store (tokens, user), UI store |
| 3.6  | Build login screen | Email/password form, Google Sign-In button |
| 3.7  | Build register screen | Name, email, password form |
| 3.8  | Implement auth flow | Login → store tokens → navigate to tabs |
| 3.9  | Implement token refresh | Auto-refresh on 401, logout on refresh failure |
| 3.10 | Build auth guard | Redirect to login if no token |

#### Week 7: Core Screens

| # | Task | Details |
|---|------|---------|
| 3.11 | Build dashboard screen | Stats cards, upcoming expenses, category chart |
| 3.12 | Build expense list screen | List with filters, pull-to-refresh, infinite scroll |
| 3.13 | Build expense detail screen | Full expense info, payment history, mark paid |
| 3.14 | Build create expense screen | Form with category picker, card picker, date picker |
| 3.15 | Build edit expense screen | Pre-filled form, update mutation |
| 3.16 | Delete expense | Swipe-to-delete or delete button with confirmation |

#### Week 8: Secondary Screens

| # | Task | Details |
|---|------|---------|
| 3.17 | Build notification screen | Notification list with unread badge, mark read |
| 3.18 | Build category management | List, create, edit, delete categories |
| 3.19 | Build payment card screen | List, add, edit, delete payment cards |
| 3.20 | Build profile screen | User info, change password |
| 3.21 | Build settings screen | Theme, currency, notification preferences |
| 3.22 | Tab navigation | Bottom tabs: Dashboard, Expenses, Notifications, Profile |

**Deliverable**: Functional mobile app with all core screens.

---

### Phase 4: Mobile Polish & Features (Weeks 9-10)

**Goal**: Native mobile experience with platform-specific features.

| # | Task | Details |
|---|------|---------|
| 4.1  | Push notifications | Expo Notifications + backend integration |
| 4.2  | Offline support | TanStack Query offline persistence |
| 4.3  | Biometric auth | Face ID / fingerprint to unlock app |
| 4.4  | Pull-to-refresh | On all list screens |
| 4.5  | Haptic feedback | On mark-paid, delete, create actions |
| 4.6  | Dark mode | Sync with system theme or user preference |
| 4.7  | App icon & splash screen | Branded assets |
| 4.8  | Loading skeletons | Skeleton screens while data loads |
| 4.9  | Error boundaries | Graceful error handling with retry |
| 4.10 | Animations | Screen transitions, list item animations |

**Deliverable**: Polished mobile app ready for internal testing.

---

### Phase 5: Integration & Testing (Weeks 11-12)

**Goal**: End-to-end testing, CI/CD, and deployment readiness.

| # | Task | Details |
|---|------|---------|
| 5.1  | E2E tests (API) | Full endpoint testing with Bun test |
| 5.2  | E2E tests (Mobile) | Detox or Maestro for mobile UI testing |
| 5.3  | Cross-platform testing | iOS Simulator + Android Emulator |
| 5.4  | CI pipeline (Nx) | GitHub Actions with `nx affected` for efficient CI |
| 5.5  | API deployment | Docker → Cloud Run / Railway / Fly.io |
| 5.6  | Mobile builds | EAS Build for iOS and Android |
| 5.7  | OTA updates | EAS Update for over-the-air JS updates |
| 5.8  | Environment configs | Staging + production env management |
| 5.9  | Monitoring | API health checks, error tracking (Sentry) |
| 5.10 | Performance audit | API response times, mobile startup time |

**Deliverable**: All apps deployed, CI/CD running, monitoring active.

---

### Phase 6: Advanced Features (Post-Launch)

| # | Feature | Platform | Details |
|---|---------|----------|---------|
| 6.1 | Real-time sync | Mobile | Supabase Realtime subscriptions via API |
| 6.2 | Receipt OCR | Mobile | Camera → OCR → auto-fill expense form |
| 6.3 | Widgets | Mobile | iOS/Android home screen widgets (expense summary) |
| 6.4 | Export | Both | CSV/PDF export via API endpoint |
| 6.5 | Budget tracking | Both | Budget limits per category with alerts |
| 6.6 | Shared expenses | Both | Family/team expense sharing |
| 6.7 | Apple/Google Wallet | Mobile | Payment card integration |
| 6.8 | Siri/Google Assistant | Mobile | Voice commands for quick expense entry |
| 6.9 | Advanced analytics | Both | Monthly trends, spending predictions |
| 6.10 | Multi-language (i18n) | Both | Georgian, English + more |

---

## 9. API Endpoints Specification

### Authentication (`/auth`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/auth/register` | Create account (email, password, name) | No |
| `POST` | `/auth/login` | Login with credentials → access + refresh tokens | No |
| `POST` | `/auth/google` | Login with Google ID token | No |
| `POST` | `/auth/refresh` | Refresh access token using refresh token | No |
| `POST` | `/auth/logout` | Revoke refresh token | Yes |
| `POST` | `/auth/forgot-password` | Request password reset code | No |
| `POST` | `/auth/verify-code` | Verify 6-digit reset code | No |
| `POST` | `/auth/reset-password` | Reset password with verified code | No |
| `POST` | `/auth/change-password` | Change password (authenticated) | Yes |

### Expenses (`/expenses`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/expenses` | List expenses (filters, pagination) | Yes |
| `GET` | `/expenses/:id` | Get expense by ID | Yes |
| `POST` | `/expenses` | Create expense | Yes |
| `PATCH` | `/expenses/:id` | Update expense | Yes |
| `DELETE` | `/expenses/:id` | Delete expense | Yes |
| `POST` | `/expenses/:id/mark-paid` | Mark latest payment as paid | Yes |

### Categories (`/categories`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/categories` | List user categories | Yes |
| `GET` | `/categories/:id` | Get category by ID | Yes |
| `POST` | `/categories` | Create category | Yes |
| `PATCH` | `/categories/:id` | Update category | Yes |
| `DELETE` | `/categories/:id` | Delete category (fails if in use) | Yes |

### Payment Cards (`/payment-cards`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/payment-cards` | List payment cards | Yes |
| `GET` | `/payment-cards/:id` | Get card with expense stats | Yes |
| `POST` | `/payment-cards` | Add payment card | Yes |
| `PATCH` | `/payment-cards/:id` | Update card | Yes |
| `DELETE` | `/payment-cards/:id` | Delete card (unlinks expenses) | Yes |

### Notifications (`/notifications`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/notifications` | List notifications (paginated) | Yes |
| `GET` | `/notifications/stats` | Get total + unread count | Yes |
| `GET` | `/notifications/:id` | Get notification detail | Yes |
| `PATCH` | `/notifications/:id/read` | Mark as read | Yes |
| `POST` | `/notifications/read-all` | Mark all as read | Yes |
| `DELETE` | `/notifications/:id` | Delete notification | Yes |
| `DELETE` | `/notifications/read` | Delete all read notifications | Yes |

### Dashboard (`/dashboard`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/dashboard` | Full dashboard (stats, upcoming, categories) | Yes |

### Settings (`/settings`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/settings` | Get user settings | Yes |
| `PATCH` | `/settings` | Update settings | Yes |

### User (`/user`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/user/profile` | Get user profile | Yes |
| `PATCH` | `/user/profile` | Update profile (name, image) | Yes |

### Currency (`/currency`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/currency/rates` | Get GEL/USD/EUR rates from NBG | No |

---

## 10. Mobile Feature Parity Matrix

| Feature | Web (Current) | Mobile (Phase 3) | Mobile (Phase 4+) |
|---------|:---:|:---:|:---:|
| **Auth: Email/Password** | YES | YES | YES |
| **Auth: Google OAuth** | YES | YES | YES |
| **Auth: Biometric** | N/A | - | YES |
| **Dashboard: Stats** | YES | YES | YES |
| **Dashboard: Charts** | YES (Recharts) | YES (Victory Native) | YES |
| **Expense: List** | YES | YES | YES |
| **Expense: Create** | YES | YES | YES |
| **Expense: Edit** | YES | YES | YES |
| **Expense: Delete** | YES | YES | YES |
| **Expense: Mark Paid** | YES | YES | YES |
| **Expense: Filters** | YES | YES | YES |
| **Expense: Recurring** | YES | YES | YES |
| **Categories: CRUD** | YES | YES | YES |
| **Payment Cards: CRUD** | YES | YES | YES |
| **Notifications: List** | YES | YES | YES |
| **Notifications: Badge** | YES | YES | YES |
| **Notifications: Push** | - | - | YES |
| **Settings: Theme** | YES | YES | YES |
| **Settings: Currency** | YES | YES | YES |
| **Settings: Preferences** | YES | YES | YES |
| **Profile: Edit** | YES | YES | YES |
| **Profile: Password** | YES | YES | YES |
| **Currency Converter** | YES | YES | YES |
| **Offline Mode** | - | - | YES |
| **Receipt OCR** | - | - | Phase 6 |
| **Export CSV/PDF** | - | - | Phase 6 |
| **Widgets** | N/A | - | Phase 6 |

---

## 11. DevOps & Deployment

### Nx Commands

```bash
# Development
nx run web:dev                  # Start Next.js dev server (port 3000)
nx run api:dev                  # Start Elysia dev server (port 4000)
nx run mobile:start             # Start Expo dev server (port 8081)

# Build
nx run web:build                # Build Next.js for production
nx run api:build                # Bundle Elysia for production
nx run mobile:build:ios         # EAS Build for iOS
nx run mobile:build:android     # EAS Build for Android

# Database
nx run db:generate              # Generate Prisma Client
nx run db:push                  # Push schema to database
nx run db:studio                # Open Prisma Studio
nx run db:seed                  # Seed database

# Test
nx run api:test                 # Run API tests
nx run mobile:test              # Run mobile tests
nx run-many --target=test       # Run all tests

# CI (only affected)
nx affected --target=build      # Build only changed apps/packages
nx affected --target=test       # Test only changed apps/packages
nx affected --target=lint       # Lint only changed apps/packages
```

### Deployment Targets

| App | Platform | Strategy |
|-----|----------|----------|
| `apps/web` | Vercel | Auto-deploy from `main` branch |
| `apps/api` | Railway / Fly.io / Cloud Run | Docker container, auto-deploy |
| `apps/mobile` | App Store + Google Play | EAS Build + EAS Submit |

### Docker Compose (Local Dev)

```yaml
# docker-compose.yml (root)
services:
  api:
    build: ./apps/api
    ports:
      - "4000:4000"
    env_file: .env.local
    depends_on:
      - db

  web:
    build: ./apps/web
    ports:
      - "3000:3000"
    env_file: .env.local

  # Optional: local PostgreSQL for development
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: extracker
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### Environment Variables (API Server)

```bash
# apps/api/.env
DATABASE_URL=postgresql://...         # Same as web
DIRECT_URL=postgresql://...           # Same as web
JWT_SECRET=your-jwt-secret            # For access tokens
JWT_REFRESH_SECRET=your-refresh-secret # For refresh tokens
GOOGLE_CLIENT_ID=...                  # For mobile Google auth verification
RESEND_API_KEY=re_...                 # Email notifications
CORS_ORIGINS=http://localhost:3000,exp://localhost:8081
```

---

## 12. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Bun compatibility** | Prisma or deps may have Bun issues | Test early in Phase 2.1; fallback to Node.js runtime for Elysia if needed |
| **Auth token security** | Token theft on mobile | Use expo-secure-store (encrypted), short access token TTL (15min), refresh rotation |
| **Two auth systems** | Web (Auth.js) and API (JWT) divergence | Share `bcryptjs` hashing, same Google Client ID, document both flows |
| **Schema drift** | `packages/db` changes breaking apps | Use `nx affected` CI to catch breakage; Prisma migration review |
| **Mobile store rejection** | App Store/Play Store review delays | Start submission early, follow platform guidelines from Phase 4 |
| **Shared package changes** | Breaking changes in `@extracker/core` | Semver versioning, run `nx affected --target=build` before merge |
| **API performance** | Slow queries under load | Add database indexes, implement caching (Redis later), pagination from day 1 |
| **Offline conflicts** | Mobile offline edits conflict with server | Implement last-write-wins with conflict UI in Phase 4 |

---

## Summary Timeline

```
Week 1        Phase 0: Nx monorepo setup, move web app
Week 2        Phase 1: Extract shared packages (@extracker/db, types, core)
Weeks 3-5     Phase 2: Build Elysia.js API (auth, CRUD, dashboard, docs)
Weeks 6-8     Phase 3: React Native mobile app (auth, core screens, navigation)
Weeks 9-10    Phase 4: Mobile polish (push notifications, offline, biometrics)
Weeks 11-12   Phase 5: Testing, CI/CD, deployment
Post-launch   Phase 6: Advanced features (OCR, widgets, analytics, i18n)
```

**Total estimated timeline: 12 weeks to production-ready mobile app.**
