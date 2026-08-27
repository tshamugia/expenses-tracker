import { describe, expect, it } from 'vitest'
import {
  formatAmount,
  formatCompactCurrency,
  formatCurrency,
  getCurrencySymbol,
  parseCurrency,
} from '@/lib/utils/currency-helpers'

describe('formatCurrency', () => {
  it('formats USD amounts with symbol and two decimals', () => {
    expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50')
  })

  it('accepts string amounts', () => {
    expect(formatCurrency('99.9', 'USD')).toBe('$99.90')
  })

  it('falls back to symbol prefix for invalid currency codes', () => {
    expect(formatCurrency(10, 'NOPE')).toBe('NOPE10.00')
  })
})

describe('getCurrencySymbol', () => {
  it('returns the mapped symbol', () => {
    expect(getCurrencySymbol('GEL')).toBe('₾')
    expect(getCurrencySymbol('usd')).toBe('$')
  })

  it('returns the code itself when unknown', () => {
    expect(getCurrencySymbol('XYZ')).toBe('XYZ')
  })
})

describe('formatAmount', () => {
  it('formats with thousands separators and two decimals', () => {
    expect(formatAmount(1234567.891)).toBe('1,234,567.89')
  })
})

describe('parseCurrency', () => {
  it('strips symbols and separators', () => {
    expect(parseCurrency('$1,234.56')).toBe(1234.56)
  })

  it('handles negative values', () => {
    expect(parseCurrency('-₾50.25')).toBe(-50.25)
  })

  it('returns 0 for non-numeric input', () => {
    expect(parseCurrency('abc')).toBe(0)
  })
})

describe('formatCompactCurrency', () => {
  it('uses M suffix above one million', () => {
    expect(formatCompactCurrency(2500000, 'USD')).toBe('$2.5M')
  })

  it('uses K suffix above one thousand', () => {
    expect(formatCompactCurrency(1500, 'GEL')).toBe('₾1.5K')
  })

  it('keeps small amounts as plain decimals', () => {
    expect(formatCompactCurrency(999, 'USD')).toBe('$999.00')
  })
})
