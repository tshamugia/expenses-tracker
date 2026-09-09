'use client'

/**
 * Consent screen body for /oauth/authorize. Shows who is asking (client name +
 * redirect host — the host is the trustworthy part, the name is self-asserted),
 * which permissions are requested, and lets the user withhold `write`.
 * The approve/deny decision goes through Server Actions that re-validate the
 * raw request parameters; the result URL is followed with a full navigation
 * because it points at the client (e.g. claude.ai), not at this app.
 */

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Bot, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { approveAuthorization, denyAuthorization } from '@/lib/actions/mcp-oauth-actions'
import type { McpScope } from '@/types/mcp-types'

export interface ConsentFormProps {
  /** Raw /oauth/authorize query parameters; re-validated server-side. */
  params: Record<string, string>
  clientName: string
  redirectHost: string
  isLoopback: boolean
  requestedScopes: McpScope[]
  userEmail: string
  /** Navigation hook (defaults to window.location.assign); injectable for tests. */
  navigate?: (url: string) => void
}

export function ConsentForm({
  params,
  clientName,
  redirectHost,
  isLoopback,
  requestedScopes,
  userEmail,
  navigate = (url) => window.location.assign(url),
}: ConsentFormProps) {
  const t = useTranslations('OAuthConsent')
  const writeRequested = requestedScopes.includes('write')
  const [allowWrite, setAllowWrite] = useState(writeRequested)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'approve' | 'deny' | null>(null)
  const [, startTransition] = useTransition()

  const run = (kind: 'approve' | 'deny') => {
    setPending(kind)
    setError(null)
    startTransition(async () => {
      const result =
        kind === 'approve'
          ? await approveAuthorization(params, { allowWrite: writeRequested && allowWrite })
          : await denyAuthorization(params)
      if (result.success) {
        navigate(result.data.redirectTo)
      } else {
        setError(result.error)
        setPending(null)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-center">{t('title', { client: clientName })}</CardTitle>
        <CardDescription className="text-center">{t('signedInAs', { email: userEmail })}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span>{t('redirectsTo')} </span>
          <span className="font-mono text-foreground" data-testid="redirect-host">
            {redirectHost}
          </span>
          {isLoopback && <p className="mt-1 text-amber-600 dark:text-amber-400">{t('loopbackWarning')}</p>}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">{t('permissionsTitle')}</p>
          <ul className="space-y-2">
            <li className="flex items-start gap-2 text-sm">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="font-medium">{t('readTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('readDescription')}</p>
              </div>
            </li>
            {writeRequested && (
              <li className="flex items-start justify-between gap-3 text-sm">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div>
                    <Label htmlFor="consent-write" className="font-medium">
                      {t('writeTitle')}
                    </Label>
                    <p className="text-xs text-muted-foreground">{t('writeDescription')}</p>
                  </div>
                </div>
                <Switch
                  id="consent-write"
                  checked={allowWrite}
                  onCheckedChange={setAllowWrite}
                  aria-label={t('writeTitle')}
                />
              </li>
            )}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">{t('revokeHint')}</p>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>

      <CardFooter className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" disabled={pending !== null} onClick={() => run('deny')}>
          {pending === 'deny' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('deny')}
        </Button>
        <Button type="button" className="flex-1" disabled={pending !== null} onClick={() => run('approve')}>
          {pending === 'approve' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('approve')}
        </Button>
      </CardFooter>
    </Card>
  )
}
