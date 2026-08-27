---
name: nextjs-frontend
description: Expert guidance for production-grade Next.js App Router frontends in TypeScript with React 19 — Server Components, rendering strategy (SSG/SSR/ISR/streaming/PPR via Cache Components), TanStack Query for server state, Zustand for client UI state, Server Actions, and optimistic updates. Use whenever the user designs, scaffolds, or refactors a Next.js frontend — pages, layouts, Server vs Client Components, Suspense, mutations, hydration, or state-management choices. Triggers on "Next.js," "App Router," "Server/Client Component," "RSC," "SSR," "SSG," "ISR," "PPR," "Partial Prerendering," "use cache," "streaming," "Suspense," "Server Action," "useOptimistic," "optimistic update," "TanStack Query," "React Query," "useQuery," "useMutation," "HydrationBoundary," "Zustand," "where should this state live," or any request to build, render, fetch data for, or manage state in a Next.js frontend — even just "build the UI" or "make this load faster" in React/TypeScript. Prefer over generic React guidance for App Router.
---

# Next.js Frontend

Build fast, correct, production-grade Next.js **App Router** frontends with React 19 and TypeScript. This skill encodes current best practices (verified against the official Next.js 16 and TanStack Query v5 docs) for the decisions teams most often get wrong: which component runs where, which rendering strategy a route should use, where each piece of state belongs, and how to make mutations feel instant without lying to the user.

## How to use this skill

1. Identify what the task touches: project structure, the Server/Client boundary, rendering strategy, server-state fetching, client state, mutations/optimistic updates, or performance.
2. Apply the **Core conventions** below to every task.
3. For anything non-trivial, open the matching reference file — they contain complete, copy-ready implementations and rationale. Don't reconstruct these from memory; the references are the source of truth and pin current (Next.js 16 / React 19 / TanStack Query v5) APIs.
4. When the user is on a specific version or has unusual requirements, query Context7 (`/vercel/next.js`, `/tanstack/query`, `/pmndrs/zustand`) for the latest docs rather than guessing — these APIs move fast.

## Reference files

Read the relevant file before writing code in that area:

| File | When to read |
|------|--------------|
| `references/project-structure.md` | App Router file conventions, route groups, colocation, the Server/Client Component boundary, where `"use client"` goes, folder layout |
| `references/rendering.md` | Choosing SSG/SSR/ISR/streaming/PPR, `cacheComponents` + `"use cache"`, `<Suspense>` + `loading.tsx`, `generateStaticParams`, dynamic APIs, the static-shell-plus-dynamic-hole model |
| `references/server-state-tanstack.md` | TanStack Query v5 with the App Router — `getQueryClient`, provider setup, prefetch + `dehydrate` + `HydrationBoundary`, `useQuery`/`useSuspenseQuery`, query keys, invalidation, streaming prefetch |
| `references/client-state-zustand.md` | Zustand stores done correctly in App Router (per-request store via Context, no module-level singletons), slices, selectors, persist, when to reach for it vs. URL/server state |
| `references/mutations-optimistic.md` | Server Actions, `useOptimistic`, `useActionState`, optimistic updates with TanStack Query (`onMutate`/rollback), revalidation (`revalidatePath`/`revalidateTag`), form patterns |
| `references/libraries.md` | Curated, current library choices (forms, validation, tables, styling, animation, icons) and what to avoid, with install commands |

## Core conventions (apply to every task)

**Server Components are the default; reach for the client deliberately.** Every component is a Server Component until proven otherwise. Add `"use client"` only when a file needs interactivity (state, effects, event handlers) or browser-only APIs. Push the `"use client"` boundary as far down the tree as possible — a leaf button, not a whole page — so the static shell stays server-rendered and the JS bundle stays small. See `references/project-structure.md`.

**Match the rendering strategy to the data, not by habit.** Static content prerenders (SSG/ISR); per-request content renders dynamically (SSR); a page with both gets a static shell with dynamic holes streamed in (PPR). In Next.js 16 PPR ships via **Cache Components** (`cacheComponents: true` + the `"use cache"` directive) — the old `experimental.ppr` flag is gone. Default everything to dynamic, then opt the cacheable parts in. See `references/rendering.md`.

**Put state where it belongs.** There are four homes for state, in order of preference: (1) the **server / URL** (search params, route params) for anything shareable or bookmarkable; (2) **server state via TanStack Query** for data that lives in a database and is fetched/cached/invalidated; (3) **local component state** (`useState`) for ephemeral UI; (4) **Zustand** for genuinely global *client* UI state (theme, sidebar, command palette, multi-step wizard) that many components share. Don't put server data in Zustand, and don't build a global store for state one component owns. See `references/client-state-zustand.md` and `references/server-state-tanstack.md`.

