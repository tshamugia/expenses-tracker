'use client'

/**
 * Amortization schedule table (Phase 2 §6.2).
 * Per row: # · date · payment · interest · principal · balance · status.
 * The current (next unpaid) row is highlighted and carries the "record
 * payment" action; past-due unpaid rows show an overdue status.
 * Horizontally scrollable on small screens.
 */

import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getCurrencySymbol, type Currency } from '@/lib/utils/currency-conversion'
import type { SerializedScheduleItem } from '@/types/debt-types'

interface DebtScheduleTableProps {
  schedule: SerializedScheduleItem[]
  currentSeq: number | null
  currency: string
  onRecordPayment?: (item: SerializedScheduleItem) => void
  isRecording?: boolean
  now?: Date // injectable for tests
}

type RowStatus = 'paid' | 'overdue' | 'current' | 'upcoming'

function rowStatus(
  item: SerializedScheduleItem,
  currentSeq: number | null,
  today: Date
): RowStatus {
  if (item.paid) return 'paid'
  if (new Date(item.dueDate) < today) return 'overdue'
  if (item.seq === currentSeq) return 'current'
  return 'upcoming'
}

export function DebtScheduleTable({
  schedule,
  currentSeq,
  currency,
  onRecordPayment,
  isRecording = false,
  now = new Date(),
}: DebtScheduleTableProps) {
  const t = useTranslations('DebtSchedule')
  const symbol = getCurrencySymbol(currency as Currency)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const statusLabel: Record<RowStatus, string> = {
    paid: t('statusPaid'),
    overdue: t('statusOverdue'),
    current: t('statusCurrent'),
    upcoming: t('statusUpcoming'),
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{t('seq')}</th>
            <th className="px-3 py-2 text-left font-medium">{t('dueDate')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('payment')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('interest')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('principal')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('balance')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('status')}</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((item) => {
            const status = rowStatus(item, currentSeq, today)
            return (
              <tr
                key={item.seq}
                data-status={status}
                className={cn(
                  'border-t',
                  status === 'current' && 'bg-primary/5 font-medium',
                  status === 'paid' && 'text-muted-foreground'
                )}
              >
                <td className="px-3 py-2">{item.seq}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {format(new Date(item.dueDate), 'dd MMM yyyy')}
                </td>
                <td className="px-3 py-2 text-right">
                  {item.payment.toFixed(2)}
                  {symbol}
                </td>
                <td className="px-3 py-2 text-right">{item.interestPart.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{item.principalPart.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">
                  {item.remainingPrincipal.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right">
                  {status === 'paid' ? (
                    <span className="inline-flex items-center justify-end gap-1 text-emerald-600 dark:text-emerald-400">
                      <Check className="h-4 w-4" />
                      {statusLabel.paid}
                    </span>
                  ) : status === 'current' && onRecordPayment ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      disabled={isRecording}
                      onClick={() => onRecordPayment(item)}
                      aria-label={t('recordAria', { seq: item.seq })}
                    >
                      {statusLabel.current}
                    </Button>
                  ) : (
                    <span
                      className={cn(
                        status === 'overdue' && 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {statusLabel[status]}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
