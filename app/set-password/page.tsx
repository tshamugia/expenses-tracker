import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { SetPasswordForm } from '@/components/auth/set-password-form'

export default async function SetPasswordPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  // Check if user already has a password set
  // We'll check this via the hasSetPassword field in the database
  // If they already have a password, redirect to dashboard
  const prisma = (await import('@/lib/db/prisma')).default
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { hasSetPassword: true },
  })

  if (user?.hasSetPassword) {
    redirect('/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <SetPasswordForm userId={session.user.id} />
    </div>
  )
}
