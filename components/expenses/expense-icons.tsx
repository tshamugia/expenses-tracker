'use client'

/**
 * Expense icon registry.
 *
 * Lets users attach a brand/category logo to an expense (e.g. bank, Anthropic,
 * Spotify). Brand logos come from `simple-icons`; generic category icons come
 * from `lucide-react`. Each entry is keyed by a stable `slug` that is what gets
 * persisted on the Expense (`expense.icon`).
 */

import type { LucideIcon } from 'lucide-react'
import {
  Landmark,
  Wallet,
  CreditCard,
  Home,
  Zap,
  Wifi,
  Smartphone,
  ShoppingCart,
  Car,
  Dumbbell,
  HeartPulse,
  GraduationCap,
  Plane,
  Utensils,
  Tv,
  Cloud,
  Gamepad2,
  Receipt,
} from 'lucide-react'
import type { SimpleIcon } from 'simple-icons'
import {
  siSpotify,
  siNetflix,
  siYoutube,
  siHbo,
  siAppletv,
  siTwitch,
  siAnthropic,
  siClaude,
  siGoogle,
  siApple,
  siGoogledrive,
  siIcloud,
  siDropbox,
  siNotion,
  siGithub,
  siFigma,
  siDiscord,
  siTelegram,
  siWhatsapp,
  siPatreon,
  siAudible,
  siPaypal,
} from 'simple-icons'

export interface ExpenseIconDef {
  slug: string
  label: string
  /** Brand logo from simple-icons. */
  brand?: SimpleIcon
  /** Generic icon from lucide-react. */
  lucide?: LucideIcon
  /** Accent colour (hex without `#`). For brands this defaults to the brand hex. */
  color?: string
}

export interface ExpenseIconGroup {
  name: string
  icons: ExpenseIconDef[]
}

export const EXPENSE_ICON_GROUPS: ExpenseIconGroup[] = [
  {
    name: 'Subscriptions',
    icons: [
      { slug: 'spotify', label: 'Spotify', brand: siSpotify },
      { slug: 'netflix', label: 'Netflix', brand: siNetflix },
      { slug: 'youtube', label: 'YouTube', brand: siYoutube },
      { slug: 'hbo', label: 'HBO', brand: siHbo },
      { slug: 'appletv', label: 'Apple TV', brand: siAppletv },
      { slug: 'twitch', label: 'Twitch', brand: siTwitch },
      { slug: 'anthropic', label: 'Anthropic', brand: siAnthropic },
      { slug: 'claude', label: 'Claude', brand: siClaude },
      { slug: 'google', label: 'Google', brand: siGoogle },
      { slug: 'apple', label: 'Apple', brand: siApple },
      { slug: 'googledrive', label: 'Google Drive', brand: siGoogledrive },
      { slug: 'icloud', label: 'iCloud', brand: siIcloud },
      { slug: 'dropbox', label: 'Dropbox', brand: siDropbox },
      { slug: 'notion', label: 'Notion', brand: siNotion },
      { slug: 'github', label: 'GitHub', brand: siGithub },
      { slug: 'figma', label: 'Figma', brand: siFigma },
      { slug: 'discord', label: 'Discord', brand: siDiscord },
      { slug: 'telegram', label: 'Telegram', brand: siTelegram },
      { slug: 'whatsapp', label: 'WhatsApp', brand: siWhatsapp },
      { slug: 'patreon', label: 'Patreon', brand: siPatreon },
      { slug: 'audible', label: 'Audible', brand: siAudible },
    ],
  },
  {
    name: 'Finance',
    icons: [
      { slug: 'bank', label: 'Bank', lucide: Landmark, color: '2563eb' },
      { slug: 'wallet', label: 'Wallet', lucide: Wallet, color: '16a34a' },
      { slug: 'card', label: 'Card', lucide: CreditCard, color: '7c3aed' },
      { slug: 'paypal', label: 'PayPal', brand: siPaypal },
    ],
  },
  {
    name: 'Categories',
    icons: [
      { slug: 'rent', label: 'Rent', lucide: Home, color: 'd97706' },
      { slug: 'utilities', label: 'Utilities', lucide: Zap, color: 'eab308' },
      { slug: 'internet', label: 'Internet', lucide: Wifi, color: '0ea5e9' },
      { slug: 'phone', label: 'Phone', lucide: Smartphone, color: '64748b' },
      { slug: 'groceries', label: 'Groceries', lucide: ShoppingCart, color: '22c55e' },
      { slug: 'transport', label: 'Transport', lucide: Car, color: '3b82f6' },
      { slug: 'gym', label: 'Gym', lucide: Dumbbell, color: 'ef4444' },
      { slug: 'health', label: 'Health', lucide: HeartPulse, color: 'ec4899' },
      { slug: 'education', label: 'Education', lucide: GraduationCap, color: '8b5cf6' },
      { slug: 'travel', label: 'Travel', lucide: Plane, color: '06b6d4' },
      { slug: 'food', label: 'Food', lucide: Utensils, color: 'f97316' },
      { slug: 'tv', label: 'TV', lucide: Tv, color: '6366f1' },
      { slug: 'cloud', label: 'Cloud', lucide: Cloud, color: '94a3b8' },
      { slug: 'gaming', label: 'Gaming', lucide: Gamepad2, color: '10b981' },
    ],
  },
]

