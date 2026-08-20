/**
 * One-off, idempotent migration to add the EmailVerificationToken table.
 *
 * We do NOT use `prisma db push` here because the live database has drift
 * (a `RefreshToken` table not present in schema.prisma) that `db push` would
 * drop. This script creates ONLY the EmailVerificationToken table, using the
 * exact names Prisma expects, so it stays in sync with the schema.
 *
 * Run with: npm run db:add-verification
 *   (or)    dotenv -e .env.local -- tsx scripts/add-email-verification.ts
 */

import prisma from '../lib/db/prisma'

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
      "id" UUID NOT NULL,
      "email" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "expires" TIMESTAMP(3) NOT NULL,
      "used" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
    );
  `)

  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerificationToken_token_key" ON "EmailVerificationToken"("token");`
  )

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "EmailVerificationToken_email_idx" ON "EmailVerificationToken"("email");`
  )

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "EmailVerificationToken_token_idx" ON "EmailVerificationToken"("token");`
  )

  console.log('✓ EmailVerificationToken table is ready')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
