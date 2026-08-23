export const locales = ['en', 'ka'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

/** Cookie that stores the user's language preference (no locale in the URL). */
export const LOCALE_COOKIE = 'locale'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value)
}
