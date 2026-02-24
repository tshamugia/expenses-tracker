import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'

/**
 * Haptic feedback utilities for the ExTracker mobile app.
 *
 * All functions are guarded with a Platform.OS check so they
 * silently no-op on web where the Haptics API is unavailable.
 */

/** Trigger a success notification haptic (e.g. mutation succeeded). */
export function hapticSuccess() {
  if (Platform.OS !== 'web') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }
}

/** Trigger an error notification haptic (e.g. mutation failed). */
export function hapticError() {
  if (Platform.OS !== 'web') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  }
}

/** Trigger a light impact haptic (e.g. toggling a read state). */
export function hapticLight() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }
}

/** Trigger a medium impact haptic (e.g. confirming a delete). */
export function hapticMedium() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }
}
