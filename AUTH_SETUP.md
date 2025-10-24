# Google Authentication Setup Guide

This guide will help you set up Google OAuth authentication for ExtraTracker.

## Prerequisites

- Next.js 16 project running
- Supabase database configured
- Node.js 18+ installed

## Step 1: Generate AUTH_SECRET

The `AUTH_SECRET` is used to encrypt JWT tokens and session data.

### On Windows (PowerShell):
```powershell
# Generate a random base64 string
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

### On Mac/Linux:
```bash
openssl rand -base64 32
```

Copy the generated string - you'll need it in Step 4.

## Step 2: Set Up Google OAuth Credentials

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/

2. **Create or Select a Project**
   - Click on the project dropdown at the top
   - Create a new project or select an existing one
   - Name it something like "ExtraTracker"

3. **Enable Google+ API**
   - Go to "APIs & Services" → "Library"
   - Search for "Google+ API"
   - Click "Enable"

4. **Configure OAuth Consent Screen**
   - Go to "APIs & Services" → "OAuth consent screen"
   - Choose "External" user type
   - Fill in the required fields:
     - App name: ExtraTracker
     - User support email: your email
     - Developer contact email: your email
   - Click "Save and Continue"
   - Skip "Scopes" (click "Save and Continue")
   - Add test users (your email) if using External type
   - Click "Save and Continue"

5. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client ID"
   - Application type: "Web application"
   - Name: ExtraTracker Web Client
   - **Authorized redirect URIs** (very important!):
     - For local development: `http://localhost:3000/api/auth/callback/google`
     - For production: `https://yourdomain.com/api/auth/callback/google`
   - Click "Create"

6. **Copy Your Credentials**
   - You'll see a popup with your Client ID and Client Secret
   - **Save these securely** - you'll need them in the next step

## Step 3: Update Environment Variables

Add these variables to your `.env.local` file:

```env
# Auth.js Configuration
AUTH_SECRET=<paste-the-secret-from-step-1>
NEXTAUTH_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=<paste-your-client-id-from-step-2>
GOOGLE_CLIENT_SECRET=<paste-your-client-secret-from-step-2>
```

**Important Notes:**
- Never commit `.env.local` to Git
- For production, update `NEXTAUTH_URL` to your production domain
- Make sure there are no spaces or quotes around the values

## Step 4: Restart Your Development Server

After adding the environment variables:

```bash
# Stop the current dev server (Ctrl+C)

# Start it again
npm run dev
```

## Step 5: Test the Authentication Flow

1. **Visit the app**: http://localhost:3000
2. **Click "Login"** button in the top-right corner
3. **Click "Continue with Google"**
4. **Select your Google account**
5. **Grant permissions** to the app
6. **You should be redirected** to the dashboard at `/dashboard`

## Troubleshooting

### Error: "redirect_uri_mismatch"
- **Cause**: The redirect URI in your Google Cloud Console doesn't match the one being used
- **Solution**: Make sure you added `http://localhost:3000/api/auth/callback/google` exactly as shown in Step 2

### Error: "MissingAdapter"
- **Cause**: The database adapter is not properly configured
- **Solution**: This should be fixed now with JWT sessions. If you still see this, restart your dev server.

### Error: "Invalid environment variables"
- **Cause**: Missing or incorrect environment variables
- **Solution**: Double-check all environment variables in `.env.local` are set correctly

### Not redirecting to dashboard after login
- **Cause**: Session not being created properly
- **Solution**: Check browser console for errors and ensure your database is accessible

### "Access blocked: This app's request is invalid"
- **Cause**: OAuth consent screen not configured properly
- **Solution**: Complete Step 2.4 (Configure OAuth Consent Screen) and add your email as a test user

## How It Works

### Architecture

1. **User clicks "Continue with Google"**
   - Redirects to Google's OAuth consent screen

2. **User grants permission**
   - Google redirects back to: `/api/auth/callback/google`
   - Auth.js processes the OAuth code

3. **User data is saved**
   - Prisma Adapter creates/updates User record in database
   - Creates Account record linking user to Google provider
   - JWT token is created with user ID

4. **User is redirected**
   - Middleware checks authentication
   - User is redirected to `/dashboard`

### Session Management

- **Strategy**: JWT (JSON Web Tokens)
- **Storage**: Tokens are stored in HTTP-only cookies
- **Duration**: 30 days
- **User data**: Stored in both JWT and Supabase database

### Protected Routes

These routes require authentication (handled by middleware):
- `/dashboard`
- `/expenses`
- `/categories`
- `/payments`
- `/profile`
- `/notifications`

Unauthenticated users are redirected to `/login`.

## Files Modified/Created

1. **Auth Configuration**:
   - `auth.config.ts` - Auth.js base configuration
   - `auth.ts` - Auth.js setup with Prisma adapter
   - `middleware.ts` - Route protection

2. **UI Components**:
   - `app/login/page.tsx` - Login page
   - `components/auth/login-form.tsx` - Login form component
   - `components/layout/header.tsx` - Updated with user menu and logout

3. **Database**:
   - Updated Prisma schema with Auth.js models
   - `Account`, `Session`, `VerificationToken` models added

4. **Types**:
   - `types/next-auth.d.ts` - TypeScript definitions for session

## Security Notes

- **Never expose** `GOOGLE_CLIENT_SECRET` or `AUTH_SECRET` publicly
- **Never commit** `.env.local` to version control
- **Always use HTTPS** in production
- **Rotate secrets** periodically for production apps
- **Limit OAuth scopes** to only what you need

## Production Deployment

When deploying to production:

1. Update `NEXTAUTH_URL` to your production domain
2. Add production redirect URI to Google Cloud Console
3. Set all environment variables in your hosting platform
4. Ensure your database is accessible from production

## Additional Resources

- [Auth.js Documentation](https://authjs.dev/)
- [Google OAuth 2.0 Guide](https://developers.google.com/identity/protocols/oauth2)
- [Next.js Authentication](https://nextjs.org/docs/app/building-your-application/authentication)
