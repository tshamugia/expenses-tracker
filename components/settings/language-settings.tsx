'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Check, Languages, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { setLocale } from '@/lib/actions/locale-actions'
import type { Locale } from '@/i18n/config'

const languages: Array<{ value: Locale; labelKey: 'english' | 'georgian'; nativeName: string }> = [
  { value: 'en', labelKey: 'english', nativeName: 'English' },
  { value: 'ka', labelKey: 'georgian', nativeName: 'ქართული' },
]

export function LanguageSettings() {
  const t = useTranslations('LanguageSettings')
  const router = useRouter()
  const currentLocale = useLocale()
  const [isPending, startTransition] = useTransition()

  const handleLanguageChange = (locale: Locale) => {
    if (locale === currentLocale) return

    startTransition(async () => {
      const result = await setLocale(locale)

      if (result.success) {
        toast.success(t('updated'))
        router.refresh()
      } else {
        toast.error(t('updateFailed'))
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          {languages.map(({ value, labelKey, nativeName }) => {
            const isActive = currentLocale === value
            return (
              <Button
                key={value}
                variant={isActive ? 'default' : 'outline'}
                className="flex flex-col items-center gap-1 h-auto py-4 relative"
                onClick={() => handleLanguageChange(value)}
                disabled={isPending}
              >
                {isPending && !isActive && (
                  <Loader2 className="absolute top-2 right-2 h-4 w-4 animate-spin" />
                )}
                {isActive && !isPending && (
                  <Check className="absolute top-2 right-2 h-4 w-4" />
                )}
                <span className="text-sm font-semibold">{nativeName}</span>
                <span className="text-xs text-muted-foreground">{t(labelKey)}</span>
              </Button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
