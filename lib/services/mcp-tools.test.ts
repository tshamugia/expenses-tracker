import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/server'

const mockData = vi.hoisted(() => {
  const names = [
    'mcpGetDashboard',
    'mcpGetMonthlyPlan',
    'mcpGetStabilityProgress',
    'mcpGeneratePlan',
    'mcpConfirmPlan',
    'mcpReopenPlan',
    'mcpGetClosePreview',
    'mcpCloseMonth',
    'mcpListExpenses',
    'mcpCreateExpense',
    'mcpUpdateExpense',
    'mcpDeleteExpense',
    'mcpMarkExpensePaid',
    'mcpListTransactions',
    'mcpAddTransaction',
    'mcpUpdateTransaction',
    'mcpDeleteTransaction',
    'mcpListIncomeSources',
    'mcpCreateIncomeSource',
    'mcpUpdateIncomeSource',
    'mcpArchiveIncomeSource',
    'mcpRecordIncome',
    'mcpListGoals',
    'mcpGetGoal',
    'mcpCreateGoal',
    'mcpApproveGoal',
    'mcpUpdateGoal',
    'mcpArchiveGoal',
    'mcpReorderGoals',
    'mcpContributeToGoal',
    'mcpWithdrawFromGoal',
    'mcpAdvanceReserveStage',
    'mcpListCategories',
    'mcpCreateCategory',
    'mcpUpdateCategory',
    'mcpDeleteCategory',
    'mcpListDebts',
    'mcpGetDebt',
    'mcpCreateDebt',
    'mcpUpdateDebt',
    'mcpArchiveDebt',
    'mcpRecordDebtPayment',
    'mcpSimulatePrepayment',
    'mcpApplyPrepayment',
    'mcpListPaymentCards',
    'mcpCreatePaymentCard',
    'mcpUpdatePaymentCard',
    'mcpDeletePaymentCard',
  ] as const
  const mocks = Object.fromEntries(names.map((n) => [n, vi.fn()])) as Record<(typeof names)[number], ReturnType<typeof vi.fn>>
  return { ...mocks, MCP_MAX_LIST: 200 }
})

vi.mock('@/lib/services/mcp-data', () => mockData)

import {
  DESTRUCTIVE_TOOLS,
  errorResult,
  guard,
  jsonResult,
  principalFromContext,
  registerExtrackerTools,
  type ToolContext,
  type ToolResult,
} from './mcp-tools'

type Registered = {
  config: {
    title?: string
    description?: string
    inputSchema?: { safeParse: (v: unknown) => { success: boolean } }
    annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean }
  }
  cb: (args: unknown, ctx: ToolContext) => Promise<ToolResult>
}

function captureTools(): Map<string, Registered> {
  const tools = new Map<string, Registered>()
  const fake = {
    registerTool: (name: string, config: Registered['config'], cb: Registered['cb']) => {
      tools.set(name, { config, cb })
      return {}
    },
  }
  registerExtrackerTools(fake as unknown as McpServer)
  return tools
}

const READ_CTX: ToolContext = { http: { authInfo: { extra: { userId: 'user-a', scopes: ['read'], tokenId: 't1' } } } }
const WRITE_CTX: ToolContext = { http: { authInfo: { extra: { userId: 'user-a', scopes: ['read', 'write'], tokenId: 't1' } } } }
const ANON_CTX: ToolContext = {}

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

const parse = (r: ToolResult) => JSON.parse(r.content[0].text)

