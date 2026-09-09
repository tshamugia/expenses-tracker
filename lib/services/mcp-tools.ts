/**
 * MCP tool surface for ExtraTracker.
 * Registers every tool on an McpServer. Each handler resolves the user from
 * the verified token (ctx.http.authInfo.extra) — never from tool arguments —
 * and gates writes on the `write` scope. Handlers are thin adapters over
 * lib/services/mcp-data.ts; they hold no money math of their own.
 */

import { z } from 'zod'
import type { McpServer, ToolCallback } from '@modelcontextprotocol/server'
import {
  mcpAddTransaction,
  mcpCreateExpense,
  mcpGetDashboard,
  mcpGetMonthlyPlan,
  mcpListCategories,
  mcpListDebts,
  mcpListExpenses,
  mcpListGoals,
  mcpListTransactions,
  MCP_MAX_LIST,
} from '@/lib/services/mcp-data'
import type { McpPrincipal } from '@/types/mcp-types'

export const MCP_SERVER_INFO = { name: 'extracker', version: '0.1.0' } as const

export type ToolResult = {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

/** Minimal context shape the tools need — keeps handlers unit-testable without the SDK. */
export type ToolContext = { http?: { authInfo?: { extra?: Record<string, unknown> } } }

const CURRENCY = z.enum(['GEL', 'USD', 'EUR'])
const MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM')
const LIMIT = z.number().int().min(1).max(MCP_MAX_LIST).optional()
const ISO_DATE = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Expected an ISO-8601 date')

export function principalFromContext(ctx: ToolContext): McpPrincipal | null {
  const extra = ctx.http?.authInfo?.extra
  if (!extra) return null
  const { userId, scopes, tokenId } = extra as Partial<McpPrincipal>
  if (typeof userId !== 'string' || !userId || !Array.isArray(scopes) || typeof tokenId !== 'string') {
    return null
  }
  return { userId, scopes, tokenId }
}

export function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] }
}

