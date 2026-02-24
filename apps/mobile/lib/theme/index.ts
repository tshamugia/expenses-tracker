import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper'
import type { MD3Theme } from 'react-native-paper'

/**
 * Semantic color tokens for the app.
 * These extend Paper's MD3 themes with app-specific colors
 * that adapt to light/dark mode.
 */
export interface AppColors {
  screenBackground: string
  screenBackgroundSecondary: string
  cardBackground: string
  textPrimary: string
  textSecondary: string
  textTertiary: string
  textMuted: string
  border: string
  brandPrimary: string
  brandSecondary: string
  success: string
  error: string
  warning: string
  info: string
  headerBackground: string
  tabBarBackground: string
  chipBackground: string
  chipSelectedBackground: string
  chipText: string
  chipSelectedText: string
  divider: string
  inputBackground: string
  inputBorder: string
  refreshTint: string
  fabBackground: string
  fabText: string
}

export type AppTheme = MD3Theme & { appColors: AppColors }

const lightColors: AppColors = {
  screenBackground: '#ffffff',
  screenBackgroundSecondary: '#F9FAFB',
  cardBackground: '#ffffff',
  textPrimary: '#111827',
  textSecondary: '#374151',
  textTertiary: '#6B7280',
  textMuted: '#9CA3AF',
  border: '#F3F4F6',
  brandPrimary: '#6366F1',
  brandSecondary: '#8B5CF6',
  success: '#16A34A',
  error: '#DC2626',
  warning: '#F59E0B',
  info: '#3B82F6',
  headerBackground: '#6366F1',
  tabBarBackground: '#ffffff',
  chipBackground: '#F3F4F6',
  chipSelectedBackground: '#EEF2FF',
  chipText: '#6B7280',
  chipSelectedText: '#6366F1',
  divider: '#F3F4F6',
  inputBackground: '#F9FAFB',
  inputBorder: '#E5E7EB',
  refreshTint: '#6366F1',
  fabBackground: '#6366F1',
  fabText: '#ffffff',
}

const darkColors: AppColors = {
  screenBackground: '#0F172A',
  screenBackgroundSecondary: '#1E293B',
  cardBackground: '#1E293B',
  textPrimary: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textTertiary: '#94A3B8',
  textMuted: '#64748B',
  border: '#334155',
  brandPrimary: '#818CF8',
  brandSecondary: '#A78BFA',
  success: '#22C55E',
  error: '#EF4444',
  warning: '#FBBF24',
  info: '#60A5FA',
  headerBackground: '#1E293B',
  tabBarBackground: '#0F172A',
  chipBackground: '#334155',
  chipSelectedBackground: '#312E81',
  chipText: '#94A3B8',
  chipSelectedText: '#818CF8',
  divider: '#334155',
  inputBackground: '#1E293B',
  inputBorder: '#334155',
  refreshTint: '#818CF8',
  fabBackground: '#818CF8',
  fabText: '#ffffff',
}

export const lightTheme: AppTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#6366F1',
    secondary: '#8B5CF6',
  },
  appColors: lightColors,
}

export const darkTheme: AppTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#818CF8',
    secondary: '#A78BFA',
    surface: '#1E293B',
    background: '#0F172A',
  },
  appColors: darkColors,
}
