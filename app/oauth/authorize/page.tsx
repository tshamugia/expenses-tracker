/**
 * OAuth 2.1 authorization endpoint (consent screen).
 *
 * Validates the client's request, makes sure the user is signed in (bouncing
 * through /login with a callbackUrl otherwise) and shows what the client is
 * asking for. The decision itself is taken by Server Actions in
 * lib/actions/mcp-oauth-actions.ts, which re-validate the raw parameters.
 */

import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ShieldAlert } from 'lucide-react'
import { auth } from '@/auth'
import { ConsentForm } from '@/components/oauth/consent-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { isLoopbackRedirectUri, validateAuthorizationRequest, type AuthorizeParams } from '@/lib/services/mcp-oauth'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Authorize | ExtraTracker',
  robots: { index: false, follow: false },
}

/** Keep only the first value of each parameter — what the service validates. */
function flatten(params: AuthorizeParams): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    const value = Array.isArray(v) ? v[0] : v
    if (typeof value === 'string') out[k] = value
  }
  return out
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </main>
  )
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<AuthorizeParams>
}) {
  const params = flatten(await searchParams)
  const t = await getTranslations('OAuthConsent')

  const validated = await validateAuthorizationRequest(params)
  if (!validated.ok) {
    if (validated.failure.kind === 'redirect') redirect(validated.failure.redirectTo)
    return (
      <Shell>
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              {t('invalidTitle')}
            </CardTitle>
            <CardDescription>{t('invalidDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-xs text-muted-foreground" data-testid="oauth-error">
              {validated.failure.error.code}: {validated.failure.error.message}
            </p>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  const session = await auth()
  if (!session?.user?.id) {
    const here = `/oauth/authorize?${new URLSearchParams(params).toString()}`
    redirect(`/login?callbackUrl=${encodeURIComponent(here)}`)
  }

  const { request } = validated
  return (
    <Shell>
      <ConsentForm
        params={params}
        clientName={request.client.name}
        redirectHost={new URL(request.redirectUri).host}
        isLoopback={isLoopbackRedirectUri(request.redirectUri)}
        requestedScopes={request.scopes}
        userEmail={session.user.email ?? ''}
      />
    </Shell>
  )
}
