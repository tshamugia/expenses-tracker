/**
 * One-off, idempotent migration to add the `icon` column to the Expense table.
 *
 * We do NOT use `prisma db push` here because the live database has drift
 * (a `RefreshToken` table not present in schema.prisma) that `db push` would
 * drop. This script adds ONLY the `Expense.icon` column, using the exact name
 * Prisma expects, so it stays in sync with the schema.
 *
 * Run with: npm run db:add-icon  (or)  dotenv -e .env.local -- tsx scripts/add-expense-icon.ts
 */

import prisma from '../lib/db/prisma'

async function main() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "icon" TEXT;`
  )

  console.log('✓ Expense.icon column is ready')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
