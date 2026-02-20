import { PrismaClient } from '@prisma/client'

declare global {
  // allow global var in dev to prevent multiple instances during HMR
  var prisma: PrismaClient | undefined
}

const prisma = global.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') global.prisma = prisma

export default prisma
