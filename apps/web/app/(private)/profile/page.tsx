import { Suspense } from 'react'
import { ProfileForm } from '@/components/profile/profile-form'
import { PasswordForm } from '@/components/profile/password-form'
import { ProfileStats } from '@/components/profile/profile-stats'
import { getUserProfile, getUserStats } from '@/lib/actions/user-actions'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { User } from 'lucide-react'

export const metadata = {
  title: 'Profile | ExtraTracker',
  description: 'Manage your profile settings and preferences',
}

export const dynamic = 'force-dynamic'

async function ProfileContent() {
  const [profileResult, statsResult] = await Promise.all([
    getUserProfile(),
    getUserStats(),
  ])

  if (!profileResult.success) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{profileResult.error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!statsResult.success) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{statsResult.error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
      {/* Stats Cards */}
      <ProfileStats stats={statsResult.data} />

      {/* Forms Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile Form */}
        <ProfileForm user={profileResult.data} />

        {/* Password Form */}
        <PasswordForm
          hasPassword={profileResult.data.hasPassword}
          provider={profileResult.data.provider}
        />
      </div>
    </>
  )
}

function ProfileSkeleton() {
  return (
    <>
      {/* Stats Skeleton */}
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-8 w-24 mb-2" />
              <Skeleton className="h-4 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Forms Skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6 space-y-4">
              <Skeleton className="h-32 w-32 rounded-full mx-auto" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}

export default function ProfilePage() {
  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3 pb-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <User className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
          <p className="text-muted-foreground">
            Manage your account information and preferences
          </p>
        </div>
      </div>

      {/* Content */}
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileContent />
      </Suspense>
    </div>
  )
}
