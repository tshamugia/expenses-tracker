# Rendering Strategy: SSG / SSR / ISR / Streaming / PPR

Covers: choosing a rendering strategy, Cache Components + `"use cache"` (Next.js 16 PPR), Suspense + `loading.tsx`, `generateStaticParams`, dynamic APIs, and the static-shell-plus-dynamic-hole model.

> **Version note.** PPR shipped **stable in Next.js 16** via **Cache Components** (`cacheComponents: true` + the `"use cache"` directive). The experimental `experimental.ppr` flag and `experimental_ppr` route export were **removed**. On **Next.js 15**, PPR is experimental: use `experimental: { ppr: 'incremental' }` and `export const experimental_ppr = true` per route. Everything below targets 16; the 15 differences are flagged inline.

## The four strategies, decided by the data

| Strategy | When | How (Next.js 16) |
|----------|------|------------------|
| **Static (SSG)** | Same for all users, stable between deploys | Default for routes with no dynamic APIs; wrap cacheable work in `"use cache"`. Dynamic segments need `generateStaticParams`. |
| **ISR (static + revalidate)** | Same for all users, needs periodic freshness | `"use cache"` + `cacheLife('hours')` (or a custom profile), or `revalidateTag` on demand. |
| **Dynamic (SSR)** | Per-request / personalized end to end | Reading a dynamic API (`cookies()`, `headers()`, `searchParams`, uncached `fetch`) makes the route dynamic. Stream with `loading.tsx`. |
| **PPR (shell + holes)** | Mostly static with a few dynamic regions | Cache the shell; wrap each dynamic region in `<Suspense>`. The static shell is prerendered and served instantly; holes stream in. |

### Decision walk

1. Same for everyone + stable → **SSG**.
2. Same for everyone + needs freshness → **ISR**.
3. Personalized end to end → **SSR** with streaming. (If *every* route needs a session, the static shell is generic and PPR adds little — plain streaming wins.)
4. Mostly static frame + small personalized regions → **PPR**. This is the sweet spot: product pages (static copy/images around dynamic price/stock/cart), dashboards with a static chrome around per-user widgets, account/billing landing pages.
5. Region needs client interaction or live updates → fetch on the client (TanStack Query), optionally server-prefetched.

## Cache Components & `"use cache"` (Next.js 16)

Enable it:

```ts
// next.config.ts
import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  cacheComponents: true,
}
export default nextConfig
```

With `cacheComponents`, **everything is dynamic by default** and you opt regions *into* caching with `"use cache"` — the inverse of the old "static by default" model. This makes PPR the default rendering behavior: a route's cached parts form the static shell, and uncached parts become streamed dynamic holes.

```tsx
// A cached async component → becomes part of the static shell
async function ProductDetails({ id }: { id: string }) {
  'use cache'
  const product = await getProduct(id) // cache key derived automatically
  return <ProductCard product={product} />
}
```

`"use cache"` works at three levels: a **file** (cache everything it exports), a **component/function** (cache that unit), or a route. Cache keys are generated from the closure/arguments by the compiler.

### Controlling lifetime and invalidation

```tsx
import { cacheLife, cacheTag } from 'next/cache'

async function getPosts() {
  'use cache'
  cacheLife('hours')        // built-in profile: how long this stays fresh
  cacheTag('posts')         // tag for targeted invalidation
  return db.post.findMany()
}
```

```ts
'use server'
import { revalidateTag, revalidatePath } from 'next/cache'

export async function createPost(/* ... */) {
  // ...write...
  // Next.js 16: revalidateTag requires a cacheLife profile as the 2nd arg
  revalidateTag('posts', 'max')
  // or revalidatePath('/blog')
}
```

> **Next.js 15:** use `unstable_cache`, `fetch` cache options (`{ next: { revalidate, tags } }`), and `export const revalidate = N` / `export const dynamic = 'force-static'` route exports. `revalidateTag(tag)` takes a single argument.

## Streaming with Suspense and `loading.tsx`

PPR and good SSR both rely on Suspense. Two ways to get a fallback:

**Segment-level** — `loading.tsx` wraps the whole `page.tsx` in a Suspense boundary automatically:

```tsx
// app/(app)/dashboard/loading.tsx
export default function Loading() {
  return <DashboardSkeleton /> // match final dimensions to avoid layout shift
}
```

**Region-level** — wrap just the dynamic part so the rest renders instantly:

```tsx
// app/product/[id]/page.tsx
import { Suspense } from 'react'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <main>
      <ProductDetails id={id} />            {/* "use cache" → static shell */}
      <Suspense fallback={<PriceSkeleton />}>
        <LivePrice id={id} />               {/* dynamic → streamed hole */}
      </Suspense>
      <Suspense fallback={<CartSkeleton />}>
        <CartWidget id={id} />              {/* per-user → streamed hole */}
      </Suspense>
    </main>
  )
}
```

The shell (everything outside Suspense + everything cached) prerenders and serves immediately; each `<Suspense>` boundary is a hole whose content streams in as its data resolves, in parallel.

### PPR checklist (per route)

- Every dynamic-API call (`cookies()`, `headers()`, `searchParams`, uncached `fetch`) sits **inside** a `<Suspense>` boundary — otherwise the whole route opts into dynamic and you lose the shell.
- The static shell reads **no** session/per-user state.
- Skeleton fallbacks match final content dimensions (minimize CLS).
- Cached data has correct `cacheLife`/`cacheTag` so it actually lands in the shell.
- Build output shows the partial-prerender indicator (`◐`) on the route.

## Dynamic APIs & `params`/`searchParams`

In Next.js 15+, `params` and `searchParams` are **Promises** — `await` them. Reading them (or `cookies()`/`headers()`) marks that subtree dynamic, so isolate it under Suspense if you want a static shell.

```tsx
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams
  // ...
}
```

## `generateStaticParams`

Prerender dynamic segments at build time:

```tsx
export async function generateStaticParams() {
  const posts = await getAllPosts()
  return posts.map((p) => ({ slug: p.slug }))
}
```

Combine with `"use cache"` inside the page for ISR-style freshness on the prerendered set.

## Picking SSR vs. client fetch for personalized data

- **SSR (RSC fetch):** best for first-paint-critical, SEO-relevant, read-mostly personalized data. The server fetches; no client waterfall.
- **Client fetch (TanStack Query):** best when the data is read *and mutated* on the client, needs background refetch/polling, or only appears after interaction. Prefetch it on the server and hydrate to avoid a cold client fetch — see `references/server-state-tanstack.md`.
- **PPR + Suspense:** the bridge — static shell instant, personalized regions stream as server-rendered holes.
