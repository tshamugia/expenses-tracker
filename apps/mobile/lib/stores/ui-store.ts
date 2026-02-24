import { create } from 'zustand'

interface UIState {
  isRefreshing: boolean
  setRefreshing: (value: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  isRefreshing: false,
  setRefreshing: (value) => set({ isRefreshing: value }),
}))
