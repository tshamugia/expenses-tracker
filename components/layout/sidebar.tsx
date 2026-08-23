'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Receipt,
  CreditCard,
  Settings,
  FolderKanban,
  User,
  Bell,
  TrendingUp,
  Landmark,
  Target,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

const navigation = [
  {
    key: 'dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    key: 'income',
    href: '/income',
    icon: TrendingUp,
  },
  {
    key: 'expenses',
    href: '/expenses',
    icon: Receipt,
  },
  {
    key: 'debts',
    href: '/debts',
    icon: Landmark,
  },
  {
    key: 'goals',
    href: '/goals',
    icon: Target,
  },
  {
    key: 'categories',
    href: '/categories',
    icon: FolderKanban,
  },
  {
    key: 'payments',
    href: '/payments',
    icon: CreditCard,
  },
  {
    key: 'notifications',
    href: '/notifications',
    icon: Bell,
  },
  {
    key: 'profile',
    href: '/profile',
    icon: User,
  },
  {
    key: 'settings',
    href: '/settings',
    icon: Settings,
  },
] as const

function SidebarContent({
  onNavigate,
  showHeader = true,
}: {
  onNavigate?: () => void
  showHeader?: boolean
}) {
  const pathname = usePathname()
  const t = useTranslations('Sidebar')

  return (
    <div className="flex h-full flex-col">
      {/* Logo Section — hidden in the mobile sheet, which has its own "Menu" title */}
      {showHeader && (
        <div className="flex h-16 items-center border-b border-border px-6">
          <div className="flex items-center gap-2 font-semibold">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              💰
            </div>
            <span>{t('appName')}</span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span>{t(`nav.${item.key}`)}</span>
              </Link>
            )
          })}
        </nav>
      </ScrollArea>

      <Separator />

      {/* Footer Section */}
      <div className="p-4">
        <p className="text-xs text-muted-foreground">
          {t('footer')}
        </p>
      </div>
    </div>
  )
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const t = useTranslations('Sidebar')

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 border-r border-border bg-card md:block">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar (Sheet) */}
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex h-full flex-col">
            <div className="flex h-16 items-center border-b border-border px-6">
              <div className="flex items-center gap-2 font-semibold">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  💰
                </div>
                <SheetTitle className="text-base">{t('menu')}</SheetTitle>
                <SheetDescription className="sr-only">
                  {t('mainNavigation')}
                </SheetDescription>
              </div>
            </div>
            <SidebarContent onNavigate={onClose} showHeader={false} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
