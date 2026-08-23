# Client State with Zustand + App Router

Covers: when Zustand is the right tool, the per-request store pattern for the App Router (no module-level singletons), slices, selectors, and persistence.

> Zustand is for **global client UI state** that many components share and that isn't owned by the backend or the URL: theme, sidebar open/closed, command palette, a multi-step wizard's in-progress values, a cart's UI state, feature-flag toggles. It is **not** for server data (use TanStack Query / RSC), and not for state one component owns (use `useState`), and not for shareable/bookmarkable state (use the URL).

## When NOT to use Zustand

- **Server data** (DB rows, fetched lists/entities) → TanStack Query or an RSC fetch. Putting server data in Zustand means you reimplement caching, dedup, and invalidation badly, and you lose SSR.
- **Bookmarkable / shareable state** (filters, active tab, page number, search) → URL search params. Survives refresh and is linkable.
- **One component's ephemeral state** (input value, a local dropdown's open flag) → `useState`.

If none of those fit and several distant components need to read/write the same client-only value, Zustand is a good, tiny choice.

## The App Router trap: never a module-level store

The classic Zustand quickstart creates the store at module scope:

```ts
// ❌ DON'T do this in an SSR/App Router app
export const useStore = create<State>()((set) => ({ /* ... */ }))
```

On the server this store is a **singleton shared across all requests** — one user's state can bleed into another's, and initial state can't be request-specific. The fix is to create the store **per request** and provide it via React Context.

## Per-request store pattern

**1. A store *creator* (not a store):**

```ts
// lib/stores/counter-store.ts
import { createStore } from 'zustand/vanilla'

export type CounterState = { count: number }
export type CounterActions = {
  increment: () => void
  decrement: () => void
  reset: () => void
}
export type CounterStore = CounterState & CounterActions

export const defaultInitState: CounterState = { count: 0 }

export const createCounterStore = (initState: CounterState = defaultInitState) =>
  createStore<CounterStore>()((set) => ({
    ...initState,
    increment: () => set((s) => ({ count: s.count + 1 })),
    decrement: () => set((s) => ({ count: s.count - 1 })),
    reset: () => set(defaultInitState),
  }))
```

**2. A Context provider (Client Component) that instantiates once per mount via a ref:**

```tsx
// lib/stores/counter-store-provider.tsx
'use client'
import { createContext, useContext, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  createCounterStore,
  type CounterStore,
  type CounterState,
} from './counter-store'

type CounterStoreApi = ReturnType<typeof createCounterStore>
const CounterStoreContext = createContext<CounterStoreApi | undefined>(undefined)

export function CounterStoreProvider({
  children,
  initialState,
}: {
  children: ReactNode
  initialState?: CounterState
}) {
  const storeRef = useRef<CounterStoreApi | null>(null)
  if (storeRef.current === null) {
    storeRef.current = createCounterStore(initialState)
  }
  return (
    <CounterStoreContext.Provider value={storeRef.current}>
      {children}
    </CounterStoreContext.Provider>
  )
}

export function useCounterStore<T>(selector: (store: CounterStore) => T): T {
  const ctx = useContext(CounterStoreContext)
  if (!ctx) throw new Error('useCounterStore must be used within CounterStoreProvider')
  return useStore(ctx, selector)
}
```

**3. Mount the provider** at the scope that needs it (root `providers.tsx` for app-wide state, or a subtree for narrower state). You can seed `initialState` from a Server Component, which is how you hydrate client state from server data without a singleton.

**4. Read with a selector** so components only re-render on the slice they use:

```tsx
'use client'
import { useCounterStore } from '@/lib/stores/counter-store-provider'

export function Counter() {
  const count = useCounterStore((s) => s.count)
  const increment = useCounterStore((s) => s.increment)
  return <button onClick={increment}>Count: {count}</button>
}
```

## Selectors and re-render control

- Always select the **minimal** slice (`(s) => s.count`), not the whole store, or every state change re-renders the component.
- For multiple values, either take multiple selectors, or use `useShallow` to compare object/array results shallowly:

```tsx
import { useShallow } from 'zustand/react/shallow'
const { count, increment } = useCounterStore(
  useShallow((s) => ({ count: s.count, increment: s.increment })),
)
```

## Slices (composing a larger store)

Split a big store into typed slices and combine in the creator:

```ts
import { type StateCreator } from 'zustand'

type ThemeSlice = { theme: 'light' | 'dark'; toggleTheme: () => void }
const createThemeSlice: StateCreator<ThemeSlice & SidebarSlice, [], [], ThemeSlice> =
  (set) => ({
    theme: 'light',
    toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
  })
// ...combine createThemeSlice + createSidebarSlice inside one createStore<...>()(...)
```

## Persistence

Use the `persist` middleware for state that should survive reload (theme, dismissed banners). Guard hydration mismatches: persisted client state isn't available during SSR, so render a stable default on the server and reconcile after mount (e.g. gate on a `hasHydrated` flag from `persist`'s `onRehydrateStorage`, or render the persisted UI only after mount).

```ts
import { persist, createJSONStorage } from 'zustand/middleware'
// wrap the creator: persist((set) => ({...}), { name: 'ui', storage: createJSONStorage(() => localStorage) })
```

> In a Claude.ai **artifact**, `localStorage`/`sessionStorage` are unavailable — keep Zustand state in memory only there. This restriction does not apply to a real Next.js app the user runs themselves.
