-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AllocationKind" AS ENUM ('MANDATORY', 'DEBT', 'RESERVE', 'GOAL', 'VARIABLE', 'FREE');

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "windfallDebtPct" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "windfallFreePct" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "windfallGoalsPct" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "MonthlyPlan" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "forecastIncome" DECIMAL(12,2) NOT NULL,
    "forecastStable" DECIMAL(12,2) NOT NULL,
    "forecastVariable" DECIMAL(12,2) NOT NULL,
    "actualIncome" DECIMAL(12,2),
    "safeToSpend" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GEL',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanAllocation" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "kind" "AllocationKind" NOT NULL,
    "refId" UUID,
    "label" TEXT NOT NULL,
    "planned" DECIMAL(12,2) NOT NULL,
    "actual" DECIMAL(12,2),

    CONSTRAINT "PlanAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthClose" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "completionPct" DECIMAL(5,2) NOT NULL,
    "verdict" TEXT NOT NULL,
    "netChange" DECIMAL(12,2) NOT NULL,
    "plannedNetChange" DECIMAL(12,2) NOT NULL,
    "debtPrincipalDelta" DECIMAL(12,2) NOT NULL,
    "reserveDelta" DECIMAL(12,2) NOT NULL,
    "goalsDelta" DECIMAL(12,2) NOT NULL,
    "newDebt" DECIMAL(12,2) NOT NULL,
    "withdrawals" DECIMAL(12,2) NOT NULL,
    "conclusions" JSONB NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyPlan_userId_month_key" ON "MonthlyPlan"("userId", "month");

-- CreateIndex
CREATE INDEX "PlanAllocation_planId_kind_idx" ON "PlanAllocation"("planId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "MonthClose_planId_key" ON "MonthClose"("planId");

-- AddForeignKey
ALTER TABLE "MonthlyPlan" ADD CONSTRAINT "MonthlyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanAllocation" ADD CONSTRAINT "PlanAllocation_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MonthlyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthClose" ADD CONSTRAINT "MonthClose_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MonthlyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
