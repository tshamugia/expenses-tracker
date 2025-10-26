import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Suspense } from 'react'

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-200 opacity-20 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-purple-200 opacity-20 blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-blue-100 to-purple-100 opacity-10 blur-3xl" />
      </div>

      {/* Back button */}
      <div className="absolute top-6 left-6 z-10">
        <Link href="/login">
          <Button variant="ghost" className="gap-2 hover:bg-white/50">
            <ArrowLeft className="h-4 w-4" />
            Back to Login
          </Button>
        </Link>
      </div>

      {/* Main content */}
      <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
        <Suspense fallback={<div className="w-full max-w-md h-96 bg-white rounded-lg shadow-2xl animate-pulse" />}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
