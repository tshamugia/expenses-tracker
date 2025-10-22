# Prisma + Supabase Setup Summary

## ✅ Issue Resolved: Tables Created in Correct Project

**Problem:** Tables were initially created in wrong Supabase project (Vector DB instead of Expense Tracker)
**Cause:** Supabase MCP server session was connected to different project
**Solution:** 
- Reconnected MCP server to correct project (`doxoldhuxlnjxqdgfmqk`)
- Dropped tables from wrong project
- Recreated tables in Expense Tracker project
- Updated all scripts to use `.env.local` instead of `.env`

## Current Database Connection

**Project:** Expense Tracker  
**Project Ref:** `doxoldhuxlnjxqdgfmqk`  
**URL:** `https://doxoldhuxlnjxqdgfmqk.supabase.co`  
**Connection Method:** Supabase Client SDK (working) + Prisma (schema defined, client generated)

## Database Models Created

### User
- `id`: UUID (primary key)
- `email`: Text (unique)
- `name`: Text (optional)
- `image`: Text (optional)
- `createdAt`, `updatedAt`: Timestamps

### Expense
- `id`: UUID (primary key)
- `userId`: UUID (foreign key → User)
- `title`: Text
- `amount`: Decimal(12,2)
- `currency`: Text (default: 'USD')
- `description`: Text (optional)
- `category`: Text (optional)
- `isRecurring`: Boolean (default: false)
- `recurrenceRule`: Text (optional) - RRULE format
- `startDate`, `nextDueDate`: Timestamps (optional)
- `createdAt`, `updatedAt`: Timestamps

### Payment
- `id`: UUID (primary key)
- `expenseId`: UUID (foreign key → Expense)
- `dueDate`: Timestamp
- `amount`: Decimal(12,2)
- `paid`: Boolean (default: false)
- `paidAt`: Timestamp (optional)
- `snoozedUntil`: Timestamp (optional)
- `createdAt`, `updatedAt`: Timestamps

### NotificationPreference
- `id`: UUID (primary key)
- `userId`: UUID (unique, foreign key → User)
- `emailEnabled`: Boolean (default: true)
- `smsEnabled`: Boolean (default: false)
- `pushEnabled`: Boolean (default: false)
- `notifyBeforeDays`: Integer (default: 3)

## Implementation Notes

1. **Migration via Supabase MCP**: Used `mcp_supabase_apply_migration` tool to apply schema to correct Expense Tracker project
2. **Environment Variables**: Using `.env.local` exclusively (`.env` file removed)
3. **Prisma Client**: Generated successfully with `directUrl` support, singleton pattern in `lib/db/prisma.ts`
4. **Connection Verified**: Working via Supabase Client SDK
5. **Seeding**: Demo data created in correct project
   - User: `demo@extracker.local` (UUID: `2e1562f2-dedb-400a-9bc0-a1b647e26e32`)
   - Expense: "Netflix Subscription" ($15.99 USD, recurring)
6. **Indexes**: Created on foreign keys and frequently queried fields (userId, expenseId, dueDate)

## Configuration Files

### `.env.local` (Active)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://doxoldhuxlnjxqdgfmqk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
DATABASE_URL=postgresql://postgres:password@db.doxoldhuxlnjxqdgfmqk.supabase.co:5432/postgres?pgbouncer=true&sslmode=require
DIRECT_URL=postgresql://postgres:password@db.doxoldhuxlnjxqdgfmqk.supabase.co:5432/postgres?sslmode=require
```

### `.vscode/mcp.json`
```json
{
  "servers": {
    "supabase": {
      "args": ["--project-ref=doxoldhuxlnjxqdgfmqk"]
    }
  }
}
```

## Files Created

- `prisma/schema.prisma` - Prisma schema definition with directUrl support
- `prisma/migrations/20241023000000_init_schema/migration.sql` - Initial migration SQL
- `prisma/migrations/migration_lock.toml` - Prisma lock file
- `lib/db/prisma.ts` - Prisma client singleton
- `lib/db/supabase.ts` - Supabase client utility (working connection)
- `prisma/seed.ts` - Seed script (TypeScript)
- `scripts/test-prisma.ts` - Prisma connection test script
- `scripts/verify-db-connection.ts` - Supabase connection verification (working)
- `.env.local` - Environment variables (active)
- ~~`.env`~~ - Removed (using .env.local only)

## NPM Scripts Updated

```json
{
  "prisma:generate": "dotenv -e .env.local -- prisma generate",
  "prisma:push": "dotenv -e .env.local -- prisma db push",
  "prisma:studio": "dotenv -e .env.local -- prisma studio",
  "prisma:seed": "dotenv -e .env.local -- tsx prisma/seed.ts"
}
```

**Note:** All Prisma commands now use `dotenv-cli` to load `.env.local`

## Verified ✅

✅ All 4 tables created in **correct Expense Tracker project** (`doxoldhuxlnjxqdgfmqk`)  
✅ Prisma Client generated successfully with directUrl support  
✅ Demo user and expense seeded in correct project  
✅ Database queries work via Supabase Client SDK  
✅ Connection verified with `scripts/verify-db-connection.ts`  
✅ Using `.env.local` exclusively (no `.env` file)  
✅ NPM scripts updated to use `dotenv-cli`  

## Connection Status

| Method | Status | Notes |
|--------|--------|-------|
| Supabase Client SDK | ✅ Working | Recommended for queries |
| Supabase MCP Server | ✅ Working | Connected to correct project |
| Prisma Direct | ⚠️ Network Issue | Schema defined, client generated, but direct connection blocked |

**Recommendation:** Use Supabase Client SDK for now. Prisma client is ready but may have network connectivity issues from this environment.

## Next Steps

Ready to proceed with PHASE-2: Authentication and Server Actions implementation.
