/**
 * Zustand Store for Transactions (Phase 1 — variable expenses ledger)
 * CLIENT-SIDE STATE MANAGEMENT
 * - Manages local transaction list for optimistic quick-add / delete
 * - Syncs with server data after mutations
 * - Does NOT handle data fetching (Server Components do that)
 */

import { create } from 'zustand'
import type { TransactionListItem } from '@/types/transaction-types'

interface TransactionStore {
  transactions: TransactionListItem[]

  setTransactions: (transactions: TransactionListItem[]) => void
  appendTransactions: (transactions: TransactionListItem[]) => void

  // Optimistic updates
  optimisticAdd: (transaction: TransactionListItem) => void
  optimisticRemove: (id: string) => void
  optimisticReplace: (tempId: string, transaction: TransactionListItem) => void
}

export const useTransactionStore = create<TransactionStore>((set) => ({
  transactions: [],

  setTransactions: (transactions) => set({ transactions }),

  appendTransactions: (transactions) =>
    set((state) => ({ transactions: [...state.transactions, ...transactions] })),

  optimisticAdd: (transaction) =>
    set((state) => ({ transactions: [transaction, ...state.transactions] })),

  optimisticRemove: (id) =>
    set((state) => ({
      transactions: state.transactions.filter((t) => t.id !== id),
    })),

  optimisticReplace: (tempId, transaction) =>
    set((state) => ({
      transactions: state.transactions.map((t) =>
        t.id === tempId ? transaction : t
      ),
    })),
}))
