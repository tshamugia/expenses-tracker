import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { defaultLocale, isLocale, LOCALE_COOKIE } from './config'

/**
 * next-intl request config ("without i18n routing" mode): the locale comes
 * from a cookie instead of the URL, so all routes keep their current paths.
 */
export default getRequestConfig(async () => {
  const store = await cookies()
  const candidate = store.get(LOCALE_COOKIE)?.value
  const locale = isLocale(candidate) ? candidate : defaultLocale

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