**Server state ≠ client state.** Data owned by the backend (lists, entities, anything fetched) is *server state* — own it with TanStack Query (caching, dedup, background refetch, invalidation) or RSC fetches, never a hand-rolled `useEffect`+`useState` fetch and never Zustand. Reserve client-state tools for state the client alone owns. See `references/server-state-tanstack.md`.

**Mutations are optimistic and reconciled.** User actions reflect in the UI immediately (`useOptimistic` for Server Actions, `onMutate`/rollback for TanStack mutations), then reconcile against the server result and roll back on error. After a successful mutation, revalidate the affected data (`revalidatePath`/`revalidateTag` on the server, `invalidateQueries` on the client). See `references/mutations-optimistic.md`.

**Type everything, validate at the boundary.** Strict TypeScript throughout. Validate external input — Server Action args, form data, route/search params — with a schema (Zod) before trusting it; never trust client-supplied data because it came through a Server Action. See `references/libraries.md`.

## Decision: how should this route render?

Walk this in order (full detail in `references/rendering.md`):

1. **Is the content the same for everyone and stable?** → Static (SSG). Add `generateStaticParams` for dynamic segments. Wrap cacheable work in `"use cache"`.
2. **Is it the same for everyone but needs periodic freshness?** → Static + revalidation (ISR) via `"use cache"` + `cacheLife`.
3. **Is the whole page per-request/personalized end to end?** → Dynamic (SSR). Standard streaming with `loading.tsx` usually beats PPR here.
4. **Is it mostly static with a few personalized/dynamic regions?** → **PPR**: cache the shell, wrap each dynamic region in `<Suspense>` so it streams into a hole. This is the sweet spot — product pages, dashboards with a static frame, marketing-meets-app surfaces.
5. **Does a region depend on client-only interaction or live updates?** → fetch on the client with TanStack Query (optionally server-prefetched + hydrated).

## Decision: where should this state live?

```
Is it derived from or owned by the backend (DB rows, fetched lists/entities)?
  └─ YES → server state. RSC fetch for read-only/SSR; TanStack Query if the client
            reads/mutates/refetches it. NEVER Zustand, NEVER useEffect+useState.
Is it shareable / bookmarkable / should survive refresh (filters, tab, page)?
  └─ YES → URL state (searchParams / route params).
Is it owned by one component and ephemeral (input value, open/closed)?
  └─ YES → local useState.
Is it global CLIENT UI state many components read (theme, sidebar, wizard, cart-UI)?
  └─ YES → Zustand (per-request store via provider — see reference).
```

## Standard app layout

```
src/
├── app/
│   ├── layout.tsx              # root layout: <html>, providers, fonts
│   ├── page.tsx
│   ├── globals.css
│   ├── providers.tsx           # "use client" — QueryClientProvider, store providers, theme
│   ├── (marketing)/            # route group — shared layout, no URL segment
│   │   └── ...
│   └── (app)/
│       └── dashboard/
│           ├── layout.tsx
│           ├── page.tsx        # Server Component: prefetch + <HydrationBoundary>
│           ├── loading.tsx     # Suspense fallback for the segment
│           ├── error.tsx       # "use client" error boundary
│           └── _components/    # route-private components (leading underscore)
├── components/
│   ├── ui/                     # design-system primitives (often "use client" leaves)
│   └── ...
├── lib/
│   ├── query/
│   │   ├── get-query-client.ts # request-scoped QueryClient factory
│   │   └── keys.ts             # query key factories
│   ├── stores/                 # Zustand store creators + providers
│   ├── actions/                # "use server" Server Actions (Zod-validated)
│   ├── data/                   # server-only data access (DAL)
│   └── validators/             # Zod schemas shared by actions + forms
└── types/
```

## When generating code

- Produce complete, runnable files — imports and `"use client"`/`"use server"` directives included — not fragments.
- Default new components to Server Components. Add `"use client"` only at the smallest interactive leaf; never slap it on a layout or page to "make an error go away."
- A Server Component may render a Client Component and pass serializable props; a Client Component may **not** import a Server Component (pass it as `children`/props instead).
- For any data the client will read after navigation or mutate, prefetch on the server and hydrate (`prefetchQuery` + `dehydrate` + `<HydrationBoundary>`) rather than fetching cold on the client.
- Keep query keys in a key-factory module; never inline string keys at call sites (invalidation breaks silently when they drift).
- Create the `QueryClient` with the request-scoped factory pattern (`references/server-state-tanstack.md`) — never as a module-level singleton, or you leak one user's cache to another.
- Validate every Server Action input with a Zod schema before use; return typed result objects, not thrown strings.
- If the user hasn't pinned versions, target current stable (Next.js 16 / React 19 / TanStack Query v5) and say so; if they're on Next.js 15, note the PPR/config differences from `references/rendering.md`.
