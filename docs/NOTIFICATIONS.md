# Payment Notification System

This document explains how the payment reminder email notification system works in ExtraTracker.

## Overview

The notification system automatically sends email reminders to users about upcoming payments based on their notification preferences. Users receive reminders when payments are due within their configured notification window (default: 3 days before due date).

## Features

- **Email Notifications**: Beautiful HTML emails with payment details sent via Resend
- **In-App Notifications**: Notifications are also created in the database for in-app viewing
- **User Preferences**: Users can enable/disable email notifications and set notification timing
- **Smart Scheduling**: Respects payment snooze settings and user preferences
- **Manual Testing**: Test endpoint for development and debugging

## How It Works

### 1. User Settings

Users configure their notification preferences in Settings:
- **Email Enabled**: Toggle email notifications on/off
- **Notify Before Days**: Number of days before due date to send reminder (default: 3)

Settings are stored in the `NotificationPreference` model.

### 2. Notification Service

The notification service ([lib/services/notification-service.ts](../lib/services/notification-service.ts)) checks for upcoming payments and sends emails:

- Queries all users with `emailEnabled: true`
- For each user, finds unpaid payments within their notification window
- Sends email via Resend with payment details
- Creates in-app notification record
- Skips snoozed payments

### 3. Email Template

Beautiful, responsive HTML emails ([lib/services/email.ts](../lib/services/email.ts)) include:
- Payment title, amount, and due date
- Color-coded urgency (red for today/tomorrow, orange for 2-3 days, blue for 4+ days)
- Direct link to expenses dashboard
- Professional branding with ExtraTracker logo colors

### 4. Scheduled Execution

The system provides two execution methods:

#### A. Cron Endpoint (Production)

**Endpoint**: `GET /api/cron/send-notifications`

This endpoint should be called by a cron service:
- **Vercel Cron**: Add to `vercel.json`
- **GitHub Actions**: Schedule with workflow
- **External Services**: cron-job.org, EasyCron, etc.

**Security**: Requires `CRON_SECRET` environment variable in production:
```bash
Authorization: Bearer YOUR_CRON_SECRET
```

**Recommended Schedule**: Daily at 9:00 AM
```
0 9 * * * # Every day at 9:00 AM UTC
```

#### B. Manual Test Endpoint (Development)

**Endpoint**: `GET /api/test-notifications`

Tests notifications for the currently logged-in user. Useful for:
- Development and debugging
- Testing email templates
- Verifying notification logic

No authentication header needed - uses session.

## Setup Instructions

### 1. Configure Resend