/** The documented tool surface, grouped as in docs/mcp-server.md §3. */
const READ_TOOLS = [
  'get_dashboard',
  'get_monthly_plan',
  'get_stability_progress',
  'get_close_preview',
  'list_expenses',
  'list_transactions',
  'list_income_sources',
  'list_goals',
  'get_goal',
  'list_categories',
  'list_debts',
  'get_debt',
  'simulate_prepayment',
  'list_payment_cards',
]
const WRITE_TOOLS = [
  'generate_monthly_plan',
  'confirm_plan',
  'reopen_plan',
  'close_month',
  'create_expense',
  'update_expense',
  'delete_expense',
  'mark_expense_paid',
  'add_transaction',
  'update_transaction',
  'delete_transaction',
  'create_income_source',
  'update_income_source',
  'archive_income_source',
  'record_income',
  'create_goal',
  'approve_goal',
  'update_goal',
  'archive_goal',
  'reorder_goals',
  'contribute_to_goal',
  'withdraw_from_goal',
  'advance_reserve_stage',
  'create_category',
  'update_category',
  'delete_category',
  'create_debt',
  'update_debt',
  'archive_debt',
  'record_debt_payment',
  'apply_prepayment',
  'create_payment_card',
  'update_payment_card',
  'delete_payment_card',
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('principalFromContext', () => {
  it('returns the principal only when the token extra is well-formed', () => {
    expect(principalFromContext(READ_CTX)).toEqual({ userId: 'user-a', scopes: ['read'], tokenId: 't1' })
    expect(principalFromContext(ANON_CTX)).toBeNull()
    expect(principalFromContext({ http: { authInfo: { extra: { userId: '', scopes: [], tokenId: 't' } } } })).toBeNull()
    expect(principalFromContext({ http: { authInfo: { extra: { userId: 'u', scopes: 'read', tokenId: 't' } } } })).toBeNull()
  })
})

describe('guard', () => {
  it('rejects requests without a principal before running the handler', async () => {
    const handler = vi.fn()
    const r = await guard(handler)({}, ANON_CTX)
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toMatch(/Unauthorized/)
    expect(handler).not.toHaveBeenCalled()
  })

  it('gates write tools on the write scope', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: 1 })
    const denied = await guard(handler, { write: true })({}, READ_CTX)
    expect(denied.isError).toBe(true)
    expect(denied.content[0].text).toMatch(/write/)
    expect(handler).not.toHaveBeenCalled()

    const allowed = await guard(handler, { write: true })({}, WRITE_CTX)
    expect(allowed).toEqual(jsonResult({ ok: 1 }))
  })

  it('passes the principal (not the args) to the handler and serializes the result', async () => {
    const handler = vi.fn().mockResolvedValue({ n: 2 })
    const r = await guard(handler)({ userId: 'attacker' }, READ_CTX)
    expect(handler).toHaveBeenCalledWith({ userId: 'attacker' }, { userId: 'user-a', scopes: ['read'], tokenId: 't1' })
    expect(parse(r)).toEqual({ n: 2 })
  })

  it('turns thrown errors into isError results', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await guard(async () => {
      throw new Error('engine failed')
    })({}, READ_CTX)
    expect(r).toEqual(errorResult('engine failed'))
    spy.mockRestore()
  })
})

describe('registerExtrackerTools — surface', () => {
  it('registers exactly the documented tools with correct read-only / destructive annotations', () => {
    const tools = captureTools()
    expect([...tools.keys()].sort()).toEqual([...READ_TOOLS, ...WRITE_TOOLS].sort())
    expect(tools.size).toBe(48)

    for (const [name, t] of tools) {
      expect(t.config.title, name).toBeTruthy()
      expect(t.config.description, name).toBeTruthy()
      expect(t.config.inputSchema, name).toBeDefined()
      const isWrite = WRITE_TOOLS.includes(name)
      expect(t.config.annotations?.readOnlyHint, name).toBe(!isWrite)
      expect(t.config.annotations?.destructiveHint, name).toBe(DESTRUCTIVE_TOOLS.has(name))
      if (!isWrite) expect(t.config.annotations?.destructiveHint, name).toBe(false)
    }
  })

  it('never exposes settings, profile, token or connected-app operations', () => {
    const names = [...captureTools().keys()].join(' ')
    expect(names).not.toMatch(/setting|profile|password|token|oauth|notification|user|subscription|theme|locale/i)
  })

  it('every write tool refuses a read-only token without touching the data layer', async () => {
    const tools = captureTools()
    for (const name of WRITE_TOOLS) {
      const r = await tools.get(name)!.cb({}, READ_CTX)
      expect(r.isError, name).toBe(true)
      expect(r.content[0].text, name).toMatch(/write/)
    }
    for (const fn of Object.values(mockData)) {
      if (typeof fn === 'function') expect(fn).not.toHaveBeenCalled()
    }
  })

  it('every read tool works with a read-only token and resolves the user from it', async () => {
    const tools = captureTools()
    for (const fn of Object.values(mockData)) {
      if (typeof fn === 'function') fn.mockResolvedValue({ ok: true, data: { fine: true } })
    }
    const args: Record<string, unknown> = {
      get_goal: { goalId: UUID_A },
      get_debt: { debtId: UUID_A },
      simulate_prepayment: { debtId: UUID_A, type: 'lump_sum', amount: 100 },
    }
    for (const name of READ_TOOLS) {
      const r = await tools.get(name)!.cb(args[name] ?? {}, READ_CTX)
      expect(r.isError, name).toBeUndefined()
    }
    const called = Object.entries(mockData).filter(([, fn]) => typeof fn === 'function' && fn.mock.calls.length > 0)
    expect(called.length).toBe(READ_TOOLS.length)
    for (const [name, fn] of called) {
      expect((fn as ReturnType<typeof vi.fn>).mock.calls[0][0], name).toBe('user-a')
    }
  })
})

