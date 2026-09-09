'use client'

/**
 * MCP access (Settings): Claude.ai connections (OAuth grants) and personal
 * access tokens for headless AI clients. Lists both, generates a new token
 * (raw secret shown exactly once) and revokes either. Lists are kept in local
 * state so the card updates instantly; the page is refreshed afterwards to
 * stay in sync with the server.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Bot, Check, Copy, KeyRound, Link2, Loader2, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createMcpToken, revokeMcpToken } from '@/lib/actions/mcp-token-actions'
import { revokeConnectedApp } from '@/lib/actions/mcp-oauth-actions'
import type { ConnectedAppItem, CreatedMcpToken, McpScope, McpTokenListItem } from '@/types/mcp-types'

interface McpTokensSettingsProps {
  tokens: McpTokenListItem[]
  /** OAuth connections (Claude.ai custom connector etc.). */
  connectedApps: ConnectedAppItem[]
  /** Absolute URL of the MCP endpoint, e.g. https://host/api/mcp */
  mcpUrl: string
}

type ScopeChoice = 'read' | 'write'
type ExpiryChoice = 'never' | '30' | '90' | '365'

function scopesFor(choice: ScopeChoice): McpScope[] {
  return choice === 'write' ? ['read', 'write'] : ['read']
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    const ok = await copyText(value)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy} aria-label={label}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      <span className="ml-1.5">{copied ? copiedLabel : label}</span>
    </Button>
  )
}

/** "Revoke → are you sure? yes/no" control shared by tokens and connected apps. */
function RevokeControl({
  name,
  label,
  onConfirm,
}: {
  name: string
  label: string
  onConfirm: () => Promise<boolean>
}) {
  const t = useTranslations('McpTokens')
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleConfirm = () => {
    startTransition(async () => {
      await onConfirm()
      setConfirming(false)
    })
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs">{t('confirmRevoke')}</span>
        <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={handleConfirm}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('yes')}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => setConfirming(false)}>
          {t('no')}
        </Button>
      </div>
    )
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="text-destructive hover:text-destructive"
      onClick={() => setConfirming(true)}
      aria-label={`${label} ${name}`}
    >
      <Trash2 className="mr-1.5 h-4 w-4" />
      {label}
    </Button>
  )
}

function ScopeBadge({ scopes }: { scopes: string[] }) {
  const t = useTranslations('McpTokens')
  return scopes.includes('write') ? (
    <Badge variant="destructive">{t('scopeBadgeWrite')}</Badge>
  ) : (
    <Badge variant="secondary">{t('scopeBadgeRead')}</Badge>
  )
}

function CreateTokenForm({
  onCreated,
  onCancel,
}: {
  onCreated: (created: CreatedMcpToken) => void
  onCancel: () => void
}) {
  const t = useTranslations('McpTokens')
  const [name, setName] = useState('')
  const [scope, setScope] = useState<ScopeChoice>('read')
  const [expiry, setExpiry] = useState<ExpiryChoice>('never')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('errorName'))
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await createMcpToken({
        name: name.trim(),
        scopes: scopesFor(scope),
        expiresInDays: expiry === 'never' ? null : Number(expiry),
      })
      if (result.success) {
        onCreated(result.data)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="mcp-token-name">{t('nameLabel')}</Label>
        <Input
          id="mcp-token-name"
          autoFocus
          maxLength={60}
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="mcp-token-scope">{t('scopeLabel')}</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as ScopeChoice)}>
            <SelectTrigger id="mcp-token-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="read">{t('scopeRead')}</SelectItem>
              <SelectItem value="write">{t('scopeWrite')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mcp-token-expiry">{t('expiresLabel')}</Label>
          <Select value={expiry} onValueChange={(v) => setExpiry(v as ExpiryChoice)}>
            <SelectTrigger id="mcp-token-expiry">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="never">{t('expiresNever')}</SelectItem>
              <SelectItem value="30">{t('expires30')}</SelectItem>
              <SelectItem value="90">{t('expires90')}</SelectItem>
              <SelectItem value="365">{t('expires365')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('scopeHint')}</p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('create')}
        </Button>
      </DialogFooter>
    </form>
  )
}

