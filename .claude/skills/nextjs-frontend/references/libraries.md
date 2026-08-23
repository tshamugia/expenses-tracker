# Library Choices (current, opinionated)

Curated defaults for an App Router + TypeScript frontend. These pair cleanly with Server Components, Server Actions, TanStack Query, and Zustand. Prefer these over older/heavier alternatives unless the user has a reason. Confirm latest versions via Context7 (`/tanstack/query`, `/pmndrs/zustand`, `/colinhacks/zod`, `/react-hook-form/react-hook-form`) when version-sensitive.

## Core

| Need | Use | Notes |
|------|-----|-------|
| Framework | **Next.js 16** (App Router) | React 19, Cache Components/PPR, stable Turbopack. |
| Language | **TypeScript** (strict) | `strict`, `noUncheckedIndexedAccess` recommended. |
| Server state | **@tanstack/react-query** v5 | See `references/server-state-tanstack.md`. |
| Client UI state | **zustand** | See `references/client-state-zustand.md`. |
| Validation | **zod** | Schemas shared by Server Actions + forms; single source of truth for input types. |

## Forms

| Need | Use | Notes |
|------|-----|-------|
| Form state & validation | **react-hook-form** + **@hookform/resolvers** (zod) | For rich client forms. For simple forms, native `<form action={serverAction}>` + `useActionState` needs no library. |
| Simple mutations | Server Action + `useActionState` | Progressive enhancement, no client form lib required. |

## UI / styling

| Need | Use | Notes |
|------|-----|-------|
| Styling | **Tailwind CSS** v4 | Zero-runtime, plays well with RSC. |
| Component primitives | **shadcn/ui** (Radix under the hood) | Copy-in components you own; accessible. Each is a `"use client"` leaf where needed. |
| Headless primitives | **@radix-ui/react-\*** | If not using shadcn. |
| Icons | **lucide-react** | Tree-shakeable. |
| Animation | **motion** (formerly framer-motion) | Client-only; keep in leaves. |

## Data display

| Need | Use | Notes |
|------|-----|-------|
| Tables | **@tanstack/react-table** | Headless; pairs with TanStack Query for server-side pagination/sort/filter (drive those off **URL search params** so they're shareable). |
| Virtualization | **@tanstack/react-virtual** | Long lists/tables. |
| Charts | **recharts** | Or `@tanstack/react-charts` / visx for advanced needs. Render in client leaves. |

## URL state (don't reinvent)

For filters/tabs/pagination that should be shareable and survive refresh, keep them in **search params** rather than a store. `nuqs` gives typed, ergonomic `useState`-like hooks over the URL in the App Router. This is the right home for "table is sorted by X, page 2, filtered to tag Y."

## Auth (client integration)

This skill is frontend-focused; for the backend, defer to the user's NestJS/Better Auth setup. On the frontend, read the session in an RSC (server) where possible and pass down, rather than fetching it client-side. Never read session/auth state in a cached static shell (breaks PPR — see `references/rendering.md`).

## Install (pick what the task needs)

```bash
# core
npm i @tanstack/react-query zustand zod
npm i -D @tanstack/react-query-devtools

# forms (rich client forms)
npm i react-hook-form @hookform/resolvers

# ui
npm i lucide-react motion
# tailwind v4 + shadcn/ui: follow their init CLIs

# data
npm i @tanstack/react-table @tanstack/react-virtual recharts

# url state
npm i nuqs
```

## What to avoid (and why)

- **Redux for server data** — TanStack Query already solves caching/dedup/invalidation; Redux reimplements it by hand.
- **`useEffect` + `useState` data fetching** — no caching, racey, waterfalls; use an RSC fetch or TanStack Query.
- **Global Zustand store for everything** — server data belongs in Query; bookmarkable state belongs in the URL; component-owned state belongs in `useState`.
- **`getServerSideProps`/`getStaticProps`** — Pages Router APIs; in App Router you fetch in Server Components.
- **Module-level `QueryClient` / Zustand store** — leaks state across SSR requests; use the request-scoped patterns in the references.
- **`experimental.ppr` on Next.js 16** — removed; use `cacheComponents` + `"use cache"`.