export const ICON_MAP: Record<string, ExpenseIconDef> = Object.fromEntries(
  EXPENSE_ICON_GROUPS.flatMap((group) => group.icons).map((icon) => [icon.slug, icon])
)

// Relative luminance of a 6-digit hex, used to detect near-black/near-white
// brand logos that need a theme-adaptive colour instead of their own hex.
function luminance(hex: string): number {
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.114 * b
}

interface ExpenseIconProps {
  slug?: string | null
  /** Container size in px. */
  size?: number
  className?: string
}

/**
 * Renders the icon for a given slug inside a tinted rounded square.
 * Returns null when the slug is unknown/empty so callers can lay out freely.
 */
export function ExpenseIcon({ slug, size = 40, className }: ExpenseIconProps) {
  const def = slug ? ICON_MAP[slug] : undefined
  if (!def) return null

  const rawHex = def.color || def.brand?.hex || '64748b'
  const lum = luminance(rawHex)
  // Monochrome logos (near-black or near-white) get theme-adaptive colours so
  // they stay visible in both light and dark mode.
  const isMono = lum < 0.12 || lum > 0.88
  const accent = `#${rawHex}`
  const glyphSize = Math.round(size * 0.55)

  const containerClass = `flex shrink-0 items-center justify-center rounded-lg ${
    isMono ? 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100' : ''
  } ${className ?? ''}`
  const containerStyle = isMono
    ? { width: size, height: size }
    : { width: size, height: size, backgroundColor: `${accent}1f` }

  return (
    <div className={containerClass} style={containerStyle} title={def.label}>
      {def.brand ? (
        <svg
          role="img"
          viewBox="0 0 24 24"
          width={glyphSize}
          height={glyphSize}
          fill={isMono ? 'currentColor' : accent}
          aria-label={def.label}
        >
          <path d={def.brand.path} />
        </svg>
      ) : def.lucide ? (
        <def.lucide
          style={{ width: glyphSize, height: glyphSize, color: isMono ? undefined : accent }}
        />
      ) : (
        <Receipt style={{ width: glyphSize, height: glyphSize, color: accent }} />
      )}
    </div>
  )
}

interface IconPickerProps {
  value?: string | null
  onChange: (slug: string | null) => void
}

/**
 * Grid picker used inside the expense form. Clicking the selected icon again
 * clears it (returns to "no icon").
 */
export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="space-y-4">
      {EXPENSE_ICON_GROUPS.map((group) => (
        <div key={group.name}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {group.name}
          </p>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {group.icons.map((icon) => {
              const isSelected = value === icon.slug
              return (
                <button
                  key={icon.slug}
                  type="button"
                  onClick={() => onChange(isSelected ? null : icon.slug)}
                  title={icon.label}
                  aria-pressed={isSelected}
                  className={`flex items-center justify-center rounded-lg border-2 p-1.5 transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-transparent hover:border-slate-300 hover:bg-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <ExpenseIcon slug={icon.slug} size={32} />
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