function CreatedTokenView({
  created,
  mcpUrl,
  onDone,
}: {
  created: CreatedMcpToken
  mcpUrl: string
  onDone: () => void
}) {
  const t = useTranslations('McpTokens')
  const snippet = `claude mcp add --transport http extracker ${mcpUrl} --header "Authorization: Bearer ${created.token}"`

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('createdHint')}</p>

      <div className="space-y-1.5">
        <Label>{t('tokenLabel')}</Label>
        <div className="flex items-center gap-2">
          <code
            data-testid="mcp-raw-token"
            className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-xs"
          >
            {created.token}
          </code>
          <CopyButton value={created.token} label={t('copy')} copiedLabel={t('copied')} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t('clientSnippetLabel')}</Label>
        <div className="flex items-start gap-2">
          <pre className="flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded-md border bg-muted px-3 py-2 font-mono text-xs">
            {snippet}
          </pre>
          <CopyButton value={snippet} label={t('copy')} copiedLabel={t('copied')} />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" onClick={onDone}>
          {t('done')}
        </Button>
      </DialogFooter>
    </div>
  )
}

export function McpTokensSettings({
  tokens: initialTokens,
  connectedApps: initialApps,
  mcpUrl,
}: McpTokensSettingsProps) {
  const t = useTranslations('McpTokens')
  const router = useRouter()
  const [tokens, setTokens] = useState<McpTokenListItem[]>(initialTokens)
  const [apps, setApps] = useState<ConnectedAppItem[]>(initialApps)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [created, setCreated] = useState<CreatedMcpToken | null>(null)

  const handleCreated = (result: CreatedMcpToken) => {
    setCreated(result)
    setTokens((prev) => [result.item, ...prev])
    toast.success(t('created'))
  }

  const closeDialog = () => {
    setDialogOpen(false)
    if (created) {
      setCreated(null)
      router.refresh()
    }
  }

  const handleRevokeToken = async (id: string) => {
    const result = await revokeMcpToken(id)
    if (result.success) {
      setTokens((prev) => prev.filter((tok) => tok.id !== id))
      toast.success(t('revoked'))
      router.refresh()
    } else {
      toast.error(result.error)
    }
    return result.success
  }

  const handleDisconnectApp = async (id: string) => {
    const result = await revokeConnectedApp(id)
    if (result.success) {
      setApps((prev) => prev.filter((app) => app.id !== id))
      toast.success(t('disconnected'))
      router.refresh()
    } else {
      toast.error(result.error)
    }
    return result.success
  }

  const formatDate = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString() : null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1.5">
          <Label>{t('endpointLabel')}</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-xs">
              {mcpUrl}
            </code>
            <CopyButton value={mcpUrl} label={t('copy')} copiedLabel={t('copied')} />
          </div>
          <p className="text-xs text-muted-foreground">{t('claudeAiHint')}</p>
        </div>

        <div className="space-y-3">
          <Label>{t('connectedAppsLabel')}</Label>
          {apps.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noConnectedApps')}</p>
          ) : (
            <ul className="divide-y rounded-md border" data-testid="connected-apps">
              {apps.map((app) => (
                <li key={app.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{app.clientName}</span>
                      <ScopeBadge scopes={app.scopes} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {app.lastUsedAt
                        ? `${t('lastUsed')}: ${formatDate(app.lastUsedAt)}`
                        : t('neverUsed')}
                      {` · ${t('connectedOn')}: ${formatDate(app.createdAt)}`}
                    </p>
                  </div>
                  <RevokeControl
                    name={app.clientName}
                    label={t('disconnect')}
                    onConfirm={() => handleDisconnectApp(app.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>{t('tokensLabel')}</Label>
            <Button type="button" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t('generate')}
            </Button>
          </div>

          {tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noTokens')}</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {tokens.map((tok) => (
                <li key={tok.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{tok.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">…{tok.lastFour}</span>
                      <ScopeBadge scopes={tok.scopes} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tok.lastUsedAt
                        ? `${t('lastUsed')}: ${formatDate(tok.lastUsedAt)}`
                        : t('neverUsed')}
                      {tok.expiresAt && ` · ${t('expiresOn')}: ${formatDate(tok.expiresAt)}`}
                    </p>
                  </div>
                  <RevokeControl name={tok.name} label={t('revoke')} onConfirm={() => handleRevokeToken(tok.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{created ? t('createdTitle') : t('generate')}</DialogTitle>
            <DialogDescription>{created ? t('createdDescription') : t('generateDescription')}</DialogDescription>
          </DialogHeader>
          {created ? (
            <CreatedTokenView created={created} mcpUrl={mcpUrl} onDone={closeDialog} />
          ) : (
            <CreateTokenForm onCreated={handleCreated} onCancel={closeDialog} />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
