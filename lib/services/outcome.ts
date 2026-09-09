/**
 * Shared result shape for userId-first services (no session, no revalidation).
 * Server Actions and MCP tools both consume it: actions map it onto their
 * `{ success, data, error }` result, MCP tools throw on `ok: false` so the
 * guard turns it into an `isError` result.
 */

export type Outcome<T> = { ok: true; data: T } | { ok: false; error: string }

export function ok<T>(data: T): Outcome<T> {
  return { ok: true, data }
}

export function fail(error: string): Outcome<never> {
  return { ok: false, error }
}

export interface ActionResultShape<T> {
  success: boolean
  data?: T
  error?: string
}

/** Map a service outcome onto the Server Action result shape. */
export function toActionResult<T>(outcome: Outcome<T>): ActionResultShape<T> {
  return outcome.ok ? { success: true, data: outcome.data } : { success: false, error: outcome.error }
}

/** An expected business-rule rejection (validation, ownership, state) — not a bug. */
export class OutcomeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OutcomeError'
  }
}

/** Unwrap an outcome for MCP tools: the data, or a thrown OutcomeError. */
export function unwrap<T>(outcome: Outcome<T>): T {
  if (!outcome.ok) throw new OutcomeError(outcome.error)
  return outcome.data
}
