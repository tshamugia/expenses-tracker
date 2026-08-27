import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE } from '@/i18n/config'
import { setLocale } from './locale-actions'

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

const cookieSet = vi.fn()

beforeEach(() => {
  cookieSet.mockClear()
  vi.mocked(cookies).mockResolvedValue({
    set: cookieSet,
  } as unknown as Awaited<ReturnType<typeof cookies>>)
})

describe('setLocale', () => {
  it('sets the locale cookie for a supported locale', async () => {
    const result = await setLocale('ka')

    expect(result).toEqual({ success: true, data: 'ka' })
    expect(cookieSet).toHaveBeenCalledWith(
      LOCALE_COOKIE,
      'ka',
      expect.objectContaining({ path: '/' })
    )
  })

  it('rejects an unsupported locale without touching the cookie', async () => {
    const result = await setLocale('fr')

    expect(result).toEqual({ success: false, error: 'Unsupported locale' })
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('returns an error result when the cookie store throws', async () => {
    vi.mocked(cookies).mockRejectedValueOnce(new Error('no request scope'))

    const result = await setLocale('en')

    expect(result).toEqual({ success: false, error: 'no request scope' })
  })
})
