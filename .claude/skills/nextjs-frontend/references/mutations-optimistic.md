# Mutations & Optimistic Updates

Covers: Server Actions, `useActionState`, `useOptimistic`, optimistic updates with TanStack Query (`onMutate`/rollback), and revalidation. Two paths — pick by where the data lives.

> **Which path?** If the mutated data is read via **RSC/Server Actions and revalidation**, use `useOptimistic` + Server Action (Path A). If it's read via **TanStack Query** on the client, use a `useMutation` with `onMutate` optimistic update + rollback (Path B). Don't mix optimistic mechanisms on the same data.

## Server Actions (the mutation primitive)

A Server Action is an async function marked `"use server"`, callable from client or server, that runs on the server. Always **validate input with Zod** — a Server Action is a public endpoint; never trust its args because they came through your own form.

```ts
// lib/actions/todos.ts
'use server'
import { z } from 'zod'
import { revalidateTag } from 'next/cache'
import { createTodo as dbCreateTodo } from '@/lib/data/todos'

const CreateTodo = z.object({ title: z.string().min(1).max(200) })

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

export async function createTodo(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateTodo.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors }
  }
  const todo = await dbCreateTodo(parsed.data)
  revalidateTag('todos', 'max') // Next.js 16: second arg = cacheLife profile
  return { ok: true, data: { id: todo.id } }
}
```

Return **typed result objects**, not thrown strings — the client can branch on `ok` and show field errors. (On Next.js 15, `revalidateTag('todos')` takes one argument.)

## `useActionState` (form state + pending)

`useActionState` (React 19; replaces the deprecated `useFormState`) wires a Server Action to a form and gives you the latest result plus a `pending` flag:

```tsx
'use client'
import { useActionState } from 'react'
import { createTodo } from '@/lib/actions/todos'

export function AddTodoForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, formData: FormData) =>
      createTodo({ title: formData.get('title') }),
    null,
  )
  return (
    <form action={formAction}>
      <input name="title" required />
      <button disabled={pending}>{pending ? 'Adding…' : 'Add'}</button>
      {state && !state.ok && <p role="alert">{state.error}</p>}
    </form>
  )
}
```

## Path A — `useOptimistic` for instant UI with Server Actions

`useOptimistic` shows a provisional state immediately, then React discards it once the real state (from revalidation) arrives — automatic reconciliation, no manual rollback.

```tsx
'use client'
import { useOptimistic, startTransition } from 'react'
import { createTodo } from '@/lib/actions/todos'

type Todo = { id: string; title: string; pending?: boolean }

export function TodoList({ todos }: { todos: Todo[] }) {
  const [optimisticTodos, addOptimistic] = useOptimistic(
    todos,
    (state, newTitle: string) => [
      ...state,
      { id: `temp-${Date.now()}`, title: newTitle, pending: true },
    ],
  )

  async function action(formData: FormData) {
    const title = String(formData.get('title') ?? '')
    startTransition(() => addOptimistic(title)) // optimistic insert
    await createTodo({ title })                  // server reconciles via revalidate
  }

  return (
    <>
      <form action={action}>
        <input name="title" required />
        <button>Add</button>
      </form>
      <ul>
        {optimisticTodos.map((t) => (
          <li key={t.id} style={{ opacity: t.pending ? 0.5 : 1 }}>{t.title}</li>
        ))}
      </ul>
    </>
  )
}
```

Key points: the optimistic update **must** run inside a transition (the `form action` already is one; otherwise wrap in `startTransition`). The base `todos` comes from the server; when the action's `revalidateTag` causes a re-render with fresh data, the optimistic entry is replaced automatically. On error, React drops the optimistic state and you surface the error (e.g. via `useActionState`).

## Path B — TanStack Query optimistic mutation with rollback

When the list is a `useQuery`, do the optimistic update against the cache in `onMutate`, snapshot for rollback, and reconcile in `onSettled`:

```tsx
'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { postKeys } from '@/lib/query/keys'
import { createPostApi } from '@/lib/data/posts'

type Post = { id: string; title: string }

export function useCreatePost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createPostApi,
    onMutate: async (newPost: { title: string }) => {
      await queryClient.cancelQueries({ queryKey: postKeys.lists() }) // stop in-flight refetches
      const previous = queryClient.getQueryData<Post[]>(postKeys.lists())
      queryClient.setQueryData<Post[]>(postKeys.lists(), (old = []) => [
        ...old,
        { id: `temp-${Date.now()}`, title: newPost.title },
      ])
      return { previous } // context for rollback
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(postKeys.lists(), context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: postKeys.lists() }) // reconcile with server
    },
  })
}
```

The four-callback shape is the canonical pattern: **cancel** in-flight queries so they don't overwrite the optimistic value, **snapshot** the prior cache, **apply** the optimistic change, **roll back** on error, **invalidate** on settle. Replace temp ids with the server id either by reading the mutation result in `onSuccess` or by letting the `invalidateQueries` refetch correct it.

## Revalidation cheat-sheet

| You mutated… | Revalidate with |
|--------------|-----------------|
| Data read by RSC/Server Components | `revalidateTag(tag, profile)` (16) / `revalidateTag(tag)` (15), or `revalidatePath(path)` — in the Server Action |
| Data read by TanStack Query | `queryClient.invalidateQueries({ queryKey })` — on the client |
| Both | revalidate on the server **and** invalidate the client query |

## Pitfalls

- Forgetting `startTransition` around `useOptimistic` updates → React warns and the update is dropped.
- Not `cancelQueries` in `onMutate` → a late refetch clobbers the optimistic value.
- Optimistic UI with no rollback path → a failed mutation leaves a phantom item; always snapshot + restore.
- Trusting Server Action args without Zod → treat every action like a public API endpoint.
- Doing optimistic updates in *both* `useOptimistic` and Query for the same data → double-counting; pick one owner per dataset.
