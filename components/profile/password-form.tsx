'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Lock, Eye, EyeOff, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { setPassword } from '@/lib/actions/user-actions'

interface PasswordFormProps {
  hasPassword: boolean
  provider: string | null
}

export function PasswordForm({ hasPassword, provider }: PasswordFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  })
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const result = await setPassword({
        currentPassword: hasPassword ? formData.currentPassword : undefined,
        newPassword: formData.newPassword,
        confirmPassword: formData.confirmPassword,
      })

      if (result.success) {
        toast.success(result.data.message)
        setFormData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        })
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error('Failed to set password')
      console.error('Password update error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleShowPassword = (field: 'current' | 'new' | 'confirm') => {
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  const isFormValid =
    formData.newPassword.length >= 8 &&
    formData.newPassword === formData.confirmPassword &&
    (!hasPassword || formData.currentPassword.length > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          {hasPassword ? 'Change Password' : 'Set Password'}
        </CardTitle>
        <CardDescription>
          {hasPassword
            ? 'Update your password to keep your account secure'
            : provider === 'google'
            ? 'Set a password to enable email/password login in addition to Google'
            : 'Create a strong password for your account'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Current Password (only if user already has password) */}
          {hasPassword && (
            <div className="space-y-2">
              <Label htmlFor="currentPassword">
                <Lock className="inline h-4 w-4 mr-2" />
                Current Password
              </Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showPasswords.current ? 'text' : 'password'}
                  placeholder="Enter your current password"
                  value={formData.currentPassword}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      currentPassword: e.target.value,
                    }))
                  }
                  disabled={isLoading}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => toggleShowPassword('current')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPasswords.current ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* New Password */}
          <div className="space-y-2">
            <Label htmlFor="newPassword">
              <Lock className="inline h-4 w-4 mr-2" />
              New Password
            </Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showPasswords.new ? 'text' : 'password'}
                placeholder="Enter your new password"
                value={formData.newPassword}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    newPassword: e.target.value,
                  }))
                }
                disabled={isLoading}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => toggleShowPassword('new')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPasswords.new ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {formData.newPassword.length > 0 && formData.newPassword.length < 8 && (
              <p className="text-xs text-destructive">
                Password must be at least 8 characters
              </p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">
              <Lock className="inline h-4 w-4 mr-2" />
              Confirm Password
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showPasswords.confirm ? 'text' : 'password'}
                placeholder="Confirm your new password"
                value={formData.confirmPassword}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    confirmPassword: e.target.value,
                  }))
                }
                disabled={isLoading}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => toggleShowPassword('confirm')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPasswords.confirm ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {formData.confirmPassword.length > 0 &&
              formData.newPassword !== formData.confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
          </div>

          {/* Password Requirements */}
          <div className="rounded-lg bg-muted p-3">
            <p className="text-sm font-medium mb-2">Password requirements:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li className="flex items-center gap-2">
                <span
                  className={
                    formData.newPassword.length >= 8
                      ? 'text-green-500'
                      : 'text-muted-foreground'
                  }
                >
                  •
                </span>
                At least 8 characters long
              </li>
              <li className="flex items-center gap-2">
                <span
                  className={
                    formData.newPassword === formData.confirmPassword &&
                    formData.newPassword.length > 0
                      ? 'text-green-500'
                      : 'text-muted-foreground'
                  }
                >
                  •
                </span>
                Passwords must match
              </li>
            </ul>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isLoading || !isFormValid}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Shield className="mr-2 h-4 w-4" />
                {hasPassword ? 'Change Password' : 'Set Password'}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