1. Sign up at [resend.com](https://resend.com)
2. Get your API key
3. Add to `.env.local`:
   ```bash
   RESEND_API_KEY=re_your_api_key_here
   ```

**For Testing**: You can use the test domain `onboarding@resend.dev` (already configured). No domain verification required.

**For Production**: Verify your domain and update the `from` address in [lib/services/email.ts](../lib/services/email.ts).

### 2. Enable Notifications

Users must enable email notifications in Settings:
1. Go to `/settings`
2. Toggle "Email Notifications" ON
3. Set "Notify Before Days" (default: 3 days)

### 3. Set Up Cron Job (Production)

#### Option A: Vercel Cron

Create `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/send-notifications",
      "schedule": "0 9 * * *"
    }
  ]
}
```

Set environment variable in Vercel dashboard:
```
CRON_SECRET=your-secret-here
```

#### Option B: GitHub Actions

Create `.github/workflows/cron-notifications.yml`:
```yaml
name: Send Payment Notifications
on:
  schedule:
    - cron: '0 9 * * *' # Daily at 9 AM UTC

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger notification endpoint
        run: |
          curl -X POST https://your-domain.com/api/cron/send-notifications \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

Add `CRON_SECRET` to GitHub Secrets.

#### Option C: External Cron Service

Use a service like [cron-job.org](https://cron-job.org):
1. Create account
2. Add new cron job
3. URL: `https://your-domain.com/api/cron/send-notifications`
4. Schedule: `0 9 * * *`
5. Add header: `Authorization: Bearer YOUR_CRON_SECRET`

## Testing

### Test Current User Notifications

1. Ensure you're logged in
2. Create an expense with a payment due in 1-3 days
3. Enable email notifications in Settings
4. Visit: `http://localhost:3000/api/test-notifications`
5. Check console for development email output (or your inbox if RESEND_API_KEY is set)

### Test Cron Endpoint Locally

```bash
# Without authentication (development)
curl http://localhost:3000/api/cron/send-notifications

# With authentication (production simulation)
curl http://localhost:3000/api/cron/send-notifications \
  -H "Authorization: Bearer your-cron-secret"
```

## Development Mode

When `RESEND_API_KEY` is not set, emails are logged to console instead:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 PAYMENT REMINDER EMAIL (Development Mode)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: user@example.com
Name: John Doe
Expense: Netflix Subscription
Amount: 15.99 USD
Due Date: 10/28/2025
Days Until Due: 2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Email Template Features

- **Responsive Design**: Works on desktop and mobile
- **Color-Coded Urgency**:
  - Red: Due today or tomorrow
  - Orange: Due in 2-3 days
  - Blue: Due in 4+ days
- **Professional Layout**: Gradient header, card-based design
- **Clear CTA**: "View in Dashboard" button
- **Branding**: ExtraTracker colors and logo

## Database Models

### NotificationPreference
```prisma
model NotificationPreference {
  emailEnabled     Boolean  @default(true)
  notifyBeforeDays Int      @default(3)
  // ...
}
```

### Notification
```prisma
model Notification {
  title     String
  message   String
  type      String   @default("payment")
  actionUrl String?
  metadata  String?  // JSON with payment details
  // ...
}
```

## API Response Format

### Success Response
```json
{
  "success": true,
  "sentCount": 5,
  "errorCount": 0,
  "errors": [],
  "duration": 1234,
  "timestamp": "2025-10-26T09:00:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "sentCount": 2,
  "errorCount": 1,
  "errors": ["Failed to send email to user@example.com"],
  "timestamp": "2025-10-26T09:00:00.000Z"
}
```

## Troubleshooting

### Emails Not Sending

1. **Check RESEND_API_KEY**: Ensure it's set correctly
2. **Check User Settings**: Verify `emailEnabled: true`
3. **Check Payment Window**: Ensure payments are within notification window
4. **Check Snooze Status**: Snoozed payments are skipped
5. **Check Console Logs**: Look for error messages

### Cron Job Not Running

1. **Check CRON_SECRET**: Ensure it matches in both places
2. **Check Schedule**: Verify cron expression is correct
3. **Check Logs**: Check platform-specific logs (Vercel, GitHub Actions, etc.)

### Testing Issues

1. **No Payments Found**: Create test payment due in 1-3 days
2. **Unauthorized**: Ensure you're logged in for test endpoint
3. **Email Not Received**: Check spam folder, verify email address

## Future Enhancements

- [ ] SMS notifications (Twilio integration)
- [ ] Push notifications (web push)
- [ ] Multiple notification schedules per user
- [ ] Notification digest (daily/weekly summary)
- [ ] Custom email templates per user
- [ ] Timezone support for scheduling
- [ ] Notification history and analytics

## Related Files

- [lib/services/email.ts](../lib/services/email.ts) - Email sending logic
- [lib/services/notification-service.ts](../lib/services/notification-service.ts) - Notification business logic
- [lib/actions/settings-actions.ts](../lib/actions/settings-actions.ts) - Settings management
- [app/api/cron/send-notifications/route.ts](../app/api/cron/send-notifications/route.ts) - Cron endpoint
- [app/api/test-notifications/route.ts](../app/api/test-notifications/route.ts) - Test endpoint
- [prisma/schema.prisma](../prisma/schema.prisma) - Database schema
