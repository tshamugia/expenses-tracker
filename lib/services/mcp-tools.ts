/**
 * MCP tool surface for ExtraTracker.
 * Registers every tool on an McpServer. Each handler resolves the user from
 * the verified token (ctx.http.authInfo.extra) — never from tool arguments —
 * and gates writes on the `write` scope. Handlers are thin adapters over
 * lib/services/mcp-data.ts; they hold no money math of their own.
 *
 * Coverage: full CRUD over the app's financial data — fixed bills, ledger
 * transactions, income sources (salary / extra income), goals & the emergency
 * fund, categories, debts (incl. installments and prepayment), the monthly
 * plan (generate / confirm / reopen / close) and payment cards. Account
 * settings, profile, tokens and connected apps are deliberately NOT exposed.
 */

import { z } from 'zod'
import type { McpServer, ToolCallback } from '@modelcontextprotocol/server'
import * as data from '@/lib/services/mcp-data'
import { MCP_MAX_LIST } from '@/lib/services/mcp-data'
import { OutcomeError, unwrap, type Outcome } from '@/lib/services/outcome'
import type { McpPrincipal } from '@/types/mcp-types'

export const MCP_SERVER_INFO = { name: 'extracker', version: '0.2.0' } as const

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
const UUID = z.string().uuid()
const HEX_COLOR = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a hex colour like #3b82f6')
const MONEY = z.number().positive()
const NAME = z.string().trim().min(1).max(120)
const DESCRIPTION = z.string().trim().max(500)
const CATEGORY_KIND = z.enum(['FIXED', 'VARIABLE'])
const PLAN_REF = {
  planId: UUID.optional().describe('Plan id; when omitted the plan for `month` is used'),
  month: MONTH.optional().describe('Month as YYYY-MM; default = current month (ignored when planId is given)'),
}

const toDate = (s: string | undefined): Date | undefined => (s ? new Date(s) : undefined)
/** undefined = leave unchanged, null = clear, string = set. */
const toNullableDate = (s: string | null | undefined): Date | null | undefined =>
  s === undefined ? undefined : s === null ? null : new Date(s)

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
      // Expected rejections (validation / ownership / state) are returned to the
      // client as-is; only unexpected failures are worth a stack trace.
      if (!(error instanceof OutcomeError)) console.error('MCP tool error:', error)
      return errorResult(error instanceof Error ? error.message : 'Tool failed')
    }
  }
}

