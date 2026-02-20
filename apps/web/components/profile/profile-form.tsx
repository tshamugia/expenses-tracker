'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Save, User, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AvatarUpload } from './avatar-upload'
import { updateUserProfile, deleteUserAvatar } from '@/lib/actions/user-actions'
import type { UserProfile } from '@/types/user-types'

interface ProfileFormProps {
  user: UserProfile
}

export function ProfileForm({ user }: ProfileFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: user.name || '',
    email: user.email,
    image: user.image || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const result = await updateUserProfile({
        name: formData.name || null,
        email: formData.email,
        image: formData.image || null,
      })

      if (result.success) {
        toast.success('Profile updated successfully')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error('Failed to update profile')
      console.error('Profile update error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleImageChange = (imageUrl: string) => {
    setFormData((prev) => ({ ...prev, image: imageUrl }))
  }

  const handleImageDelete = async () => {
    setIsLoading(true)
    try {
      const result = await deleteUserAvatar()
      if (result.success) {
        setFormData((prev) => ({ ...prev, image: '' }))
        toast.success('Avatar deleted successfully')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error('Failed to delete avatar')
      console.error('Avatar delete error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
        <CardDescription>
          Update your profile details and avatar
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar Upload */}
          <div className="flex justify-center py-4">
            <AvatarUpload
              currentImage={formData.image}
              onImageChange={handleImageChange}
              onImageDelete={handleImageDelete}
            />
          </div>

          {/* Name Field */}
          <div className="space-y-2">
            <Label htmlFor="name">
              <User className="inline h-4 w-4 mr-2" />
              Name
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="Enter your name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              disabled={isLoading}
            />
          </div>

          {/* Email Field */}
          <div className="space-y-2">
            <Label htmlFor="email">
              <Mail className="inline h-4 w-4 mr-2" />
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, email: e.target.value }))
              }
              disabled={isLoading}
              required
            />
            <p className="text-xs text-muted-foreground">
              Used for login and notifications
            </p>
          </div>

          {/* Provider Info */}
          {user.provider && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm text-muted-foreground">
                Account type:{' '}
                <span className="font-medium text-foreground capitalize">
                  {user.provider}
                </span>
              </p>
            </div>
          )}

          {/* Submit Button */}
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
