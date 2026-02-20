/**
 * Zustand Store for Expenses
 * CLIENT-SIDE STATE MANAGEMENT
 * - Manages local expense state for optimistic updates
 * - Syncs with server data after mutations
 * - Does NOT handle data fetching (Server Components do that)
 */

import { create } from 'zustand'
import type { ExpenseListItem } from '@extracker/types'

interface ExpenseStore {
  // State
  expenses: ExpenseListItem[]
  isLoading: boolean
  selectedExpense: ExpenseListItem | null

  // Actions
  setExpenses: (expenses: ExpenseListItem[]) => void
  addExpense: (expense: ExpenseListItem) => void
  updateExpense: (id: string, updates: Partial<ExpenseListItem>) => void
  removeExpense: (id: string) => void
  setSelectedExpense: (expense: ExpenseListItem | null) => void
  setLoading: (loading: boolean) => void

  // Optimistic updates
  optimisticAdd: (expense: ExpenseListItem) => void
  optimisticUpdate: (id: string, updates: Partial<ExpenseListItem>) => void
  optimisticRemove: (id: string) => void
  optimisticMarkPaid: (id: string) => void
}

export const useExpenseStore = create<ExpenseStore>((set) => ({
  // Initial state
  expenses: [],
  isLoading: false,
  selectedExpense: null,

  // Set all expenses (from server)
  setExpenses: (expenses) => set({ expenses }),

  // Add expense
  addExpense: (expense) =>
    set((state) => ({
      expenses: [expense, ...state.expenses],
    })),

  // Update expense
  updateExpense: (id, updates) =>
    set((state) => ({
      expenses: state.expenses.map((expense) =>
        expense.id === id ? { ...expense, ...updates } : expense
      ),
    })),

  // Remove expense
  removeExpense: (id) =>
    set((state) => ({
      expenses: state.expenses.filter((expense) => expense.id !== id),
    })),

  // Set selected expense
  setSelectedExpense: (expense) => set({ selectedExpense: expense }),

  // Set loading state
  setLoading: (loading) => set({ isLoading: loading }),

  // Optimistic add (instant UI feedback before server confirms)
  optimisticAdd: (expense) =>
    set((state) => ({
      expenses: [expense, ...state.expenses],
    })),

  // Optimistic update
  optimisticUpdate: (id, updates) =>
    set((state) => ({
      expenses: state.expenses.map((expense) =>
        expense.id === id ? { ...expense, ...updates } : expense
      ),
    })),

  // Optimistic remove
  optimisticRemove: (id) =>
    set((state) => ({
      expenses: state.expenses.filter((expense) => expense.id !== id),
    })),

  // Optimistic mark as paid
  optimisticMarkPaid: (id) =>
    set((state) => ({
      expenses: state.expenses.map((expense) =>
        expense.id === id ? { ...expense, isPaid: true } : expense
      ),
    })),
}))
