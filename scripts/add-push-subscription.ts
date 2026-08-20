/**
 * One-off, idempotent migration to add the PushSubscription table.
 *
 * We do NOT use `prisma db push` here because the live database has drift
 * (a `RefreshToken` table not present in schema.prisma) that `db push` would
 * drop. This script creates ONLY the PushSubscription table, using the exact
 * names Prisma expects, so it stays in sync with the schema.
 *
 * Run with: npm run db:add-push  (or)  dotenv -e .env.local -- tsx scripts/add-push-subscription.ts
 */

import prisma from '../lib/db/prisma'

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PushSubscription" (
      "id" UUID NOT NULL,
      "userId" UUID NOT NULL,
      "endpoint" TEXT NOT NULL,
      "p256dh" TEXT NOT NULL,
      "auth" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
    );
  `)

  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");`
  )

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");`
  )

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PushSubscription_userId_fkey'
      ) THEN
        ALTER TABLE "PushSubscription"
          ADD CONSTRAINT "PushSubscription_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `)

  console.log('✓ PushSubscription table is ready')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
