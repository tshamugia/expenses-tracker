'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { verifyEmailCode, resendVerificationCode } from '@/lib/actions/email-verification-actions'

export function VerifyEmailForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)

  useEffect(() => {
    const emailParam = searchParams.get('email')
    if (emailParam) {
      setEmail(emailParam)
    }
  }, [searchParams])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const result = await verifyEmailCode(email, code)

      if (result.success) {
        toast.success('Email verified!', {
          description: 'You can now sign in with your account.',
        })
        router.push('/login')
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      console.error('Error verifying email:', error)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (!email) {
      toast.error('Enter your email address first')
      return
    }
    setIsResending(true)

    try {
      const result = await resendVerificationCode(email)

      if (result.success) {
        toast.success('Code sent!', { description: result.data.message })
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      console.error('Error resending code:', error)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsResending(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md"
    >
      <Card className="border-2 shadow-2xl">
        <CardHeader className="space-y-3 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg"
          >
            <MailCheck className="h-8 w-8" />
          </motion.div>
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Verify Your Email
          </CardTitle>
          <CardDescription className="text-base">
            {email
              ? `Enter the 6-digit code sent to ${email}`
              : 'Enter your email and the 6-digit code we sent you'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleVerify} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
                required
                disabled={!!searchParams.get('email')}
              />
            </div>

            {/* Code Field */}
            <div className="space-y-2">
              <Label htmlFor="code" className="text-sm font-medium">
                Verification Code
              </Label>
              <Input
                id="code"
                type="text"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="h-11 text-center text-2xl tracking-widest font-mono"
                maxLength={6}
                required
              />
              <p className="text-xs text-muted-foreground">
                Check your email for the 6-digit code
              </p>
            </div>

            <Button
              type="submit"
              disabled={isLoading || code.length !== 6}
              className="w-full h-11 text-base font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
            >
              {isLoading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full"
                />
              ) : (
                'Verify Email'
              )}
            </Button>
          </form>

          {/* Resend */}
          <div className="text-center text-sm text-muted-foreground">
            Didn't get the code?{' '}
            <button
              type="button"
              onClick={handleResend}
              disabled={isResending}
              className="font-medium text-primary hover:underline disabled:opacity-50"
            >
              {isResending ? 'Sending...' : 'Resend code'}
            </button>
          </div>

          {/* Back to login */}
          <div className="text-center text-sm text-muted-foreground">
            Wrong account?{' '}
            <a href="/login" className="font-medium text-primary hover:underline">
              Back to sign in
            </a>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