describe('registerExtrackerTools — behaviour', () => {
  it('read tools resolve the user from the token', async () => {
    const tools = captureTools()
    mockData.mcpGetDashboard.mockResolvedValue({ hasPlan: false })
    mockData.mcpListExpenses.mockResolvedValue([])
    mockData.mcpGetMonthlyPlan.mockResolvedValue({ month: '2026-08', plan: null })

    expect(parse(await tools.get('get_dashboard')!.cb({}, READ_CTX))).toEqual({ hasPlan: false })
    expect(mockData.mcpGetDashboard).toHaveBeenCalledWith('user-a')

    await tools.get('list_expenses')!.cb({ limit: 5 }, READ_CTX)
    expect(mockData.mcpListExpenses).toHaveBeenCalledWith('user-a', { limit: 5 })

    await tools.get('get_monthly_plan')!.cb({ month: '2026-08' }, READ_CTX)
    expect(mockData.mcpGetMonthlyPlan).toHaveBeenCalledWith('user-a', '2026-08')
  })

  it('list_transactions converts ISO strings to Dates', async () => {
    const tools = captureTools()
    mockData.mcpListTransactions.mockResolvedValue({ items: [], totalCount: 0 })

    await tools.get('list_transactions')!.cb({ from: '2026-09-01', to: '2026-09-30T23:59:59Z', type: 'EXPENSE' }, READ_CTX)

    const [user, filters] = mockData.mcpListTransactions.mock.calls[0]
    expect(user).toBe('user-a')
    expect(filters.type).toBe('EXPENSE')
    expect(filters.from).toBeInstanceOf(Date)
    expect(filters.to?.toISOString()).toBe('2026-09-30T23:59:59.000Z')
  })

  it('write tools forward errors from the data layer as isError and unwrap successes', async () => {
    const tools = captureTools()

    mockData.mcpCreateExpense.mockResolvedValue({ ok: false, error: 'nope' })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failed = await tools.get('create_expense')!.cb({ title: 'x', amount: 1, currency: 'GEL', nextDueDate: '2026-10-01' }, WRITE_CTX)
    spy.mockRestore()
    expect(failed).toEqual(errorResult('nope'))
    expect(mockData.mcpCreateExpense).toHaveBeenCalledWith(
      'user-a',
      expect.objectContaining({ title: 'x', nextDueDate: expect.any(Date) })
    )

    mockData.mcpAddTransaction.mockResolvedValue({ ok: true, data: { transaction: { id: 't1' } } })
    const ok = await tools.get('add_transaction')!.cb({ amount: 18, categoryName: 'Food' }, WRITE_CTX)
    expect(parse(ok)).toEqual({ transaction: { id: 't1' } })
    expect(mockData.mcpAddTransaction).toHaveBeenCalledWith('user-a', expect.objectContaining({ amount: 18, categoryName: 'Food' }))
  })

  it('id-bearing write tools split the id from the payload and convert dates', async () => {
    const tools = captureTools()
    const okOutcome = { ok: true, data: { id: 'x' } }
    mockData.mcpUpdateExpense.mockResolvedValue(okOutcome)
    mockData.mcpUpdateGoal.mockResolvedValue(okOutcome)
    mockData.mcpUpdateIncomeSource.mockResolvedValue(okOutcome)
    mockData.mcpUpdateCategory.mockResolvedValue(okOutcome)
    mockData.mcpUpdateDebt.mockResolvedValue(okOutcome)
    mockData.mcpUpdatePaymentCard.mockResolvedValue(okOutcome)
    mockData.mcpContributeToGoal.mockResolvedValue(okOutcome)
    mockData.mcpWithdrawFromGoal.mockResolvedValue(okOutcome)
    mockData.mcpRecordDebtPayment.mockResolvedValue(okOutcome)
    mockData.mcpCreateDebt.mockResolvedValue(okOutcome)
    mockData.mcpCreateGoal.mockResolvedValue(okOutcome)

    await tools.get('update_expense')!.cb({ expenseId: UUID_A, amount: 5, nextDueDate: '2026-10-01' }, WRITE_CTX)
    expect(mockData.mcpUpdateExpense).toHaveBeenCalledWith('user-a', UUID_A, { amount: 5, nextDueDate: expect.any(Date) })

    await tools.get('update_goal')!.cb({ goalId: UUID_A, targetDate: null, name: 'Car' }, WRITE_CTX)
    expect(mockData.mcpUpdateGoal).toHaveBeenCalledWith('user-a', UUID_A, { name: 'Car', targetDate: null })

    await tools.get('update_goal')!.cb({ goalId: UUID_A, targetDate: '2027-01-01' }, WRITE_CTX)
    expect(mockData.mcpUpdateGoal).toHaveBeenLastCalledWith('user-a', UUID_A, { targetDate: expect.any(Date) })

    await tools.get('update_income_source')!.cb({ sourceId: UUID_A, expectedAmount: null, isActive: false }, WRITE_CTX)
    expect(mockData.mcpUpdateIncomeSource).toHaveBeenCalledWith('user-a', UUID_A, { expectedAmount: null, isActive: false })

    await tools.get('update_category')!.cb({ categoryId: UUID_A, name: 'Food', monthlyLimit: null }, WRITE_CTX)
    expect(mockData.mcpUpdateCategory).toHaveBeenCalledWith('user-a', UUID_A, { name: 'Food', monthlyLimit: null })

    await tools.get('update_debt')!.cb({ debtId: UUID_A, firstPaymentDate: '2026-11-05' }, WRITE_CTX)
    expect(mockData.mcpUpdateDebt).toHaveBeenCalledWith('user-a', UUID_A, { firstPaymentDate: expect.any(Date) })

    await tools.get('update_payment_card')!.cb({ cardId: UUID_A, nickname: 'Main' }, WRITE_CTX)
    expect(mockData.mcpUpdatePaymentCard).toHaveBeenCalledWith('user-a', UUID_A, { nickname: 'Main' })

    await tools.get('contribute_to_goal')!.cb({ goalId: UUID_A, amount: 50 }, WRITE_CTX)
    expect(mockData.mcpContributeToGoal).toHaveBeenCalledWith('user-a', UUID_A, { amount: 50, date: undefined })

    await tools.get('withdraw_from_goal')!.cb({ goalId: UUID_A, amount: 50, reason: 'repair', date: '2026-09-01' }, WRITE_CTX)
    expect(mockData.mcpWithdrawFromGoal).toHaveBeenCalledWith('user-a', UUID_A, { amount: 50, reason: 'repair', date: expect.any(Date) })

    await tools.get('record_debt_payment')!.cb({ debtId: UUID_A, paidAt: '2026-09-05' }, WRITE_CTX)
    expect(mockData.mcpRecordDebtPayment).toHaveBeenCalledWith('user-a', { debtId: UUID_A, paidAt: expect.any(Date) })

    await tools.get('create_debt')!.cb({ name: 'Car loan', principal: 10000, annualRatePct: 12, firstPaymentDate: '2026-10-05', termMonths: 24 }, WRITE_CTX)
    expect(mockData.mcpCreateDebt).toHaveBeenCalledWith('user-a', expect.objectContaining({ firstPaymentDate: expect.any(Date), termMonths: 24 }))

    await tools.get('create_goal')!.cb({ name: 'Laptop', targetAmount: 3000 }, WRITE_CTX)
    expect(mockData.mcpCreateGoal).toHaveBeenCalledWith('user-a', expect.objectContaining({ name: 'Laptop', targetDate: null }))
  })

  it('plan tools pass the plan reference (id or month) and default empty adjustments/conclusions', async () => {
    const tools = captureTools()
    const okOutcome = { ok: true, data: { plan: {} } }
    mockData.mcpConfirmPlan.mockResolvedValue(okOutcome)
    mockData.mcpCloseMonth.mockResolvedValue(okOutcome)
    mockData.mcpReopenPlan.mockResolvedValue(okOutcome)
    mockData.mcpGeneratePlan.mockResolvedValue(okOutcome)
    mockData.mcpGetClosePreview.mockResolvedValue(okOutcome)

    await tools.get('confirm_plan')!.cb({}, WRITE_CTX)
    expect(mockData.mcpConfirmPlan).toHaveBeenCalledWith('user-a', { planId: undefined, month: undefined }, [])

    await tools.get('confirm_plan')!.cb({ planId: UUID_A, adjustments: [{ allocationId: UUID_B, planned: 0 }] }, WRITE_CTX)
    expect(mockData.mcpConfirmPlan).toHaveBeenLastCalledWith('user-a', { planId: UUID_A, month: undefined }, [{ allocationId: UUID_B, planned: 0 }])

    await tools.get('close_month')!.cb({ month: '2026-08' }, WRITE_CTX)
    expect(mockData.mcpCloseMonth).toHaveBeenCalledWith('user-a', { planId: undefined, month: '2026-08' }, { conclusions: [] })

    await tools.get('reopen_plan')!.cb({ planId: UUID_A }, WRITE_CTX)
    expect(mockData.mcpReopenPlan).toHaveBeenCalledWith('user-a', { planId: UUID_A, month: undefined })

    await tools.get('generate_monthly_plan')!.cb({ month: '2026-10' }, WRITE_CTX)
    expect(mockData.mcpGeneratePlan).toHaveBeenCalledWith('user-a', '2026-10')

    await tools.get('get_close_preview')!.cb({}, READ_CTX)
    expect(mockData.mcpGetClosePreview).toHaveBeenCalledWith('user-a', { planId: undefined, month: undefined })
  })

  it('reorder_goals forwards the ordered ids', async () => {
    const tools = captureTools()
    mockData.mcpReorderGoals.mockResolvedValue({ ok: true, data: { orderedIds: [UUID_B, UUID_A] } })
    const r = await tools.get('reorder_goals')!.cb({ orderedGoalIds: [UUID_B, UUID_A] }, WRITE_CTX)
    expect(mockData.mcpReorderGoals).toHaveBeenCalledWith('user-a', [UUID_B, UUID_A])
    expect(parse(r)).toEqual({ orderedIds: [UUID_B, UUID_A] })
  })
})

