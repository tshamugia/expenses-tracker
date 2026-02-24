import * as SecureStore from 'expo-secure-store'

const KEYS = {
  ACCESS_TOKEN: 'extracker_access_token',
  REFRESH_TOKEN: 'extracker_refresh_token',
  USER: 'extracker_user',
} as const

export interface StoredUser {
  id: string
  email: string
  name: string | null
  image: string | null
}

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, accessToken)
  await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, refreshToken)
}

export async function getTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(KEYS.ACCESS_TOKEN),
    SecureStore.getItemAsync(KEYS.REFRESH_TOKEN),
  ])
  return { accessToken, refreshToken }
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN)
  await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN)
}

export async function saveUser(user: StoredUser): Promise<void> {
  await SecureStore.setItemAsync(KEYS.USER, JSON.stringify(user))
}

export async function getUser(): Promise<StoredUser | null> {
  const raw = await SecureStore.getItemAsync(KEYS.USER)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredUser
  } catch {
    return null
  }
}

export async function clearUser(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.USER)
}
