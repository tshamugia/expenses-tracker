import { create } from 'zustand'

export type ExpenseStatusFilter = 'all' | 'paid' | 'pending' | 'overdue'

interface ExpenseFilterState {
  /** Selected category name, or null for "all categories". */
  category: string | null

  /** Payment status filter applied to the expense list. */
  status: ExpenseStatusFilter

  setCategory: (category: string | null) => void
  setStatus: (status: ExpenseStatusFilter) => void

  /** Reset all filters to their default values. */
  reset: () => void
}

export const useExpenseFilterStore = create<ExpenseFilterState>((set) => ({
  category: null,
  status: 'all',

  setCategory: (category) => set({ category }),
  setStatus: (status) => set({ status }),
  reset: () => set({ category: null, status: 'all' }),
}))