export function errorResult(message: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

type Handler<Args> = (args: Args, principal: McpPrincipal) => Promise<unknown>

/**
 * Wrap a handler with: principal resolution, optional write-scope gate and
 * error → isError conversion (so a thrown error never becomes a protocol error).
 */
export function guard<Args>(
  handler: Handler<Args>,
  opts: { write?: boolean } = {}
): (args: Args, ctx: ToolContext) => Promise<ToolResult> {
  return async (args, ctx) => {
    const principal = principalFromContext(ctx)
    if (!principal) return errorResult('Unauthorized: no valid access token')
    if (opts.write && !principal.scopes.includes('write')) {
      return errorResult('Forbidden: this token lacks the "write" scope')
    }
    try {
      return jsonResult(await handler(args, principal))
    } catch (error) {
      console.error('MCP tool error:', error)
      return errorResult(error instanceof Error ? error.message : 'Tool failed')
    }
  }
}

/** Register all ExtraTracker tools on the given server. */
export function registerExtrackerTools(server: McpServer): void {
  /**
   * Register one tool: zod input schema + guarded handler. The cast is safe —
   * for zod v4 objects `z.infer<S>` equals the SDK's `InferOutput<S>`, and the
   * guarded callback only reads `ctx.http.authInfo`.
   */
  const reg = <S extends z.ZodObject<z.ZodRawShape>>(
    name: string,
    config: { title: string; description: string; inputSchema: S; readOnly: boolean },
    handler: Handler<z.infer<S>>
  ) => {
    const cb = guard(handler, { write: !config.readOnly })
    server.registerTool(
      name,
      {
        title: config.title,
        description: config.description,
        inputSchema: config.inputSchema,
        annotations: { readOnlyHint: config.readOnly, destructiveHint: false },
      },
      cb as unknown as ToolCallback<S>
    )
  }

  // ---- reads -------------------------------------------------------------
  reg(
    'get_dashboard',
    {
      title: 'Dashboard',
      description:
        'The full financial dashboard for the current month: Safe-to-Spend (month and per day), plan status, live verdict, stability stage, debts summary, emergency-fund and goal progress. Amounts are in the user\'s default currency unless stated.',
      inputSchema: z.object({}),
      readOnly: true,
    },
    async (_args, p) => mcpGetDashboard(p.userId)
  )

  reg(
    'get_monthly_plan',
    {
      title: 'Monthly plan',
      description:
        'The monthly plan (allocation waterfall: fixed bills, debts, reserve, goals, variable targets, free money) with live actuals for a month. Defaults to the current month. Returns plan: null when no plan exists for that month.',
      inputSchema: z.object({ month: MONTH.optional().describe('Month as YYYY-MM; default = current month') }),
      readOnly: true,
    },
    async ({ month }, p) => mcpGetMonthlyPlan(p.userId, month)
  )

  reg(
    'list_expenses',
    {
      title: 'List fixed bills',
      description: 'Fixed / recurring bills (subscriptions, rent, …) ordered by next due date, with paid and overdue flags.',
      inputSchema: z.object({ limit: LIMIT.describe('Max rows (1-200, default 50)') }),
      readOnly: true,
    },
    async ({ limit }, p) => mcpListExpenses(p.userId, { limit })
  )

  reg(
    'list_transactions',
    {
      title: 'List transactions',
      description:
        'Ledger entries (every money movement: expenses, income, debt payments, goal contributions), newest first. Filter by type, category and date range.',
      inputSchema: z.object({
        type: z.enum(['EXPENSE', 'INCOME']).optional(),
        categoryId: z.string().uuid().optional(),
        from: ISO_DATE.optional().describe('Inclusive start date (ISO-8601)'),
        to: ISO_DATE.optional().describe('Inclusive end date (ISO-8601)'),
        limit: LIMIT.describe('Max rows (1-200, default 50)'),
      }),
      readOnly: true,
    },
    async ({ type, categoryId, from, to, limit }, p) =>
      mcpListTransactions(p.userId, {
        type,
        categoryId,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        limit,
      })
  )

  reg(
    'list_categories',
    {
      title: 'List categories',
      description: 'The user\'s expense categories with kind (FIXED/VARIABLE) and optional monthly soft limit. Use the id or name with add_transaction.',
      inputSchema: z.object({}),
      readOnly: true,
    },
    async (_args, p) => mcpListCategories(p.userId)
  )

  reg(
    'list_debts',
    {
      title: 'List debts',
      description:
        'Active debts with amortization progress (paid/remaining principal and interest, next installment, end date), totals in the default currency and the avalanche/snowball suggestion for extra payments.',
      inputSchema: z.object({}),
      readOnly: true,
    },
    async (_args, p) => mcpListDebts(p.userId)
  )

  reg(
    'list_goals',
    {
      title: 'List goals',
      description: 'Savings goals including the emergency fund (reserve first): target, saved amount, progress, projected date and on-track status.',
      inputSchema: z.object({}),
      readOnly: true,
    },
    async (_args, p) => mcpListGoals(p.userId)
  )

  // ---- writes (require the `write` scope) --------------------------------
  reg(
    'create_expense',
    {
      title: 'Create fixed bill',
      description: 'Create a fixed / recurring bill (Expense). Requires a token with the write scope.',
      inputSchema: z.object({
        title: z.string().trim().min(1).max(120),
        amount: z.number().positive(),
        currency: CURRENCY,
        category: z.string().trim().min(1).max(60).optional(),
        description: z.string().trim().max(500).optional(),
        nextDueDate: ISO_DATE.optional().describe('Next due date (ISO-8601). Creates the first pending payment.'),
        isRecurring: z.boolean().optional(),
        recurrenceRule: z.string().max(120).optional().describe('e.g. RRULE:FREQ=MONTHLY;INTERVAL=1'),
      }),
      readOnly: false,
    },
    async (input, p) => {
      const r = await mcpCreateExpense(p.userId, {
        ...input,
        nextDueDate: input.nextDueDate ? new Date(input.nextDueDate) : undefined,
      })
      if (!r.ok) throw new Error(r.error)
      return r.data
    }
  )

  reg(
    'add_transaction',
    {
      title: 'Quick-add expense',
      description:
        'Record a variable expense in the ledger (same as the app\'s Quick Add). Give categoryId or categoryName. Returns the category\'s soft-limit status. Requires the write scope.',
      inputSchema: z.object({
        amount: z.number().positive(),
        currency: CURRENCY.optional().describe('Default GEL'),
        categoryId: z.string().uuid().optional(),
        categoryName: z.string().trim().min(1).max(60).optional(),
        description: z.string().trim().max(500).optional(),
        date: ISO_DATE.optional().describe('Default: now'),
      }),
      readOnly: false,
    },
    async (input, p) => {
      const r = await mcpAddTransaction(p.userId, {
        ...input,
        date: input.date ? new Date(input.date) : undefined,
      })
      if (!r.ok) throw new Error(r.error)
      return r.data
    }
  )
}
