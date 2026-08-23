# Project Structure & the Server/Client Boundary

Covers: App Router file conventions, route groups, colocation, the Server vs Client Component boundary, where `"use client"` belongs, and how to compose the two without paying for it.

## App Router file conventions

Inside `app/`, certain filenames are special — they define the route's behavior:

| File | Role |
|------|------|
| `layout.tsx` | Shared UI that wraps a segment and its children; preserves state across navigation. The root `layout.tsx` is required and renders `<html>`/`<body>`. Server Component by default. |
| `page.tsx` | The route's leaf UI; makes the segment publicly routable. Receives `params` and `searchParams` (both **Promises** in Next.js 15+ — `await` them). |
| `loading.tsx` | Instant Suspense fallback for the segment while it (and its data) stream in. |
| `error.tsx` | Error boundary for the segment. Must be a Client Component (`"use client"`); receives `error` and `reset`. |
| `not-found.tsx` | UI for `notFound()` and unmatched routes. |
| `route.ts` | Route Handler (API endpoint) — cannot coexist with `page.tsx` in the same segment. |
| `template.tsx` | Like a layout but remounts on navigation (no preserved state). |
| `default.tsx` | Fallback for unmatched parallel-route slots. |

### Route groups and private folders

- `(group)` — parentheses make a folder a **route group**: it organizes routes and can hold its own `layout.tsx` **without adding a URL segment**. Use it to give marketing pages one layout and app pages another, e.g. `app/(marketing)/` and `app/(app)/`.
- `_folder` — a leading underscore makes a folder **private**: opted out of routing. Use `_components/`, `_lib/` for route-colocated code that should never become a route.
- `[slug]` dynamic, `[...slug]` catch-all, `[[...slug]]` optional catch-all.
- `@slot` — named slot for **parallel routes**; `(.)`, `(..)`, `(...)` — **intercepting routes** (e.g. modal-over-page patterns).

### Colocation

Files that aren't special route files are safe to colocate inside `app/` — only `page.tsx`/`route.ts` make a segment routable. Prefer route-private `_components/` for components used by exactly one route; promote to top-level `components/` only when shared across routes.

## The Server/Client Component boundary

This is the single most important concept in the App Router.

### Server Components (the default)

Every component under `app/` is a **Server Component** unless a `"use client"` directive is in scope. They:

- run only on the server; their code never ships to the browser (smaller bundles),
- can be `async` and `await` data directly (DB calls, `fetch`, file system, secrets),
- **cannot** use hooks (`useState`, `useEffect`), event handlers, or browser APIs.

Do data fetching and secret access here. Keep them the bulk of your tree.

### Client Components

A file with `"use client"` at the top (and everything it imports) becomes part of the **client bundle**. They:

- can use state, effects, event handlers, and browser APIs,
- run on the server for the initial render (for HTML) **and** hydrate on the client,
- **cannot** be `async` and cannot directly access server-only resources/secrets.

`"use client"` marks the **boundary**, not a single file: every module imported by a Client Component is also client code. So place the directive at the smallest interactive leaf.

### The rules of composition

1. **Server can render Client.** A Server Component can import and render a Client Component and pass it **serializable** props (no functions, no Dates-as-class-instances unless serializable, no server-only objects).
2. **Client cannot import Server.** A Client Component must not `import` a Server Component. Instead, **pass Server Components as `children` or props** from a parent Server Component:

```tsx
// ✅ Server Component composes them; the client wrapper just renders {children}
// app/(app)/dashboard/page.tsx  (Server Component)
import { InteractiveShell } from './_components/interactive-shell' // "use client"
import { ServerStats } from './_components/server-stats'          // Server Component

export default function Page() {
  return (
    <InteractiveShell>
      <ServerStats /> {/* stays server-rendered, slotted into the client shell */}
    </InteractiveShell>
  )
}
```

```tsx
// app/(app)/dashboard/_components/interactive-shell.tsx
'use client'
import { useState, type ReactNode } from 'react'

export function InteractiveShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)}>Toggle</button>
      {open && children}
    </div>
  )
}
```

3. **Push the boundary down.** Don't make a whole page a Client Component because one button needs `onClick`. Extract the button. The page stays a Server Component; only the button ships JS.

### `server-only` / `client-only`

Guard modules that must never cross the boundary:

```ts
import 'server-only' // throws at build if imported into a Client Component
```

Put this at the top of your data-access layer (`lib/data/*`) and anything touching secrets, so an accidental client import fails loudly instead of leaking keys into the bundle.

## Providers without poisoning the tree

Client-side providers (TanStack Query, theme, Zustand store) need `"use client"`. Isolate them in one `app/providers.tsx` so the root layout stays a Server Component:

```tsx
// app/providers.tsx
'use client'
import { type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { getQueryClient } from '@/lib/query/get-query-client'

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

```tsx
// app/layout.tsx  (stays a Server Component)
import { Providers } from './providers'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

Wrapping `{children}` in a Client Component does **not** turn the children into client code — children are rendered by the server and passed in. This is the key trick for keeping provider trees cheap.

## Common boundary mistakes

- Adding `"use client"` to a layout or page to silence a hook error → instead extract the interactive part into a leaf Client Component.
- `import`ing a Server Component into a Client Component → pass it as `children`/prop instead.
- Passing non-serializable props (functions, class instances) from Server → Client → keep props plain; pass behavior via Server Actions or define handlers inside the Client Component.
- Fetching in a Client Component with `useEffect` when the data is server-owned → fetch in the RSC, or use TanStack Query with server prefetch + hydration.
