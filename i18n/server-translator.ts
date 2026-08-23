import { createTranslator } from 'next-intl'
import { getLocale } from 'next-intl/server'
import en from '@/messages/en.json'
import ka from '@/messages/ka.json'
import { defaultLocale, isLocale, type Locale } from './config'

const MESSAGES = { en, ka } as const

type Messages = typeof en
export type MessageNamespace = keyof Messages

/**
 * Resolve the request locale outside of a component (services, Server
 * Actions). Falls back to the default locale when there is no request scope
 * (cron jobs, tests).
 */
export async function resolveLocale(): Promise<Locale> {
  try {
    const locale = await getLocale()
    return isLocale(locale) ? locale : defaultLocale
  } catch {
    return defaultLocale
  }
}

/**
 * Locale-aware translator for server-side services (notifications, emails)
 * that run both inside a request (locale cookie available) and outside of
 * one (cron), where it falls back to the default locale.
 */
export async function getServerTranslator(namespace: MessageNamespace) {
  const locale = await resolveLocale()
  return createTranslator({
    locale,
    messages: MESSAGES[locale] as Messages,
    namespace,
  })
}
