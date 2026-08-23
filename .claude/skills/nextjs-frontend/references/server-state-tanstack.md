# Server State with TanStack Query (v5) + App Router

Covers: request-scoped `QueryClient`, provider setup, server prefetch + `dehydrate` + `HydrationBoundary`, `useQuery` vs `useSuspenseQuery`, query-key factories, invalidation, and streaming prefetch.

> Use TanStack Query for **server state the client reads/mutates/refetches**: lists, entities, anything fetched from your API after navigation or interaction. For read-only first-paint data, a plain RSC `await fetch` is simpler — reach for Query when you need caching, dedup, background refetch, polling, infinite scroll, or client mutations.

## The request-scoped QueryClient (do this right or leak data)

Never create a module-level `QueryClient` shared across requests — on the server that mixes one user's cache into another's. Use a factory that makes a fresh client per server request and reuses one in the browser:

```ts
// lib/query/get-query-client.ts
import {
  QueryClient,
  defaultShouldDehydrateQuery,
  isServer,
} from '@tanstack/react-query'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // >0 so server-fetched data isn't refetched instantly on the client
      },
      dehydrate: {
        // include pending queries so streaming/prefetch-without-await works
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

export function getQueryClient() {
  if (isServer) {
    // server: always a new client per request
    return makeQueryClient()
  }
  // browser: reuse a single client across renders (avoid re-creating on suspense)
  if (!browserQueryClient) browserQueryClient = makeQueryClient()
  return browserQueryClient
}
```

## Provider (Client Component)

```tsx
// app/providers.tsx
'use client'
import { type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { getQueryClient } from '@/lib/query/get-query-client'

export function Providers({ children }: { children: ReactNode }) {
  // get (not useState init) — the factory already handles the browser singleton
  const queryClient = getQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

Wire it once in the root layout (see `references/project-structure.md`). Add `<ReactQueryDevtools />` inside the provider in dev.

## Query-key factories (never inline keys)

Drifting string keys silently break invalidation. Centralize them:

```ts
// lib/query/keys.ts
export const postKeys = {
  all: ['posts'] as const,
  lists: () => [...postKeys.all, 'list'] as const,
  list: (filters: { tag?: string }) => [...postKeys.lists(), filters] as const,
  details: () => [...postKeys.all, 'detail'] as const,
  detail: (id: string) => [...postKeys.details(), id] as const,
}
```

Colocate query options with the key so server and client share one definition:

```ts
// lib/query/posts.ts
import { queryOptions } from '@tanstack/react-query'
import { postKeys } from './keys'
import { fetchPost } from '@/lib/data/posts'

export const postOptions = (id: string) =>
  queryOptions({
    queryKey: postKeys.detail(id),
    queryFn: () => fetchPost(id),
  })
```

## Server prefetch → dehydrate → hydrate

The core App Router pattern: prefetch in a Server Component, dehydrate the cache, hand it to a `<HydrationBoundary>` that wraps the Client Component which reads it. The client then has data immediately on first paint and "upgrades" it (background refetch if stale) once JS loads.

```tsx
// app/blog/[id]/page.tsx  (Server Component)
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient } from '@/lib/query/get-query-client'
import { postOptions } from '@/lib/query/posts'
import { Post } from './_components/post' // "use client", uses useQuery(postOptions)

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const queryClient = getQueryClient()

  // prefetch on the server; void = don't block render (stream-friendly)
  void queryClient.prefetchQuery(postOptions(id))

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Post id={id} />
    </HydrationBoundary>
  )
}
```

```tsx
// app/blog/[id]/_components/post.tsx
'use client'
import { useQuery } from '@tanstack/react-query'
import { postOptions } from '@/lib/query/posts'

export function Post({ id }: { id: string }) {
  const { data, isPending } = useQuery(postOptions(id))
  if (isPending) return <Skeleton />
  return <article>{data!.title}</article>
}
```

### `useQuery` vs `useSuspenseQuery`

- **`useQuery`** after a server prefetch: data is present immediately; if the prefetch is removed it falls back to fetching on the client (graceful). Handle `isPending` yourself.
- **`useSuspenseQuery`**: suspends until data is ready — pair with a `<Suspense>` boundary (and `loading.tsx`). Cleaner code, but a missing prefetch means a client-side suspense fetch. Use it with PPR/streaming when you've awaited (or streamed) the prefetch.

### Streaming prefetch (don't block the shell)

Since v5.40, **pending** queries dehydrate too (enabled by the `shouldDehydrateQuery` override above). So `void prefetchQuery(...)` without `await` lets the page shell render immediately while the query streams to the client as it resolves — ideal under PPR. Use `await` only when you need the data present in the server-rendered HTML (SEO/first paint).

You can prefetch in `layout.tsx` and parallel routes too, and use multiple `<HydrationBoundary>`s; prefetch close to where data is used to avoid server-side waterfalls.

## Invalidation after mutations

```ts
import { useQueryClient } from '@tanstack/react-query'
import { postKeys } from '@/lib/query/keys'

const queryClient = useQueryClient()
// after a successful mutation:
await queryClient.invalidateQueries({ queryKey: postKeys.lists() })
```

Key factories make this precise: invalidate `postKeys.all` to nuke everything posts-related, or `postKeys.detail(id)` for one item. For mutation + optimistic update + rollback, see `references/mutations-optimistic.md`.

## Defaults worth setting

- `staleTime`: a non-zero default (e.g. 30–60s) prevents an immediate refetch of just-hydrated server data; tune per query.
- `gcTime`: how long unused cache lingers (default 5min).
- `retry`: lower it (e.g. `1`) for mutations and user-facing reads so failures surface fast.
- Prefer `placeholderData: keepPreviousData` for paginated/filtered lists to avoid flicker between pages.
