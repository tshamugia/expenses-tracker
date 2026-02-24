import { create } from 'zustand'
import {
  saveTokens,
  getTokens,
  clearTokens,
  saveUser,
  getUser,
  clearUser,
  type StoredUser,
} from '../utils/secure-storage'

interface AuthState {
  user: StoredUser | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  initialize: () => Promise<void>
  login: (user: StoredUser, accessToken: string, refreshToken: string) => Promise<void>
  logout: () => Promise<void>
  updateTokens: (accessToken: string, refreshToken: string) => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: async () => {
    try {
      const [tokens, user] = await Promise.all([getTokens(), getUser()])

      if (tokens.accessToken && tokens.refreshToken && user) {
        set({
          user,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isAuthenticated: true,
          isLoading: false,
        })
      } else {
        // Partial state - clear everything
        await Promise.all([clearTokens(), clearUser()])
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        })
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error)
      set({ isLoading: false, isAuthenticated: false })
    }
  },

  login: async (user, accessToken, refreshToken) => {
    await Promise.all([saveTokens(accessToken, refreshToken), saveUser(user)])
    set({
      user,
      accessToken,
      refreshToken,
      isAuthenticated: true,
    })
  },

  logout: async () => {
    const { accessToken, refreshToken } = get()

    // Best-effort server logout - don't block on failure
    if (accessToken && refreshToken) {
      try {
        const { getApiUrl } = require('../utils/config')
        await fetch(`${getApiUrl()}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ refreshToken }),
        })
      } catch {
        // Ignore - we're logging out anyway
      }
    }

    await Promise.all([clearTokens(), clearUser()])
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    })
  },

  updateTokens: async (accessToken, refreshToken) => {
    await saveTokens(accessToken, refreshToken)
    set({ accessToken, refreshToken })
  },
}))
