import { describe, expect, it } from 'vitest'
import type { CurrencyRate } from '@/lib/services/currency'
import { getCategorySpendStatus, sumSpentByCategory } from './category-spend'

const makeRate = (code: string, rate: number): CurrencyRate => ({
  code,
  quantity: 1,
  rateFormated: String(rate),
  diffFormated: '0',
  rate,
  name: code,
  diff: 0,
  date: '2026-08-01',
  validFromDate: '2026-08-01',
})

describe('getCategorySpendStatus', () => {
  const statusFor = (spent: number, monthlyLimit: number | null) =>
    getCategorySpendStatus(new Map([['cat-1', spent]]), [
      { id: 'cat-1', monthlyLimit },
    ])[0]

  it('limit null → level ok, ratio null', () => {
    const status = statusFor(420, null)

    expect(status).toEqual({
      categoryId: 'cat-1',
      spent: 420,
      limit: null,
      ratio: null,
      level: 'ok',
    })
  })

  it('below 80% → ok', () => {
    const status = statusFor(399, 500)

    expect(status.level).toBe('ok')
    expect(status.ratio).toBeCloseTo(0.798)
  })

  it('exactly 80% → warning', () => {
    const status = statusFor(400, 500)

    expect(status.level).toBe('warning')
    expect(status.ratio).toBe(0.8)
  })

  it('exactly 100% → warning', () => {
    const status = statusFor(500, 500)

    expect(status.level).toBe('warning')
    expect(status.ratio).toBe(1)
  })

  it('100.01% → over', () => {
    const status = statusFor(500.05, 500)

    expect(status.level).toBe('over')
    expect(status.ratio).toBeGreaterThan(1)
  })

  it('category with no transactions → spent 0', () => {
    const statuses = getCategorySpendStatus(new Map(), [
      { id: 'cat-1', monthlyLimit: 500 },
    ])

    expect(statuses[0].spent).toBe(0)
    expect(statuses[0].level).toBe('ok')
  })
})

describe('sumSpentByCategory', () => {
  const usdRate = makeRate('USD', 2.7)
  const eurRate = makeRate('EUR', 3.0)

  it('sums multi-currency expenses in the default currency', () => {
    const spent = sumSpentByCategory(
      [
        { categoryId: 'cat-1', amount: 100, currency: 'GEL' },
        { categoryId: 'cat-1', amount: 10, currency: 'USD' }, // → 27 GEL
        { categoryId: 'cat-1', amount: 10, currency: 'EUR' }, // → 30 GEL
      ],
      'GEL',
      usdRate,
      eurRate
    )

    expect(spent.get('cat-1')).toBeCloseTo(157)
  })

  it('groups amounts per category and skips uncategorized transactions', () => {
    const spent = sumSpentByCategory(
      [
        { categoryId: 'cat-1', amount: 50, currency: 'GEL' },
        { categoryId: 'cat-2', amount: 80, currency: 'GEL' },
        { categoryId: null, amount: 999, currency: 'GEL' },
      ],
      'GEL',
      usdRate,
      eurRate
    )

    expect(spent.get('cat-1')).toBe(50)
    expect(spent.get('cat-2')).toBe(80)
    expect(spent.size).toBe(2)
  })
})