/** Tools that irreversibly remove or permanently alter data (`destructiveHint`). */
export const DESTRUCTIVE_TOOLS = new Set([
  'delete_expense',
  'delete_transaction',
  'delete_category',
  'delete_payment_card',
  'archive_income_source',
  'archive_goal',
  'archive_debt',
  'apply_prepayment',
  'close_month',
])

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
        annotations: {
          readOnlyHint: config.readOnly,
          destructiveHint: DESTRUCTIVE_TOOLS.has(name),
          idempotentHint: config.readOnly,
        },
      },
      cb as unknown as ToolCallback<S>
    )
  }
  /** Shorthand for handlers that return a service Outcome. */
  const out = <T>(p: Promise<Outcome<T>>) => p.then(unwrap)

  // =========================================================================
  // Dashboard & monthly plan
  // =========================================================================
  reg(
    'get_dashboard',
    {
      title: 'Dashboard',
      description:
        'The full financial dashboard for the current month: Safe-to-Spend (month and per day), plan status, live verdict, stability stage, debts summary, emergency-fund and goal progress. Amounts are in the user\'s default currency unless stated.',
      inputSchema: z.object({}),
      readOnly: true,
    },
    async (_args, p) => data.mcpGetDashboard(p.userId)
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
    async ({ month }, p) => data.mcpGetMonthlyPlan(p.userId, month)
  )

  reg(
    'get_stability_progress',
    {
      title: 'Stability progress',
      description:
        'The stability path: current stage, debt-free and 3-month-reserve cards, net position with its 6-month trend and the verdict history of closed months.',
      inputSchema: z.object({}),
      readOnly: true,
    },
    async (_args, p) => data.mcpGetStabilityProgress(p.userId)
  )

  reg(
    'generate_monthly_plan',
    {
      title: 'Generate / refresh monthly plan',
      description:
        'Regenerate a month\'s plan from the current income forecast, bills, debts and goals (the waterfall). Overwrites a DRAFT/CONFIRMED plan; a CLOSED month is refused. Requires the write scope.',
      inputSchema: z.object({ month: MONTH.optional().describe('YYYY-MM; default = current month') }),
      readOnly: false,
    },
    async ({ month }, p) => out(data.mcpGeneratePlan(p.userId, month))
  )

  reg(
    'confirm_plan',
    {
      title: 'Confirm plan',
      description:
        'Confirm a DRAFT plan into the active plan, optionally adjusting planned amounts of individual allocations (deficit resolution). FREE / Safe-to-Spend is recomputed from the forecast. Requires the write scope.',
      inputSchema: z.object({
        ...PLAN_REF,
        adjustments: z
          .array(z.object({ allocationId: UUID, planned: z.number().min(0) }))
          .max(100)
          .optional()
          .describe('New planned amounts for allocations of this plan'),
      }),
      readOnly: false,
    },
    async ({ planId, month, adjustments }, p) =>
      out(data.mcpConfirmPlan(p.userId, { planId, month }, adjustments ?? []))
  )

  reg(
    'reopen_plan',
    {
      title: 'Reopen plan',
      description: 'Put a CONFIRMED plan back into DRAFT for editing. A CLOSED month cannot be reopened. Requires the write scope.',
      inputSchema: z.object(PLAN_REF),
      readOnly: false,
    },
    async ({ planId, month }, p) => out(data.mcpReopenPlan(p.userId, { planId, month }))
  )

  reg(
    'get_close_preview',
    {
      title: 'Month-close preview',
      description:
        'Preview closing a month without writing anything: plan vs actual per line, completion %, the honest verdict (forward/back/flat), net change and proposed conclusions (e.g. raise a category limit) for the next plan.',
      inputSchema: z.object(PLAN_REF),
      readOnly: true,
    },
    async ({ planId, month }, p) => out(data.mcpGetClosePreview(p.userId, { planId, month }))
  )

  reg(
    'close_month',
    {
      title: 'Close month',
      description:
        'Close a month: persist plan-vs-actual, the verdict and the accepted conclusions, and mark the plan CLOSED (irreversible). Pass the conclusions you accept from get_close_preview. Requires the write scope.',
      inputSchema: z.object({
        ...PLAN_REF,
        conclusions: z
          .array(
            z.object({
              type: z.literal('raise_limit'),
              categoryId: UUID,
              categoryName: z.string().optional(),
              delta: z.number(),
              note: z.string().max(500).optional(),
            })
          )
          .max(100)
          .optional()
          .describe('Accepted conclusions (subset of proposedConclusions from get_close_preview)'),
      }),
      readOnly: false,
    },
    async ({ planId, month, conclusions }, p) =>
      out(data.mcpCloseMonth(p.userId, { planId, month }, { conclusions: conclusions ?? [] }))
  )

  // =========================================================================
  // Fixed bills (Expense)
  // =========================================================================
  reg(
    'list_expenses',
    {
      title: 'List fixed bills',
      description: 'Fixed / recurring bills (subscriptions, rent, …) ordered by next due date, with paid and overdue flags.',
      inputSchema: z.object({ limit: LIMIT.describe('Max rows (1-200, default 50)') }),
      readOnly: true,
    },
    async ({ limit }, p) => data.mcpListExpenses(p.userId, { limit })
  )

  reg(
    'create_expense',
    {
      title: 'Create fixed bill',
      description: 'Create a fixed / recurring bill (Expense). Requires a token with the write scope.',
      inputSchema: z.object({
        title: NAME,
        amount: MONEY,
        currency: CURRENCY,
        category: z.string().trim().min(1).max(60).optional().describe('Category name'),
        description: DESCRIPTION.optional(),
        nextDueDate: ISO_DATE.optional().describe('Next due date (ISO-8601). Creates the first pending payment.'),
        isRecurring: z.boolean().optional(),
        recurrenceRule: z.string().max(120).optional().describe('e.g. RRULE:FREQ=MONTHLY;INTERVAL=1'),
        paymentCardId: UUID.optional().describe('Card the bill is paid with (see list_payment_cards)'),
      }),
      readOnly: false,
    },
    async (input, p) =>
      out(data.mcpCreateExpense(p.userId, { ...input, nextDueDate: toDate(input.nextDueDate) }))
  )

  reg(
    'update_expense',
    {
      title: 'Update fixed bill',
      description: 'Update a fixed bill: title, amount, currency, category, description, recurrence, next due date or card. Only the given fields change. Requires the write scope.',
      inputSchema: z.object({
        expenseId: UUID,
        title: NAME.optional(),
        amount: MONEY.optional(),
        currency: CURRENCY.optional(),
        category: z.string().trim().min(1).max(60).optional(),
        description: DESCRIPTION.optional(),
        nextDueDate: ISO_DATE.optional(),
        isRecurring: z.boolean().optional(),
        recurrenceRule: z.string().max(120).optional(),
        paymentCardId: UUID.optional(),
      }),
      readOnly: false,
    },
    async ({ expenseId, ...input }, p) =>
      out(data.mcpUpdateExpense(p.userId, expenseId, { ...input, nextDueDate: toDate(input.nextDueDate) }))
  )

  reg(
    'delete_expense',
    {
      title: 'Delete fixed bill',
      description: 'Permanently delete a fixed bill and its payment history. Ledger transactions already recorded stay. Requires the write scope.',
      inputSchema: z.object({ expenseId: UUID }),
      readOnly: false,
    },
    async ({ expenseId }, p) => out(data.mcpDeleteExpense(p.userId, expenseId))
  )

  reg(
    'mark_expense_paid',
    {
      title: 'Mark fixed bill paid',
      description:
        'Mark the next unpaid payment of a fixed bill as paid today. The payment is mirrored into the ledger and a recurring bill rolls forward to its next due date. Requires the write scope.',
      inputSchema: z.object({ expenseId: UUID }),
      readOnly: false,
    },
    async ({ expenseId }, p) => out(data.mcpMarkExpensePaid(p.userId, expenseId))
  )

  // =========================================================================
  // Ledger transactions
  // =========================================================================
  reg(
    'list_transactions',
    {
      title: 'List transactions',
      description:
        'Ledger entries (every money movement: expenses, income, debt payments, goal contributions), newest first. Filter by type, category and date range.',
      inputSchema: z.object({
        type: z.enum(['EXPENSE', 'INCOME']).optional(),
        categoryId: UUID.optional(),
        from: ISO_DATE.optional().describe('Inclusive start date (ISO-8601)'),
        to: ISO_DATE.optional().describe('Inclusive end date (ISO-8601)'),
        limit: LIMIT.describe('Max rows (1-200, default 50)'),
      }),
      readOnly: true,
    },
    async ({ type, categoryId, from, to, limit }, p) =>
      data.mcpListTransactions(p.userId, { type, categoryId, from: toDate(from), to: toDate(to), limit })
  )

  reg(
    'add_transaction',
    {
      title: 'Quick-add expense',
      description:
        'Record a variable expense in the ledger (same as the app\'s Quick Add). Give categoryId or categoryName. Returns the category\'s soft-limit status. For income use record_income. Requires the write scope.',
      inputSchema: z.object({
        amount: MONEY,
        currency: CURRENCY.optional().describe('Default GEL'),
        categoryId: UUID.optional(),
        categoryName: z.string().trim().min(1).max(60).optional(),
        description: DESCRIPTION.optional(),
        date: ISO_DATE.optional().describe('Default: now'),
      }),
      readOnly: false,
    },
    async (input, p) => out(data.mcpAddTransaction(p.userId, { ...input, date: toDate(input.date) }))
  )

  reg(
    'update_transaction',
    {
      title: 'Update transaction',
      description:
        'Edit a ledger entry: amount, currency, date, category (by id or name; null clears it) or description (null clears it). Only the given fields change. Requires the write scope.',
      inputSchema: z.object({
        transactionId: UUID,
        amount: MONEY.optional(),
        currency: CURRENCY.optional(),
        date: ISO_DATE.optional(),
        categoryId: UUID.nullable().optional(),
        categoryName: z.string().trim().min(1).max(60).optional(),
        description: DESCRIPTION.nullable().optional(),
      }),
      readOnly: false,
    },
    async ({ transactionId, ...input }, p) =>
      out(data.mcpUpdateTransaction(p.userId, transactionId, { ...input, date: toDate(input.date) }))
  )

  reg(
    'delete_transaction',
    {
      title: 'Delete transaction',
      description: 'Permanently delete a ledger entry. Requires the write scope.',
      inputSchema: z.object({ transactionId: UUID }),
      readOnly: false,
    },
    async ({ transactionId }, p) => out(data.mcpDeleteTransaction(p.userId, transactionId))
  )

  // =========================================================================
  // Income: salary (STABLE) & extra income (VARIABLE)
  // =========================================================================
  reg(
    'list_income_sources',
    {
      title: 'List income sources',
      description:
        'Income sources (STABLE = salary with expected amount/day, VARIABLE = projects / extra income), this month\'s income entries and total, and the conservative next-month forecast.',
      inputSchema: z.object({}),
      readOnly: true,
    },
    async (_args, p) => data.mcpListIncomeSources(p.userId)
  )

  reg(
    'create_income_source',
    {
      title: 'Add income source',
      description:
        'Add a salary (type STABLE: expectedAmount required, expectedDay = pay day; it is credited to the ledger automatically each month) or an extra-income source (type VARIABLE: freelance, projects; record its facts with record_income). Requires the write scope.',
      inputSchema: z.object({
        name: NAME,
        type: z.enum(['STABLE', 'VARIABLE']),
        expectedAmount: MONEY.optional().describe('Required for STABLE'),
        currency: CURRENCY.optional().describe('Default GEL'),
        expectedDay: z.number().int().min(1).max(31).optional().describe('Day of month the salary arrives'),
      }),
      readOnly: false,
    },
    async (input, p) => out(data.mcpCreateIncomeSource(p.userId, input))
  )

  reg(
    'update_income_source',
    {
      title: 'Update income source',
      description: 'Update an income source: name, type, expected amount (null clears), currency, expected day (null clears) or active flag. Requires the write scope.',
      inputSchema: z.object({
        sourceId: UUID,
        name: NAME.optional(),
        type: z.enum(['STABLE', 'VARIABLE']).optional(),
        expectedAmount: MONEY.nullable().optional(),
        currency: CURRENCY.optional(),
        expectedDay: z.number().int().min(1).max(31).nullable().optional(),
        isActive: z.boolean().optional(),
      }),
      readOnly: false,
    },
    async ({ sourceId, ...input }, p) => out(data.mcpUpdateIncomeSource(p.userId, sourceId, input))
  )

  reg(
    'archive_income_source',
    {
      title: 'Archive income source',
      description: 'Deactivate an income source (soft delete — its ledger history stays; it leaves the forecast). Requires the write scope.',
      inputSchema: z.object({ sourceId: UUID }),
      readOnly: false,
    },
    async ({ sourceId }, p) => out(data.mcpArchiveIncomeSource(p.userId, sourceId))
  )

  reg(
    'record_income',
    {
      title: 'Record income',
      description:
        'Record received income in the ledger: extra income for a VARIABLE source (by id or name) or a one-off with no source. STABLE salary is accrued automatically and is refused here. Returns the month\'s income total. Requires the write scope.',
      inputSchema: z.object({
        amount: MONEY,
        currency: CURRENCY.optional().describe('Default GEL'),
        incomeSourceId: UUID.optional(),
        incomeSourceName: z.string().trim().min(1).max(120).optional(),
        description: DESCRIPTION.optional(),
        date: ISO_DATE.optional().describe('Default: now'),
      }),
      readOnly: false,
    },
    async (input, p) => out(data.mcpRecordIncome(p.userId, { ...input, date: toDate(input.date) }))
  )

  // =========================================================================
  // Goals & emergency fund
  // =========================================================================
  reg(
    'list_goals',
    {
      title: 'List goals',
      description: 'Savings goals including the emergency fund (reserve first): target, saved amount, progress, projected date and on-track status.',
      inputSchema: z.object({}),
      readOnly: true,
    },
    async (_args, p) => data.mcpListGoals(p.userId)
  )

  reg(
    'get_goal',
    {
      title: 'Goal detail',
      description: 'One goal with its full contribution / withdrawal history and progress.',
      inputSchema: z.object({ goalId: UUID }),
      readOnly: true,
    },
    async ({ goalId }, p) => out(data.mcpGetGoal(p.userId, goalId))
  )

  reg(
    'create_goal',
    {
      title: 'Create goal',
      description:
        'Create a savings goal. Give a targetDate (the required monthly contribution is derived) and/or a monthlyContribution. New goals start as PROPOSED (wishlist) and enter the plan only after approve_goal. Requires the write scope.',
      inputSchema: z.object({
        name: NAME,
        targetAmount: MONEY,
        currency: CURRENCY.optional().describe('Default GEL'),
        targetDate: ISO_DATE.optional(),
        monthlyContribution: MONEY.optional(),
      }),
      readOnly: false,
    },
    async (input, p) =>
      out(data.mcpCreateGoal(p.userId, { ...input, targetDate: toDate(input.targetDate) ?? null }))
  )

  reg(
    'approve_goal',
    {
      title: 'Approve goal',
      description: 'Promote a PROPOSED goal to ACTIVE so it enters the monthly plan and lowers Safe-to-Spend. Requires the write scope.',
      inputSchema: z.object({ goalId: UUID }),
      readOnly: false,
    },
    async ({ goalId }, p) => out(data.mcpApproveGoal(p.userId, goalId))
  )

  reg(
    'update_goal',
    {
      title: 'Update goal',
      description: 'Update a goal\'s name, target amount, target date (null clears) or monthly contribution (null clears). The emergency fund is managed automatically and cannot be edited. Requires the write scope.',
      inputSchema: z.object({
        goalId: UUID,
        name: NAME.optional(),
        targetAmount: MONEY.optional(),
        targetDate: ISO_DATE.nullable().optional(),
        monthlyContribution: MONEY.nullable().optional(),
      }),
      readOnly: false,
    },
    async ({ goalId, ...input }, p) =>
      out(data.mcpUpdateGoal(p.userId, goalId, { ...input, targetDate: toNullableDate(input.targetDate) }))
  )

  reg(
    'archive_goal',
    {
      title: 'Archive goal',
      description: 'Archive a goal (soft delete — contribution history stays). The emergency fund cannot be archived. Requires the write scope.',
      inputSchema: z.object({ goalId: UUID }),
      readOnly: false,
    },
    async ({ goalId }, p) => out(data.mcpArchiveGoal(p.userId, goalId))
  )

  reg(
    'reorder_goals',
    {
      title: 'Reorder goals',
      description: 'Set the priority order of active goals (first = highest after the emergency fund, which always stays #1). Unknown or proposed ids are ignored. Requires the write scope.',
      inputSchema: z.object({ orderedGoalIds: z.array(UUID).min(1).max(100) }),
      readOnly: false,
    },
    async ({ orderedGoalIds }, p) => out(data.mcpReorderGoals(p.userId, orderedGoalIds))
  )

  reg(
    'contribute_to_goal',
    {
      title: 'Contribute to goal',
      description: 'Put money into a goal or the emergency fund (mirrored into the ledger as an expense). Reaching the target marks the goal ACHIEVED. Requires the write scope.',
      inputSchema: z.object({ goalId: UUID, amount: MONEY, date: ISO_DATE.optional() }),
      readOnly: false,
    },
    async ({ goalId, amount, date }, p) =>
      out(data.mcpContributeToGoal(p.userId, goalId, { amount, date: toDate(date) }))
  )

  reg(
    'withdraw_from_goal',
    {
      title: 'Withdraw from goal',
      description: 'Take money out of a goal or the emergency fund (mirrored into the ledger as income). A reason is required; cannot exceed the saved amount. Requires the write scope.',
      inputSchema: z.object({
        goalId: UUID,
        amount: MONEY,
        reason: z.string().trim().min(1).max(500),
        date: ISO_DATE.optional(),
      }),
      readOnly: false,
    },
    async ({ goalId, amount, reason, date }, p) =>
      out(data.mcpWithdrawFromGoal(p.userId, goalId, { amount, reason, date: toDate(date) }))
  )

  reg(
    'advance_reserve_stage',
    {
      title: 'Advance emergency fund stage',
      description: 'Move the emergency fund from the 1-month stage to the 3-month stage (target = 3× mandatory monthly expenses). Requires the write scope.',
      inputSchema: z.object({ goalId: UUID.describe('The emergency fund goal id (isEmergencyFund = true)') }),
      readOnly: false,
    },
    async ({ goalId }, p) => out(data.mcpAdvanceReserveStage(p.userId, goalId))
  )

  // =========================================================================
  // Categories
  // =========================================================================
  reg(
    'list_categories',
    {
      title: 'List categories',
      description: 'The user\'s expense categories with kind (FIXED/VARIABLE) and optional monthly soft limit. Use the id or name with add_transaction.',
      inputSchema: z.object({}),
      readOnly: true,
    },
    async (_args, p) => data.mcpListCategories(p.userId)
  )

  reg(
    'create_category',
    {
      title: 'Create category',
      description:
        'Create an expense category. kind FIXED = mandatory line in the plan, VARIABLE (default) = variable target; monthlyLimit = soft limit that triggers 80%/100% warnings. Names are unique per user. Requires the write scope.',
      inputSchema: z.object({
        name: z.string().trim().min(1).max(50),
        color: HEX_COLOR.optional(),
        kind: CATEGORY_KIND.optional(),
        monthlyLimit: MONEY.optional(),
      }),
      readOnly: false,
    },
    async (input, p) => out(data.mcpCreateCategory(p.userId, input))
  )

  reg(
    'update_category',
    {
      title: 'Update category',
      description: 'Rename a category or change its colour, kind or monthly limit (null clears the limit). Requires the write scope.',
      inputSchema: z.object({
        categoryId: UUID,
        name: z.string().trim().min(1).max(50).optional(),
        color: HEX_COLOR.optional(),
        kind: CATEGORY_KIND.optional(),
        monthlyLimit: MONEY.nullable().optional(),
      }),
      readOnly: false,
    },
    async ({ categoryId, ...input }, p) => out(data.mcpUpdateCategory(p.userId, categoryId, input))
  )

  reg(
    'delete_category',
    {
      title: 'Delete category',
      description: 'Permanently delete a category. Refused while fixed bills still use it; ledger entries keep their history without a category. Requires the write scope.',
      inputSchema: z.object({ categoryId: UUID }),
      readOnly: false,
    },
    async ({ categoryId }, p) => out(data.mcpDeleteCategory(p.userId, categoryId))
  )

  // =========================================================================
  // Debts
  // =========================================================================
  reg(
    'list_debts',
    {
      title: 'List debts',
      description:
        'Active debts with amortization progress (paid/remaining principal and interest, next installment, end date), totals in the default currency and the avalanche/snowball suggestion for extra payments.',
      inputSchema: z.object({}),
      readOnly: true,
    },
    async (_args, p) => data.mcpListDebts(p.userId)
  )

  reg(
    'get_debt',
    {
      title: 'Debt detail',
      description: 'One debt with its full amortization schedule (each installment: id, seq, due date, payment, interest/principal split, paid flag), progress and the next unpaid seq.',
      inputSchema: z.object({ debtId: UUID }),
      readOnly: true,
    },
    async ({ debtId }, p) => out(data.mcpGetDebt(p.userId, debtId))
  )

  reg(
    'create_debt',
    {
      title: 'Create debt',
      description:
        'Add a loan / debt and generate its annuity schedule. Give exactly one of termMonths or monthlyPayment (the other is derived). Requires the write scope.',
      inputSchema: z.object({
        name: NAME,
        principal: MONEY,
        annualRatePct: z.number().min(0).max(1000).describe('Annual interest rate in percent, e.g. 18.5'),
        currency: CURRENCY.optional().describe('Default GEL'),
        firstPaymentDate: ISO_DATE,
        termMonths: z.number().int().min(1).max(1200).optional(),
        monthlyPayment: MONEY.optional(),
      }),
      readOnly: false,
    },
    async (input, p) =>
      out(data.mcpCreateDebt(p.userId, { ...input, firstPaymentDate: new Date(input.firstPaymentDate) }))
  )

  reg(
    'update_debt',
    {
      title: 'Update debt',
      description: 'Rename a debt and/or move its first payment date (unpaid installments are reflowed; paid history is untouched). Requires the write scope.',
      inputSchema: z.object({
        debtId: UUID,
        name: NAME.optional(),
        firstPaymentDate: ISO_DATE.optional(),
      }),
      readOnly: false,
    },
    async ({ debtId, ...input }, p) =>
      out(data.mcpUpdateDebt(p.userId, debtId, { ...input, firstPaymentDate: toDate(input.firstPaymentDate) }))
  )

  reg(
    'archive_debt',
    {
      title: 'Archive debt',
      description: 'Archive a debt (soft delete — ledger history stays; it leaves the plan). Requires the write scope.',
      inputSchema: z.object({ debtId: UUID }),
      readOnly: false,
    },
    async ({ debtId }, p) => out(data.mcpArchiveDebt(p.userId, debtId))
  )

  reg(
    'record_debt_payment',
    {
      title: 'Record debt installment',
      description:
        'Mark an installment paid (mirrored into the ledger as an expense). Give scheduleItemId (from get_debt) or just debtId to pay the next unpaid installment. Paying the last one marks the debt PAID_OFF. Requires the write scope.',
      inputSchema: z.object({
        debtId: UUID.optional(),
        scheduleItemId: UUID.optional(),
        amount: MONEY.optional().describe('Actual amount paid; default = the scheduled payment'),
        paidAt: ISO_DATE.optional().describe('Default: now'),
      }),
      readOnly: false,
    },
    async (input, p) => out(data.mcpRecordDebtPayment(p.userId, { ...input, paidAt: toDate(input.paidAt) }))
  )

  reg(
    'simulate_prepayment',
    {
      title: 'Simulate prepayment',
      description:
        'What-if (nothing is changed): how many months earlier the debt ends and how much interest is saved with an extra monthly amount or a one-off lump sum.',
      inputSchema: z.object({
        debtId: UUID,
        type: z.enum(['extra_monthly', 'lump_sum']),
        amount: MONEY,
      }),
      readOnly: true,
    },
    async ({ debtId, type, amount }, p) => out(data.mcpSimulatePrepayment(p.userId, debtId, { type, amount }))
  )

  reg(
    'apply_prepayment',
    {
      title: 'Apply prepayment',
      description:
        'Apply a prepayment: regenerate the unpaid schedule tail (extra_monthly raises the installment; lump_sum also books an expense in the ledger). Paid history is untouched. Requires the write scope.',
      inputSchema: z.object({
        debtId: UUID,
        type: z.enum(['extra_monthly', 'lump_sum']),
        amount: MONEY,
      }),
      readOnly: false,
    },
    async ({ debtId, type, amount }, p) => out(data.mcpApplyPrepayment(p.userId, debtId, { type, amount }))
  )

  // =========================================================================
  // Payment cards
  // =========================================================================
  reg(
    'list_payment_cards',
    {
      title: 'List payment cards',
      description: 'The user\'s saved payment cards (brand, last four digits, expiry, nickname) and how many fixed bills each one pays.',
      inputSchema: z.object({}),
      readOnly: true,
    },
    async (_args, p) => data.mcpListPaymentCards(p.userId)
  )

  reg(
    'create_payment_card',
    {
      title: 'Add payment card',
      description:
        'Save a payment card. The number is only validated (Luhn, brand) and its last four digits stored — never the full number. Requires the write scope.',
      inputSchema: z.object({
        cardholderName: z.string().trim().min(2).max(50),
        cardNumber: z.string().regex(/^[\d\s-]{12,23}$/, 'Expected a card number'),
        expiryMonth: z.number().int().min(1).max(12),
        expiryYear: z.number().int().min(2000).max(2100),
        nickname: z.string().trim().max(50).optional(),
        color: HEX_COLOR.optional(),
      }),
      readOnly: false,
    },
    async (input, p) => out(data.mcpCreatePaymentCard(p.userId, input))
  )

  reg(
    'update_payment_card',
    {
      title: 'Update payment card',
      description: 'Update a card\'s cardholder name, expiry, nickname or colour. Requires the write scope.',
      inputSchema: z.object({
        cardId: UUID,
        cardholderName: z.string().trim().min(2).max(50).optional(),
        expiryMonth: z.number().int().min(1).max(12).optional(),
        expiryYear: z.number().int().min(2000).max(2100).optional(),
        nickname: z.string().trim().max(50).optional(),
        color: HEX_COLOR.optional(),
      }),
      readOnly: false,
    },
    async ({ cardId, ...input }, p) => out(data.mcpUpdatePaymentCard(p.userId, cardId, input))
  )

  reg(
    'delete_payment_card',
    {
      title: 'Delete payment card',
      description: 'Permanently delete a card. Fixed bills linked to it are kept and unlinked. Requires the write scope.',
      inputSchema: z.object({ cardId: UUID }),
      readOnly: false,
    },
    async ({ cardId }, p) => out(data.mcpDeletePaymentCard(p.userId, cardId))
  )
}
