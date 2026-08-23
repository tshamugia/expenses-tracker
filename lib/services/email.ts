import { Resend } from 'resend'

// Lazy-loaded Resend client - only initialized when accessed (not during build)
let resendInstance: Resend | null = null

function getResendClient(): Resend {
  if (!resendInstance) {
    const apiKey = process.env.RESEND_API_KEY

    if (!apiKey) {
      // Return a dummy client for development mode without API key
      // Functions will handle the missing key gracefully with console logs
      resendInstance = new Resend('re_dummy_key_for_development')
    } else {
      resendInstance = new Resend(apiKey)
    }
  }

  return resendInstance
}

// Export for backward compatibility (lazy initialization)
const resend = new Proxy({} as Resend, {
  get(_target, prop) {
    return getResendClient()[prop as keyof Resend]
  }
})

export interface SendPasswordResetEmailParams {
  email: string
  code: string
  userName?: string
}

export interface SendVerificationEmailParams {
  email: string
  code: string
  userName?: string
}

export interface SendPaymentReminderEmailParams {
  email: string
  userName?: string
  expenseTitle: string
  amount: number
  currency: string
  dueDate: Date
  daysUntilDue: number
}

/**
 * Send password reset email with 6-digit code
 */
export async function sendPasswordResetEmail({
  email,
  code,
  userName,
}: SendPasswordResetEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    // If no API key configured, log to console (development fallback)
    if (!process.env.RESEND_API_KEY) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('📧 PASSWORD RESET EMAIL (Development Mode)')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(`To: ${email}`)
      console.log(`Name: ${userName || 'User'}`)
      console.log(`Reset Code: ${code}`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

      return { success: true }
    }

    const { error } = await resend.emails.send({
      from: 'ExtraTracker <onboarding@resend.dev>',
      to: [email],
      subject: 'Reset Your Password - ExtraTracker',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Your Password</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Reset Your Password</h1>
                      </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px;">
                        <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 24px;">
                          Hi ${userName || 'there'},
                        </p>
                        <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 24px;">
                          We received a request to reset your password for your ExtraTracker account. Use the code below to reset your password:
                        </p>

                        <!-- Reset Code -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                          <tr>
                            <td align="center" style="background-color: #f9fafb; border: 2px dashed #d1d5db; border-radius: 8px; padding: 30px;">
                              <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #667eea; font-family: 'Courier New', monospace;">
                                ${code}
                              </div>
                            </td>
                          </tr>
                        </table>

                        <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 24px;">
                          This code will expire in <strong>15 minutes</strong>.
                        </p>

                        <p style="margin: 0 0 20px; color: #6b7280; font-size: 14px; line-height: 20px;">
                          If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
                        </p>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                        <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 20px;">
                          © ${new Date().getFullYear()} ExtraTracker. All rights reserved.
                        </p>
                        <p style="margin: 10px 0 0; color: #9ca3af; font-size: 12px; line-height: 18px;">
                          This is an automated message, please do not reply.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    })

    if (error) {
      console.error('Error sending password reset email:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Error sending password reset email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    }
  }
}

/**
 * Send email verification email with 6-digit code
 */
export async function sendVerificationEmail({
  email,
  code,
  userName,
}: SendVerificationEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    // If no API key configured, log to console (development fallback)
    if (!process.env.RESEND_API_KEY) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('📧 EMAIL VERIFICATION (Development Mode)')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(`To: ${email}`)
      console.log(`Name: ${userName || 'User'}`)
      console.log(`Verification Code: ${code}`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

      return { success: true }
    }

    const { error } = await resend.emails.send({
      from: 'ExtraTracker <onboarding@resend.dev>',
      to: [email],
      subject: 'Verify Your Email - ExtraTracker',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verify Your Email</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Verify Your Email</h1>
                      </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px;">
                        <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 24px;">
                          Hi ${userName || 'there'},
                        </p>
                        <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 24px;">
                          Welcome to ExtraTracker! Please confirm your email address using the code below to activate your account:
                        </p>

                        <!-- Verification Code -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                          <tr>
                            <td align="center" style="background-color: #f9fafb; border: 2px dashed #d1d5db; border-radius: 8px; padding: 30px;">
                              <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #667eea; font-family: 'Courier New', monospace;">
                                ${code}
                              </div>
                            </td>
                          </tr>
                        </table>

                        <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 24px;">
                          This code will expire in <strong>15 minutes</strong>.
                        </p>

                        <p style="margin: 0 0 20px; color: #6b7280; font-size: 14px; line-height: 20px;">
                          If you didn't create an ExtraTracker account, you can safely ignore this email.
                        </p>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                        <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 20px;">
                          © ${new Date().getFullYear()} ExtraTracker. All rights reserved.
                        </p>
                        <p style="margin: 10px 0 0; color: #9ca3af; font-size: 12px; line-height: 18px;">
                          This is an automated message, please do not reply.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    })

    if (error) {
      console.error('Error sending verification email:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Error sending verification email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    }
  }
}

/**
 * Send payment reminder email
 */
export async function sendPaymentReminderEmail({
  email,
  userName,
  expenseTitle,
  amount,
  currency,
  dueDate,
  daysUntilDue,
}: SendPaymentReminderEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    // If no API key configured, log to console (development fallback)
    if (!process.env.RESEND_API_KEY) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('📧 PAYMENT REMINDER EMAIL (Development Mode)')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(`To: ${email}`)
      console.log(`Name: ${userName || 'User'}`)
      console.log(`Expense: ${expenseTitle}`)
      console.log(`Amount: ${amount} ${currency}`)
      console.log(`Due Date: ${dueDate.toLocaleDateString()}`)
      console.log(`Days Until Due: ${daysUntilDue}`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

      return { success: true }
    }

    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount)

    const formattedDate = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(dueDate)

    const urgencyColor = daysUntilDue <= 1 ? '#dc2626' : daysUntilDue <= 3 ? '#f59e0b' : '#3b82f6'
    const urgencyText = daysUntilDue === 0 ? 'Due Today!' : daysUntilDue === 1 ? 'Due Tomorrow!' : `Due in ${daysUntilDue} days`

    const { error } = await resend.emails.send({
      from: 'ExtraTracker <onboarding@resend.dev>',
      to: [email],
      subject: `Payment Reminder: ${expenseTitle} - ${urgencyText}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment Reminder</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, ${urgencyColor} 0%, ${urgencyColor}dd 100%); border-radius: 8px 8px 0 0;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">💳 Payment Reminder</h1>
                      </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px;">
                        <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 24px;">
                          Hi ${userName || 'there'},
                        </p>
                        <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 24px;">
                          This is a friendly reminder about your upcoming payment:
                        </p>

                        <!-- Payment Details Card -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0; background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                          <tr>
                            <td style="padding: 24px;">
                              <!-- Expense Title -->
                              <div style="margin-bottom: 20px;">
                                <div style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
                                  EXPENSE
                                </div>
                                <div style="color: #111827; font-size: 20px; font-weight: 700;">
                                  ${expenseTitle}
                                </div>
                              </div>

                              <!-- Amount -->
                              <div style="margin-bottom: 20px;">
                                <div style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
                                  AMOUNT
                                </div>
                                <div style="color: #111827; font-size: 32px; font-weight: 700;">
                                  ${formattedAmount}
                                </div>
                              </div>

                              <!-- Due Date -->
                              <div style="margin-bottom: 20px;">
                                <div style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
                                  DUE DATE
                                </div>
                                <div style="color: #111827; font-size: 16px; font-weight: 600;">
                                  ${formattedDate}
                                </div>
                              </div>

                              <!-- Urgency Badge -->
                              <div style="display: inline-block; background-color: ${urgencyColor}; color: #ffffff; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600;">
                                ${urgencyText}
                              </div>
                            </td>
                          </tr>
                        </table>

                        <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 24px;">
                          Don't forget to mark this payment as complete in your ExtraTracker dashboard once you've made the payment.
                        </p>

                        <!-- CTA Button -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                          <tr>
                            <td align="center">
                              <a href="${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/expenses" style="display: inline-block; background-color: ${urgencyColor}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
                                View in Dashboard
                              </a>
                            </td>
                          </tr>
                        </table>

                        <p style="margin: 0 0 20px; color: #6b7280; font-size: 14px; line-height: 20px;">
                          You're receiving this email because you have email notifications enabled in your ExtraTracker settings. You can adjust your notification preferences anytime.
                        </p>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                        <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 20px;">
                          © ${new Date().getFullYear()} ExtraTracker. All rights reserved.
                        </p>
                        <p style="margin: 10px 0 0; color: #9ca3af; font-size: 12px; line-height: 18px;">
                          This is an automated reminder. Please do not reply to this email.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    })

    if (error) {
      console.error('Error sending payment reminder email:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Error sending payment reminder email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    }
  }
}
