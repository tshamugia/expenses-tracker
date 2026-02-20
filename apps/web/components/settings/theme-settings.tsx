'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Moon, Sun, Monitor, Loader2, Check } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { updateUserSettings } from '@/lib/actions/settings-actions'
import type { UserSettings, Theme } from '@extracker/types'

interface ThemeSettingsProps {
  settings: UserSettings
}

const themes: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function ThemeSettings({ settings }: ThemeSettingsProps) {
  const router = useRouter()
  const { theme: currentTheme, setTheme } = useTheme()
  const [isLoading, setIsLoading] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleThemeChange = async (newTheme: Theme) => {
    setIsLoading(true)

    try {
      // Update theme immediately for better UX
      setTheme(newTheme)

      // Save to database
      const result = await updateUserSettings({
        theme: newTheme,
      })

      if (result.success) {
        toast.success(`Theme changed to ${newTheme}`)
        router.refresh()
      } else {
        toast.error(result.error)
        // Revert on error
        setTheme(settings.theme)
      }
    } catch (error) {
      toast.error('Failed to update theme')
      console.error('Theme update error:', error)
      // Revert on error
      setTheme(settings.theme)
    } finally {
      setIsLoading(false)
    }
  }

  if (!mounted) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sun className="h-5 w-5" />
          Theme Preference
        </CardTitle>
        <CardDescription>
          Choose your preferred color theme for the application
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {themes.map(({ value, label, icon: Icon }) => {
            const isActive = currentTheme === value
            return (
              <Button
                key={value}
                variant={isActive ? 'default' : 'outline'}
                className="flex flex-col items-center gap-2 h-auto py-4 relative"
                onClick={() => handleThemeChange(value)}
                disabled={isLoading}
              >
                {isLoading && currentTheme === value && (
                  <Loader2 className="absolute top-2 right-2 h-4 w-4 animate-spin" />
                )}
                {isActive && !isLoading && (
                  <Check className="absolute top-2 right-2 h-4 w-4" />
                )}
                <Icon className="h-6 w-6" />
                <span className="text-sm">{label}</span>
              </Button>
            )
          })}
        </div>

        <div className="rounded-lg bg-muted p-4">
          <p className="text-sm font-medium mb-2">Theme Preview</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Background</Label>
              <div className="h-12 rounded-md bg-background border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Primary</Label>
              <div className="h-12 rounded-md bg-primary" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Card</Label>
              <div className="h-12 rounded-md bg-card border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Muted</Label>
              <div className="h-12 rounded-md bg-muted" />
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {currentTheme === 'system'
            ? 'Theme will automatically match your system preferences'
            : `Currently using ${currentTheme} theme`}
        </p>
      </CardContent>
    </Card>
  )
}
