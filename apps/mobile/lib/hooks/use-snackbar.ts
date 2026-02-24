import { create } from 'zustand'

export type SnackbarType = 'success' | 'error' | 'info'

interface SnackbarState {
  visible: boolean
  message: string
  type: SnackbarType

  /** Display a snackbar message. Defaults to 'info' type. */
  showSnackbar: (message: string, type?: SnackbarType) => void

  /** Hide the currently visible snackbar. */
  hideSnackbar: () => void
}

export const useSnackbar = create<SnackbarState>((set) => ({
  visible: false,
  message: '',
  type: 'info',

  showSnackbar: (message, type = 'info') => {
    set({ visible: true, message, type })
  },

  hideSnackbar: () => {
    set({ visible: false })
  },
}))
