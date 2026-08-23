# ExtraTracker 💰

> **Smart Expense Tracking with Automated Payment Reminders**

A modern expense tracking application built with Next.js 16 that helps you manage expenses, track payments, and never miss a due date with intelligent notifications.

![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-16.0.0-black)
![React](https://img.shields.io/badge/React-19-blue)
![License](https://img.shields.io/badge/license-MIT-green.svg)

---

## ✨ Features

### 🔐 Authentication
- Multi-provider authentication (Google OAuth & Email/Password)
- Secure password reset via email verification codes
- Session management with Auth.js 5

### 💳 Expense Management
- Create, edit, delete, and track expenses
- Multi-currency support (GEL, USD, EUR)
- Link expenses to payment cards
- Recurring expenses support
- Visual dashboard with charts and statistics
- Custom categories with color coding

### 📱 Smart Notifications
- 3-day advance payment reminders
- Overdue payment alerts
- Dual delivery: Email + In-app notifications
- Customizable notification preferences

### 💼 Payment Cards
- Secure card management (stores last 4 digits only)
- Card brand detection (Visa, Mastercard, Amex, Discover)
- Custom nicknames and colors

### 🎨 User Experience
- Beautiful UI with Shadcn/UI components
- Dark mode support
- Fully responsive design
- Smooth animations
- Instant feedback with optimistic updates

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18.x or higher
- npm/pnpm/yarn/bun
- Supabase account (database)
- Google Cloud Console account (OAuth)
- Resend account (optional - for emails)

### Installation

**1. Clone and install dependencies**

```bash
git clone https://github.com/yourusername/extracker.git
cd extracker
npm install
```

**2. Set up environment variables**

```bash
cp .env.example .env.local
```

Fill in your `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
DATABASE_URL=your-database-url
DIRECT_URL=your-direct-url

# Auth.js (Generate: openssl rand -base64 32)
AUTH_SECRET=your-secret-key
NEXTAUTH_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# Email (Optional - logs to console if not set)
RESEND_API_KEY=your-resend-key

# Cron Job (Production only)
CRON_SECRET=your-cron-secret
```

**3. Set up Supabase**

1. Create project at [supabase.com](https://supabase.com)
2. Get connection strings from Settings → Database
3. Add to `.env.local`

**4. Set up Google OAuth**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select project → Enable Google+ API
3. Create OAuth 2.0 Client ID
4. Add redirect URI: `http://localhost:3000/api/auth/callback/google`
5. Copy credentials to `.env.local`

**5. Initialize database**

```bash
npm run prisma:generate
npm run prisma:push
npm run prisma:seed  # Optional: demo data
```

**6. Run the app**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🛠️ Available Scripts

```bash
npm run dev              # Start development server
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint

# Database
npm run prisma:generate  # Generate Prisma Client
npm run prisma:push      # Push schema to database
npm run prisma:studio    # Open database GUI
npm run prisma:seed      # Seed demo data
```

---

## 🔒 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key |
| `DATABASE_URL` | ✅ | PostgreSQL connection URL (pooling) |
| `DIRECT_URL` | ✅ | PostgreSQL direct connection URL |
| `AUTH_SECRET` | ✅ | Auth.js secret (generate with openssl) |
| `NEXTAUTH_URL` | ✅ | App URL (http://localhost:3000) |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth client secret |
| `RESEND_API_KEY` | ❌ | Email service key (logs to console if not set) |
| `CRON_SECRET` | ❌ | Cron job auth token (production only) |

---

## 🚀 Deployment

### Docker (Production-Ready)

**Quick Start:**

```bash
# 1. Set up environment variables
cp .env.example .env.local

# 2. Build and run with Docker Compose
docker-compose up -d

# 3. Access at http://localhost:3000
```

**Features:**
- Multi-stage optimized build (~200MB image)
- Non-root user for security
- Built-in health checks
- Hot reload for development

See [DOCKER.md](DOCKER.md) for complete Docker deployment guide.

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables
4. Deploy

### Other Platforms

ExtraTracker works on any platform supporting Next.js:
- Netlify
- Railway
- AWS Amplify
- DigitalOcean
- Google Cloud Run
- AWS ECS

**Important:**
- Set all environment variables
- Run `npm run prisma:push` for database
- Update `NEXTAUTH_URL` to production URL
- Update Google OAuth redirect URIs

### Scheduled Notifications

Set up a daily cron job to call:
```
GET/POST /api/cron/send-notifications
```

**Schedule:** `0 9 * * *` (9:00 AM daily)
**Auth:** Add `Authorization: Bearer YOUR_CRON_SECRET` header in production

Options: Vercel Cron, GitHub Actions, cron-job.org, or any cron service.

---

## 🏗️ Tech Stack

- **Framework:** Next.js 16 (App Router, React 19)
- **Database:** Supabase PostgreSQL + Prisma ORM
- **Auth:** Auth.js 5 (Google OAuth + Credentials)
- **UI:** Tailwind CSS + Shadcn/UI + Framer Motion
- **Email:** Resend
- **State:** Zustand (client) + Server Actions (server)

For detailed architecture, see [CLAUDE.md](CLAUDE.md)

---

## 📚 Documentation

- **[CLAUDE.md](CLAUDE.md)** - Complete technical documentation, architecture, patterns, and conventions
- **[DOCKER.md](DOCKER.md)** - Docker deployment guide with best practices
- **[.env.example](.env.example)** - Environment variables template
- **[prisma/schema.prisma](prisma/schema.prisma)** - Database schema

---

## 🎯 Roadmap

### Finance Stability PRD (docs/PRD-finance-stability-v2.md)
- [x] **Phase 0** — Migration workflow + PR checks CI + Vitest bootstrap
- [x] **Phase 1** — Income & variable expenses: unified `Transaction` ledger, income sources with conservative next-month forecast (R2), `/income` page, global quick-add expense, category soft limits with 80%/100% warnings
- [ ] **Phase 2** — Debts
- [ ] **Phase 3** — Goals
- [ ] **Phase 4** — Monthly plan
- [ ] **Phase 5** — Claude/MCP
- [ ] **Phase 6** — Bank integration

### v0.1.0
- [ ] Form validation with Zod
- [ ] Advanced filtering and search
- [ ] Budget tracking
- [ ] Export to CSV/PDF

### v0.2.0
- [ ] Receipt upload with OCR
- [ ] Advanced recurring schedules
- [ ] Multi-language support
- [ ] Advanced analytics

### v1.0.0
- [ ] SMS & push notifications
- [ ] Real-time sync
- [ ] Shared expenses (teams)
- [ ] Mobile app
- [ ] Two-factor authentication

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

**Guidelines:**
- Follow conventions in [CLAUDE.md](CLAUDE.md)
- Test thoroughly
- Ensure `npm run build` passes

---

## 🐛 Issues & Support

- **Bug Reports:** [GitHub Issues](https://github.com/yourusername/extracker/issues)
- **Questions:** [Discussions](https://github.com/yourusername/extracker/discussions)
- **Email:** support@extracker.com

---

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

**Your Name**
- GitHub: [@yourusername](https://github.com/yourusername)
- Email: your.email@example.com

---

## 🙏 Acknowledgments

Built with amazing open-source tools:
- [Next.js](https://nextjs.org/) - React Framework
- [Shadcn/UI](https://ui.shadcn.com/) - Component Library
- [Auth.js](https://authjs.dev/) - Authentication
- [Prisma](https://www.prisma.io/) - Database ORM
- [Supabase](https://supabase.com/) - PostgreSQL Database
- [Resend](https://resend.com/) - Email Service

---

<div align="center">

**Made with ❤️ using Next.js 16**

[⬆ Back to Top](#extracker-)

</div>
