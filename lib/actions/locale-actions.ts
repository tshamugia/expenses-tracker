'use server'

import { cookies } from 'next/headers'
import { isLocale, LOCALE_COOKIE, type Locale } from '@/i18n/config'
import type { ActionResult } from '@/types/settings-types'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/**
 * Persists the language preference in a cookie. No auth required — the
 * preference is per-browser and also applies to public pages.
 */
export async function setLocale(locale: string): Promise<ActionResult<Locale>> {
  try {
    if (!isLocale(locale)) {
      return { success: false, error: 'Unsupported locale' }
    }

    const store = await cookies()
    store.set(LOCALE_COOKIE, locale, {
      path: '/',
      maxAge: ONE_YEAR_SECONDS,
      sameSite: 'lax',
    })

    return { success: true, data: locale }
  } catch (error) {
    console.error('Error in setLocale:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set locale',
    }
  }
}
