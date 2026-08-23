-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('ACTIVE', 'PAID_OFF', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Debt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "principal" DECIMAL(12,2) NOT NULL,
    "annualRatePct" DECIMAL(6,3) NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "monthlyPayment" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GEL',
    "firstPaymentDate" TIMESTAMP(3) NOT NULL,
    "status" "DebtStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtScheduleItem" (
    "id" UUID NOT NULL,
    "debtId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "payment" DECIMAL(12,2) NOT NULL,
    "interestPart" DECIMAL(12,2) NOT NULL,
    "principalPart" DECIMAL(12,2) NOT NULL,
    "remainingPrincipal" DECIMAL(12,2) NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(12,2),
    "transactionId" UUID,

    CONSTRAINT "DebtScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Debt_userId_status_idx" ON "Debt"("userId", "status");

-- CreateIndex
CREATE INDEX "DebtScheduleItem_debtId_paid_dueDate_idx" ON "DebtScheduleItem"("debtId", "paid", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "DebtScheduleItem_debtId_seq_key" ON "DebtScheduleItem"("debtId", "seq");

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtScheduleItem" ADD CONSTRAINT "DebtScheduleItem_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