describe('input schemas reject malformed arguments', () => {
  const schema = (name: string) => captureTools().get(name)!.config.inputSchema!

  it('plan / list schemas', () => {
    const plan = schema('get_monthly_plan')
    expect(plan.safeParse({ month: '2026-13' }).success).toBe(false)
    expect(plan.safeParse({ month: '2026-09' }).success).toBe(true)

    const list = schema('list_expenses')
    expect(list.safeParse({ limit: 0 }).success).toBe(false)
    expect(list.safeParse({ limit: 201 }).success).toBe(false)
    expect(list.safeParse({}).success).toBe(true)

    const confirm = schema('confirm_plan')
    expect(confirm.safeParse({ adjustments: [{ allocationId: 'nope', planned: 1 }] }).success).toBe(false)
    expect(confirm.safeParse({ adjustments: [{ allocationId: UUID_A, planned: -1 }] }).success).toBe(false)
    expect(confirm.safeParse({ planId: UUID_A, adjustments: [{ allocationId: UUID_B, planned: 0 }] }).success).toBe(true)

    const close = schema('close_month')
    expect(close.safeParse({ conclusions: [{ type: 'lower_limit', categoryId: UUID_A, delta: 1 }] }).success).toBe(false)
    expect(close.safeParse({ conclusions: [{ type: 'raise_limit', categoryId: UUID_A, delta: 50 }] }).success).toBe(true)
  })

  it('expense / transaction schemas', () => {
    const create = schema('create_expense')
    expect(create.safeParse({ title: '', amount: 1, currency: 'GEL' }).success).toBe(false)
    expect(create.safeParse({ title: 'Rent', amount: -1, currency: 'GEL' }).success).toBe(false)
    expect(create.safeParse({ title: 'Rent', amount: 1, currency: 'XXX' }).success).toBe(false)
    expect(create.safeParse({ title: 'Rent', amount: 1, currency: 'GEL', nextDueDate: 'not-a-date' }).success).toBe(false)
    expect(create.safeParse({ title: 'Rent', amount: 1, currency: 'GEL', nextDueDate: '2026-10-01' }).success).toBe(true)
    expect(create.safeParse({ title: 'Rent', amount: 1, currency: 'GEL', paymentCardId: 'card' }).success).toBe(false)

    expect(schema('update_expense').safeParse({ amount: 5 }).success).toBe(false)
    expect(schema('update_expense').safeParse({ expenseId: UUID_A }).success).toBe(true)
    expect(schema('delete_expense').safeParse({ expenseId: 'e1' }).success).toBe(false)

    const upd = schema('update_transaction')
    expect(upd.safeParse({ transactionId: UUID_A, categoryId: null, description: null }).success).toBe(true)
    expect(upd.safeParse({ transactionId: UUID_A, amount: 0 }).success).toBe(false)
  })

  it('income / goal schemas', () => {
    const src = schema('create_income_source')
    expect(src.safeParse({ name: 'Salary', type: 'STABLE', expectedAmount: 3000, expectedDay: 5 }).success).toBe(true)
    expect(src.safeParse({ name: 'Salary', type: 'STABLE', expectedDay: 32 }).success).toBe(false)
    expect(src.safeParse({ name: 'Salary', type: 'MONTHLY' }).success).toBe(false)

    const income = schema('record_income')
    expect(income.safeParse({ amount: 100 }).success).toBe(true)
    expect(income.safeParse({ amount: 100, currency: 'BTC' }).success).toBe(false)

    const goal = schema('create_goal')
    expect(goal.safeParse({ name: 'Car', targetAmount: 0 }).success).toBe(false)
    expect(goal.safeParse({ name: 'Car', targetAmount: 5000, targetDate: '2027-06-01' }).success).toBe(true)

    const withdraw = schema('withdraw_from_goal')
    expect(withdraw.safeParse({ goalId: UUID_A, amount: 10 }).success).toBe(false)
    expect(withdraw.safeParse({ goalId: UUID_A, amount: 10, reason: 'need it' }).success).toBe(true)

    expect(schema('reorder_goals').safeParse({ orderedGoalIds: [] }).success).toBe(false)
  })

  it('category / debt / card schemas', () => {
    const cat = schema('create_category')
    expect(cat.safeParse({ name: 'Food', kind: 'VARIABLE', color: '#10b981', monthlyLimit: 400 }).success).toBe(true)
    expect(cat.safeParse({ name: 'Food', kind: 'OTHER' }).success).toBe(false)
    expect(cat.safeParse({ name: 'Food', color: 'red' }).success).toBe(false)
    expect(cat.safeParse({ name: 'x'.repeat(51) }).success).toBe(false)

    const debt = schema('create_debt')
    expect(debt.safeParse({ name: 'Loan', principal: 1000, annualRatePct: 10, firstPaymentDate: '2026-10-01', termMonths: 12 }).success).toBe(true)
    expect(debt.safeParse({ name: 'Loan', principal: 1000, annualRatePct: -1, firstPaymentDate: '2026-10-01', termMonths: 12 }).success).toBe(false)
    expect(debt.safeParse({ name: 'Loan', principal: 1000, annualRatePct: 10, termMonths: 12 }).success).toBe(false)

    const sim = schema('simulate_prepayment')
    expect(sim.safeParse({ debtId: UUID_A, type: 'lump_sum', amount: 500 }).success).toBe(true)
    expect(sim.safeParse({ debtId: UUID_A, type: 'yearly', amount: 500 }).success).toBe(false)

    const card = schema('create_payment_card')
    expect(card.safeParse({ cardholderName: 'T S', cardNumber: '4242 4242 4242 4242', expiryMonth: 12, expiryYear: 2030 }).success).toBe(true)
    expect(card.safeParse({ cardholderName: 'T', cardNumber: '4242424242424242', expiryMonth: 12, expiryYear: 2030 }).success).toBe(false)
    expect(card.safeParse({ cardholderName: 'T S', cardNumber: 'abc', expiryMonth: 12, expiryYear: 2030 }).success).toBe(false)
    expect(card.safeParse({ cardholderName: 'T S', cardNumber: '4242424242424242', expiryMonth: 13, expiryYear: 2030 }).success).toBe(false)
  })
})
