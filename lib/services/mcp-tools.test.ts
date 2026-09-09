import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/server'

const mockData = vi.hoisted(() => ({
  mcpGetDashboard: vi.fn(),
  mcpGetMonthlyPlan: vi.fn(),
  mcpListExpenses: vi.fn(),
  mcpListTransactions: vi.fn(),
  mcpListCategories: vi.fn(),
  mcpListDebts: vi.fn(),
  mcpListGoals: vi.fn(),
  mcpCreateExpense: vi.fn(),
  mcpAddTransaction: vi.fn(),
  MCP_MAX_LIST: 200,
}))

vi.mock('@/lib/services/mcp-data', () => mockData)

import {
  errorResult,
  guard,
  jsonResult,
  principalFromContext,
  registerExtrackerTools,
  type ToolContext,
  type ToolResult,
} from './mcp-tools'

type Registered = {
  config: { title?: string; description?: string; inputSchema?: { safeParse: (v: unknown) => { success: boolean } }; annotations?: { readOnlyHint?: boolean } }
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

const parse = (r: ToolResult) => JSON.parse(r.content[0].text)

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

describe('registerExtrackerTools', () => {
  it('registers the documented tool surface with read-only annotations on reads', () => {
    const tools = captureTools()
    expect([...tools.keys()].sort()).toEqual(
      [
        'add_transaction',
        'create_expense',
        'get_dashboard',
        'get_monthly_plan',
        'list_categories',
        'list_debts',
        'list_expenses',
        'list_goals',
        'list_transactions',
      ].sort()
    )
    for (const [name, t] of tools) {
      expect(t.config.description, name).toBeTruthy()
      expect(t.config.inputSchema, name).toBeDefined()
      const isWrite = name === 'add_transaction' || name === 'create_expense'
      expect(t.config.annotations?.readOnlyHint, name).toBe(!isWrite)
    }
  })

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

  it('write tools refuse read-only tokens and forward errors from the data layer', async () => {
    const tools = captureTools()

    const denied = await tools.get('create_expense')!.cb({ title: 'x', amount: 1, currency: 'GEL' }, READ_CTX)
    expect(denied.isError).toBe(true)
    expect(mockData.mcpCreateExpense).not.toHaveBeenCalled()

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

  it('input schemas reject malformed arguments', () => {
    const tools = captureTools()
    const plan = tools.get('get_monthly_plan')!.config.inputSchema!
    expect(plan.safeParse({ month: '2026-13' }).success).toBe(false)
    expect(plan.safeParse({ month: '2026-09' }).success).toBe(true)

    const create = tools.get('create_expense')!.config.inputSchema!
    expect(create.safeParse({ title: '', amount: 1, currency: 'GEL' }).success).toBe(false)
    expect(create.safeParse({ title: 'Rent', amount: -1, currency: 'GEL' }).success).toBe(false)
    expect(create.safeParse({ title: 'Rent', amount: 1, currency: 'XXX' }).success).toBe(false)
    expect(create.safeParse({ title: 'Rent', amount: 1, currency: 'GEL', nextDueDate: 'not-a-date' }).success).toBe(false)
    expect(create.safeParse({ title: 'Rent', amount: 1, currency: 'GEL', nextDueDate: '2026-10-01' }).success).toBe(true)

    const list = tools.get('list_expenses')!.config.inputSchema!
    expect(list.safeParse({ limit: 0 }).success).toBe(false)
    expect(list.safeParse({ limit: 201 }).success).toBe(false)
    expect(list.safeParse({}).success).toBe(true)
  })
})
