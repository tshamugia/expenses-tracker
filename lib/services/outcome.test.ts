import { describe, expect, it } from 'vitest'
import { OutcomeError, fail, ok, toActionResult, unwrap } from './outcome'

describe('outcome helpers', () => {
  it('ok / fail build the discriminated union', () => {
    expect(ok(1)).toEqual({ ok: true, data: 1 })
    expect(fail('nope')).toEqual({ ok: false, error: 'nope' })
  })

  it('toActionResult maps onto the Server Action result shape', () => {
    expect(toActionResult(ok({ id: 'x' }))).toEqual({ success: true, data: { id: 'x' } })
    expect(toActionResult(fail('denied'))).toEqual({ success: false, error: 'denied' })
  })

  it('unwrap returns the data or throws an OutcomeError carrying the message', () => {
    expect(unwrap(ok('v'))).toBe('v')
    expect(() => unwrap(fail('bad input'))).toThrow(OutcomeError)
    expect(() => unwrap(fail('bad input'))).toThrow('bad input')
  })
})
