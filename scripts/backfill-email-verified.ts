/**
 * Backfill emailVerified for accounts that proved email ownership via a
 * completed password reset but predate the email-verification feature.
 *
 * These users have hasSetPassword=true and at least one USED password reset
 * token, yet emailVerified is null — which now blocks sign-in and bounces
 * them to /verify-email forever. Marking them verified unblocks sign-in.
 *
 * Pass an email to target a single user, or run with no args to backfill all
 * eligible unverified accounts.
 *
 * Run: dotenv -e .env.local -- tsx scripts/backfill-email-verified.ts [email]
 */
import prisma from '../lib/db/prisma'

async function main() {
  const targetEmail = process.argv[2]

  const users = await prisma.user.findMany({
    where: {
      emailVerified: null,
      password: { not: null },
      ...(targetEmail ? { email: targetEmail } : {}),
    },
    select: { id: true, email: true },
  })

  const verifiedNow = new Date()
  let updated = 0

  for (const user of users) {
    // Only backfill users who have actually completed a password reset,
    // which proves they control the email address.
    const usedReset = await prisma.passwordResetToken.findFirst({
      where: { email: user.email, used: true },
      select: { id: true },
    })

    if (!usedReset) {
      console.log(`- skip ${user.email} (no completed password reset)`)
      continue
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: verifiedNow },
    })
    console.log(`✓ verified ${user.email}`)
    updated++
  }

  console.log(`Done. ${updated} user(s) backfilled.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
