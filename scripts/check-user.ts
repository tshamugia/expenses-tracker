import prisma from '../lib/db/prisma'

async function main() {
  const email = process.argv[2] || 'shamugiatengo@gmail.com'
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      hasSetPassword: true,
      password: true,
    },
  })
  console.log('USER:', {
    ...user,
    password: user?.password ? '(set)' : null,
  })

  const resetTokens = await prisma.passwordResetToken.findMany({
    where: { email },
    orderBy: { createdAt: 'desc' },
    take: 3,
  })
  console.log('RESET TOKENS:', resetTokens)

  const verifyTokens = await prisma.emailVerificationToken.findMany({
    where: { email },
    orderBy: { createdAt: 'desc' },
    take: 3,
  })
  console.log('VERIFY TOKENS:', verifyTokens)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
